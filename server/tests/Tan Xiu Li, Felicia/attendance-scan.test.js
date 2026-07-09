// Backend tests — hardened POST /api/attendance/scan.
// The endpoint no longer trusts a submitted name: identity is a server-verified
// unique userId, and unauthenticated/public requests are rejected.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const mockAttendance = { findAll: jest.fn(), create: jest.fn() };
const mockUser = { findByPk: jest.fn(), findOne: jest.fn() };
jest.mock("../../models", () => ({ Attendance: mockAttendance, User: mockUser }));

process.env.APP_SECRET = "test-secret";
process.env.AI_SERVICE_KEY = "test-ai-key";

const attendanceRouter = require("../../routes/attendance");

const app = express();
app.use(express.json());
app.use("/api/attendance", attendanceRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);
const staffToken = jwt.sign({ id: 60, role: "Staff" }, process.env.APP_SECRET);

const activeUser = { id: 25, name: "Tan Xiu Li, Felicia", role: "Staff", isActive: true, isEnrolled: true };

describe("POST /api/attendance/scan — authentication", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unauthenticated public request → 401", async () => {
    const res = await request(app).post("/api/attendance/scan").send({ userId: 25 });
    expect(res.status).toBe(401);
    expect(mockAttendance.create).not.toHaveBeenCalled();
  });

  test("Staff session → 403 (FM or trusted service only)", async () => {
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ userId: 25 });
    expect(res.status).toBe(403);
  });

  test("trusted service key (x-service-key) is accepted without a JWT", async () => {
    mockUser.findByPk.mockResolvedValue(activeUser);
    mockAttendance.findAll.mockResolvedValue([]);
    mockAttendance.create.mockResolvedValue({ timestamp: new Date(), type: "IN" });

    const res = await request(app)
      .post("/api/attendance/scan")
      .set("x-service-key", "test-ai-key")
      .send({ userId: 25 });
    expect(res.status).toBe(200);
  });

  test("wrong service key without JWT → 401", async () => {
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("x-service-key", "wrong-key")
      .send({ userId: 25 });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/attendance/scan — identity & account checks", () => {
  beforeEach(() => jest.clearAllMocks());

  test("identity is resolved by unique ID, never by name (duplicate-name safety)", async () => {
    mockUser.findByPk.mockResolvedValue(activeUser);
    mockAttendance.findAll.mockResolvedValue([]);
    mockAttendance.create.mockResolvedValue({ timestamp: new Date(), type: "IN" });

    await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });

    expect(mockUser.findByPk).toHaveBeenCalledWith(25);
    expect(mockUser.findOne).not.toHaveBeenCalled(); // no name-based lookup
  });

  test("legacy name-only payload is rejected with 400", async () => {
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ name: "Tan Xiu Li, Felicia" });
    expect(res.status).toBe(400);
    expect(mockAttendance.create).not.toHaveBeenCalled();
  });

  test("nonexistent userId → 404", async () => {
    mockUser.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 9999 });
    expect(res.status).toBe(404);
  });

  test("suspended user → 403 and no attendance record", async () => {
    mockUser.findByPk.mockResolvedValue({ ...activeUser, isActive: false });
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });
    expect(res.status).toBe(403);
    expect(mockAttendance.create).not.toHaveBeenCalled();
  });

  test("non-enrolled user → 403 and no attendance record", async () => {
    mockUser.findByPk.mockResolvedValue({ ...activeUser, isEnrolled: false });
    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });
    expect(res.status).toBe(403);
    expect(mockAttendance.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/attendance/scan — clock-in/out behaviour", () => {
  beforeEach(() => jest.clearAllMocks());

  test("recognised active user with no log today → CLOCK_IN + safe fields returned", async () => {
    mockUser.findByPk.mockResolvedValue(activeUser);
    mockAttendance.findAll.mockResolvedValue([]);
    const ts = new Date();
    mockAttendance.create.mockResolvedValue({ timestamp: ts, type: "IN" });

    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("CLOCK_IN_SUCCESSFUL");
    expect(res.body.worker).toBe("Tan Xiu Li, Felicia");
    expect(res.body.role).toBe("Staff");
    expect(res.body.timestamp).toBeDefined();
    expect(mockAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 25, type: "IN" })
    );
    // Never leak biometric data through the scan response.
    expect(JSON.stringify(res.body)).not.toMatch(/faceVector|embedding/i);
  });

  test("already clocked in today → CLOCK_OUT on second scan", async () => {
    mockUser.findByPk.mockResolvedValue(activeUser);
    mockAttendance.findAll.mockResolvedValue([{ type: "IN", timestamp: new Date() }]);
    mockAttendance.create.mockResolvedValue({ timestamp: new Date(), type: "OUT" });

    const res = await request(app)
      .post("/api/attendance/scan")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25 });

    expect(res.body.action).toBe("CLOCK_OUT_SUCCESSFUL");
    expect(mockAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 25, type: "OUT" })
    );
  });
});
