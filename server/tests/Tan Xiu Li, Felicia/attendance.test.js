// Backend tests — /api/attendance/logs role scoping.
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockAttendance = { findAll: jest.fn() };
jest.mock("../../models", () => ({ Attendance: mockAttendance, User: {} }));

process.env.APP_SECRET = "test-secret";

const attendanceRouter = require("../../routes/attendance");

const app = express();
app.use(express.json());
app.use("/api/attendance", attendanceRouter);

const tokenFor = (role, id) => jwt.sign({ id, role }, process.env.APP_SECRET);

describe("GET /api/attendance/logs — role scoping", () => {
  beforeEach(() => jest.clearAllMocks());

  test("no token → 401", async () => {
    const res = await request(app).get("/api/attendance/logs");
    expect(res.status).toBe(401);
  });

  test("Staff receives OWN records only (where userId === self)", async () => {
    mockAttendance.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/attendance/logs").set("Authorization", `Bearer ${tokenFor("Staff", 60)}`);
    expect(res.status).toBe(200);
    expect(mockAttendance.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 60 } }));
  });

  test("FM receives all records (no top-level userId filter)", async () => {
    mockAttendance.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/attendance/logs").set("Authorization", `Bearer ${tokenFor("FM", 1)}`);
    expect(res.status).toBe(200);
    expect(mockAttendance.findAll.mock.calls[0][0].where).toBeUndefined();
  });

  test("Tenant receives a scoped query (own staff via included User filter)", async () => {
    mockAttendance.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/attendance/logs").set("Authorization", `Bearer ${tokenFor("Tenant", 50)}`);
    expect(res.status).toBe(200);
    expect(mockAttendance.findAll.mock.calls[0][0].include[0].where).toBeDefined();
  });
});
