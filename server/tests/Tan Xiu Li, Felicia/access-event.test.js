// Backend tests — POST /api/facial-recognition/access-event.
// V-Patrol's server-owned access audit: writes the deduplicated safe log for a
// verified active user WITHOUT creating or toggling any attendance record.
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockUser = { findByPk: jest.fn() };
const mockSecurityLog = { create: jest.fn() };
const mockAttendance = { findAll: jest.fn(), create: jest.fn() };
jest.mock("../../models", () => ({
  User: mockUser,
  SecurityLog: mockSecurityLog,
  Attendance: mockAttendance,
}));

jest.mock("axios", () => ({ post: jest.fn() }));

process.env.APP_SECRET = "test-secret";

const facialRecognitionRouter = require("../../routes/facialRecognition");
const { resetLogCooldowns } = require("../../services/securityAudit");

const app = express();
app.use(express.json());
app.use("/api/facial-recognition", facialRecognitionRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);
const staffToken = jwt.sign({ id: 60, role: "Staff" }, process.env.APP_SECRET);

const activeUser = { id: 25, name: "Tan Xiu Li, Felicia", role: "Staff", isActive: true, isEnrolled: true };

// verifyToken is now DB-backed: it re-reads the authenticated account by the
// JWT's id via User.findByPk. Key the mock by id so BOTH the middleware lookup
// (auth ids 1/60) and the route-level lookup (target userId) resolve correctly.
const AUTH_USERS = {
  1: { id: 1, role: "FM", isActive: true },
  60: { id: 60, role: "Staff", isActive: true },
};
const primeDb = (extra = {}) => {
  const table = { ...AUTH_USERS, ...extra };
  mockUser.findByPk.mockImplementation((id) => Promise.resolve(table[id] ?? null));
};

describe("POST /api/facial-recognition/access-event", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLogCooldowns();
    primeDb();
    mockSecurityLog.create.mockResolvedValue({});
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app).post("/api/facial-recognition/access-event").send({ userId: 25 });
    expect(res.status).toBe(401);
  });

  test("Staff session → 403 (FM kiosk or edge service only)", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/access-event")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ userId: 25 });
    expect(res.status).toBe(403);
  });

  test("verified active user → safe access log, NO attendance record", async () => {
    primeDb({ 25: activeUser });

    const res = await request(app)
      .post("/api/facial-recognition/access-event")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25, cameraLocation: "Biometric Gantry" });

    expect(res.status).toBe(200);
    expect(res.body.logged).toBe(true);
    expect(res.body.worker).toBe("Tan Xiu Li, Felicia");
    // The audit log is written…
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
    const log = mockSecurityLog.create.mock.calls[0][0];
    expect(log.type).toBe("Gantry Access");
    expect(log.severity).toBe("safe");
    expect(log.matchedUserId).toBe(25);
    expect(log.cameraLocation).toBe("Biometric Gantry");
    // …but V-Patrol must NOT touch attendance (no clock-in/out).
    expect(mockAttendance.create).not.toHaveBeenCalled();
    expect(mockAttendance.findAll).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toMatch(/faceVector|embedding/i);
  });

  test("repeated events within the cooldown are deduplicated", async () => {
    primeDb({ 25: activeUser });
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/facial-recognition/access-event")
        .set("Authorization", `Bearer ${fmToken}`)
        .send({ userId: 25, cameraLocation: "Biometric Gantry" });
    }
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
  });

  test("suspended user → 403 and no safe log", async () => {
    primeDb({ 25: { ...activeUser, isActive: false } });
    const res = await request(app)
      .post("/api/facial-recognition/access-event")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });
    expect(res.status).toBe(403);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("unknown / non-enrolled userId → 404", async () => {
    primeDb({ 9999: null }); // FM auth account still resolves; target id does not
    const res = await request(app)
      .post("/api/facial-recognition/access-event")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 9999 });
    expect(res.status).toBe(404);
  });

  test("missing userId → 400", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/access-event")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
