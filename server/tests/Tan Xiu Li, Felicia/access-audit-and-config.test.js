// Backend tests — server-owned access logs after a verified attendance scan,
// isEnrolled in safe user responses, non-fatal offboarding cache refresh, and
// cloud-compatible server binding.
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockAttendance = { findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() };
const mockUser = {
  findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(),
  create: jest.fn(), update: jest.fn(),
};
const mockSecurityLog = { create: jest.fn(), update: jest.fn() };
// Off-boarding runs inside sequelize.transaction and anonymises Booking rows,
// so the mocked models must expose both. The transaction mock just runs the
// callback with a stand-in transaction handle.
const mockBooking = { update: jest.fn(async () => [0]) };
const mockSequelize = { transaction: jest.fn(async (cb) => cb({ mocked: true })) };
jest.mock("../../models", () => ({
  Attendance: mockAttendance,
  User: mockUser,
  SecurityLog: mockSecurityLog,
  Booking: mockBooking,
  Invite: { findOne: jest.fn(), create: jest.fn() },
  EvaluationParticipant: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  sequelize: mockSequelize,
}));

const mockAxios = {
  post: jest.fn(() => Promise.resolve({ data: { vector: Array(512).fill(0.1) } })),
  get: jest.fn(() => Promise.resolve({ data: { message: "ok" } })),
};
jest.mock("axios", () => mockAxios);

process.env.APP_SECRET = "test-secret";

const attendanceRouter = require("../../routes/attendance");
const userRouter = require("../../routes/user");
const { resetLogCooldowns } = require("../../services/securityAudit");
const { resolvePort, resolveHost } = require("../../config/serverConfig");

const app = express();
app.use(express.json());
app.use("/api/attendance", attendanceRouter);
app.use("/user", userRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);

const activeUser = { id: 25, name: "Tan Xiu Li, Felicia", role: "Staff", isActive: true, isEnrolled: true };

// verifyToken is DB-backed: findByPk(1) authenticates the FM requester, while
// findByPk(25) is the route-level lookup of the scanned user — so the mock must
// be keyed by id instead of a blanket mockResolvedValue.
const fmAccount = { id: 1, role: "FM", isActive: true };
const scanUserTable = (scanned) =>
  mockUser.findByPk.mockImplementation((id) =>
    Promise.resolve(Number(id) === 1 ? fmAccount : scanned)
  );

describe("POST /api/attendance/scan — server-owned safe access log", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLogCooldowns();
  });

  test("successful verified scan creates attendance AND a server access log", async () => {
    scanUserTable(activeUser);
    mockAttendance.findAll.mockResolvedValue([]);
    mockAttendance.create.mockResolvedValue({ timestamp: new Date(), type: "IN" });

    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25, cameraLocation: "Biometric Gantry" });

    expect(res.status).toBe(200);
    expect(mockAttendance.create).toHaveBeenCalled();
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
    const log = mockSecurityLog.create.mock.calls[0][0];
    expect(log.type).toBe("Gantry Access");
    expect(log.severity).toBe("safe");
    expect(log.personnelName).toBe("Tan Xiu Li, Felicia");
    expect(log.matchedUserId).toBe(25);
    expect(log.cameraLocation).toBe("Biometric Gantry");
    expect(log.reviewStatus).toBe("Resolved");
    expect(JSON.stringify(log)).not.toMatch(/faceVector|embedding/i);
  });

  test("repeated scans within the cooldown do not duplicate the access log", async () => {
    scanUserTable(activeUser);
    mockAttendance.findAll.mockResolvedValue([]);
    mockAttendance.create.mockResolvedValue({ timestamp: new Date(), type: "IN" });

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/attendance/scan")
        .set("Authorization", `Bearer ${fmToken}`)
        .send({ userId: 25, cameraLocation: "Biometric Gantry" });
    }
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
  });

  test("denied scan (suspended user) creates NO safe access log here", async () => {
    // The requester (FM) stays active; only the SCANNED user is suspended, so
    // the 403 is the route's gate denial — not a middleware auth failure.
    scanUserTable({ ...activeUser, isActive: false });
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });
    expect(res.status).toBe(403);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });
});

describe("Safe user responses include isEnrolled (never the template)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("GET /user selects isEnrolled but NOT faceVector", async () => {
    mockUser.findByPk.mockResolvedValue({ id: 1, role: "FM", isActive: true });
    mockUser.findAll.mockResolvedValue([]);
    const res = await request(app).get("/user").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    const attrs = mockUser.findAll.mock.calls[0][0].attributes;
    expect(attrs).toContain("isEnrolled");
    expect(attrs).not.toContain("faceVector");
  });

  test("GET /user/my-staff selects isEnrolled but NOT faceVector", async () => {
    const tenantToken = jwt.sign({ id: 50, role: "Tenant" }, process.env.APP_SECRET);
    mockUser.findByPk.mockResolvedValue({ id: 50, role: "Tenant", isActive: true });
    mockUser.findAll.mockResolvedValue([]);
    const res = await request(app).get("/user/my-staff").set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    const attrs = mockUser.findAll.mock.calls[0][0].attributes;
    expect(attrs).toContain("isEnrolled");
    expect(attrs).not.toContain("faceVector");
  });
});

describe("DELETE /user/:id — offboarding refreshes the AI cache non-fatally", () => {
  const target = {
    id: 60, name: "Leaving Staff", managerId: 50,
    update: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // findByPk is called for the requester (authenticateToken) AND the target.
    mockUser.findByPk.mockImplementation((id) =>
      Promise.resolve(String(id) === "60" ? target : { id: 1, role: "FM", isActive: true })
    );
    mockAttendance.destroy.mockResolvedValue(1);
    mockSecurityLog.update.mockResolvedValue([0]);
  });

  test("offboarding requests a FastAPI /refresh so the wiped template leaves the cache", async () => {
    const res = await request(app).delete("/user/60").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    // Same wipe payload as before — now performed inside the off-boarding transaction.
    expect(target.update).toHaveBeenCalledWith(
      { faceVector: null, isEnrolled: false },
      expect.objectContaining({ transaction: expect.anything() })
    );
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/refresh$/),
      expect.objectContaining({ headers: expect.objectContaining({ "X-AI-Service-Key": expect.any(String) }) })
    );
  });

  test("a failed refresh is NON-FATAL — offboarding still succeeds", async () => {
    mockAxios.get.mockRejectedValueOnce(new Error("AI offline"));
    const res = await request(app).delete("/user/60").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(target.destroy).toHaveBeenCalled();
  });
});

describe("Cloud server binding", () => {
  test("PORT (cloud) wins, then APP_PORT, then 5001", () => {
    expect(resolvePort({ PORT: "8080", APP_PORT: "5001" })).toBe(8080);
    expect(resolvePort({ APP_PORT: "5001" })).toBe(5001);
    expect(resolvePort({})).toBe(5001);
  });

  test("binds 0.0.0.0 by default — never exclusively 127.0.0.1", () => {
    expect(resolveHost({})).toBe("0.0.0.0");
    expect(resolveHost({ HOST: "127.0.0.1" })).toBe("127.0.0.1"); // explicit override allowed
  });
});
