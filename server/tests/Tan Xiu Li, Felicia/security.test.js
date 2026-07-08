// Backend tests — Security Logs & FM manual review workflow (Felicia)
// Covers: auth protection, automatic review-status on create, FM-only review update,
// non-FM rejection, and validation of the review status value.
const request = require("supertest");
const express = require("express");

const mockSecurityLog = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock("../../models", () => ({
  SecurityLog: mockSecurityLog,
  sequelize: { query: jest.fn(), QueryTypes: { SELECT: "SELECT" } },
}));

process.env.APP_SECRET = "test-secret";

const jwt = require("jsonwebtoken");
const securityRouter = require("../../routes/security");

const app = express();
app.use(express.json());
app.use("/api/security", securityRouter);

const tokenFor = (role, extra = {}) =>
  jwt.sign({ id: 1, role, email: `${role}@harrison.com`, ...extra }, process.env.APP_SECRET);

describe("Security log routes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects unauthenticated access (no token) with 401", async () => {
    const res = await request(app).get("/api/security/logs");
    expect(res.status).toBe(401);
  });

  test("GET /logs returns an array for an authenticated user", async () => {
    mockSecurityLog.findAll.mockResolvedValue([{ id: "a", type: "Gantry Access" }]);
    const res = await request(app)
      .get("/api/security/logs")
      .set("Authorization", `Bearer ${tokenFor("FM")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /logs?status rejects an invalid status filter with 400", async () => {
    const res = await request(app)
      .get("/api/security/logs?status=Nonsense")
      .set("Authorization", `Bearer ${tokenFor("FM")}`);
    expect(res.status).toBe(400);
  });

  test("POST /logs auto-resolves safe events", async () => {
    mockSecurityLog.create.mockResolvedValue({ id: "x" });
    await request(app)
      .post("/api/security/logs")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ time: "now", type: "Gantry Access", desc: "ok", severity: "safe", icon: "🔓" });
    expect(mockSecurityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "Resolved" })
    );
  });

  test("POST /logs flags critical events for review", async () => {
    mockSecurityLog.create.mockResolvedValue({ id: "y" });
    await request(app)
      .post("/api/security/logs")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ time: "now", type: "Intrusion Alert", desc: "bad", severity: "critical", icon: "🚨" });
    expect(mockSecurityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "Pending Review" })
    );
  });

  test("PATCH /logs/:id/review updates status + notes for an FM", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockSecurityLog.findByPk.mockResolvedValue({ id: "z", update });
    const res = await request(app)
      .patch("/api/security/logs/z/review")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ reviewStatus: "Escalated", reviewNotes: "Calling security." });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: "Escalated", reviewNotes: "Calling security." })
    );
  });

  test("PATCH /logs/:id/review blocks a non-FM user with 403", async () => {
    const res = await request(app)
      .patch("/api/security/logs/z/review")
      .set("Authorization", `Bearer ${tokenFor("Staff")}`)
      .send({ reviewStatus: "Resolved" });
    expect(res.status).toBe(403);
  });

  test("PATCH /logs/:id/review rejects an invalid status with 400", async () => {
    const res = await request(app)
      .patch("/api/security/logs/z/review")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ reviewStatus: "Whatever" });
    expect(res.status).toBe(400);
  });
});

describe("GET /logs/user/:id — ownership", () => {
  const { sequelize } = require("../../models"); // the mocked sequelize.query
  beforeEach(() => jest.clearAllMocks());

  test("FM can view any user's logs (200)", async () => {
    sequelize.query.mockResolvedValueOnce([{ id: 5, name: "Worker", managerId: 99, role: "Staff" }]);
    mockSecurityLog.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/security/logs/user/5").set("Authorization", `Bearer ${tokenFor("FM")}`);
    expect(res.status).toBe(200);
  });

  test("Tenant can view logs for their OWN staff (200)", async () => {
    // tenant token id = 1; staff.managerId = 1 → owned
    sequelize.query.mockResolvedValueOnce([{ id: 5, name: "Worker", managerId: 1, role: "Staff" }]);
    mockSecurityLog.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/security/logs/user/5").set("Authorization", `Bearer ${tokenFor("Tenant")}`);
    expect(res.status).toBe(200);
  });

  test("Tenant CANNOT view another tenant's staff logs (403)", async () => {
    sequelize.query.mockResolvedValueOnce([{ id: 5, name: "Worker", managerId: 2, role: "Staff" }]);
    const res = await request(app).get("/api/security/logs/user/5").set("Authorization", `Bearer ${tokenFor("Tenant")}`);
    expect(res.status).toBe(403);
  });

  test("Staff CANNOT view other users' logs (403)", async () => {
    sequelize.query.mockResolvedValueOnce([{ id: 5, name: "Worker", managerId: 1, role: "Staff" }]);
    const res = await request(app).get("/api/security/logs/user/5").set("Authorization", `Bearer ${tokenFor("Staff")}`);
    expect(res.status).toBe(403);
  });

  test("missing user returns 404", async () => {
    sequelize.query.mockResolvedValueOnce([]);
    const res = await request(app).get("/api/security/logs/user/999").set("Authorization", `Bearer ${tokenFor("FM")}`);
    expect(res.status).toBe(404);
  });
});
