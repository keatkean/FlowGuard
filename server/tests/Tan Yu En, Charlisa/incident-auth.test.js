// Authorization tests for /api/incident — the Incident Dashboard is FM-only in the
// frontend (ProtectedRoute allowedRoles={ACCESS.FM_ONLY}, no Staff nav entry), so every
// administrative route here (read + write) is FM-only too. Tenants and Staff are
// rejected, and unauthenticated requests never see incident data.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.APP_SECRET = "test-secret";
process.env.AI_SERVICE_KEY = "test-service-key";

const mockIncidentLog = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
};

jest.mock("../../models", () => ({
  IncidentLog: mockIncidentLog,
}));

const incidentRouter = require("../../routes/incident");

const app = express();
app.use(express.json());
app.use("/api/incident", incidentRouter);

const token = (role) => jwt.sign({ id: 1, role }, process.env.APP_SECRET);
const fmToken = token("FM");
const staffToken = token("Staff");
const tenantToken = token("Tenant");

describe("GET /api/incident authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  test("no token returns 401", async () => {
    const res = await request(app).get("/api/incident");
    expect(res.status).toBe(401);
    expect(mockIncidentLog.findAll).not.toHaveBeenCalled();
  });

  test("Tenant returns 403", async () => {
    const res = await request(app).get("/api/incident").set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(403);
    expect(mockIncidentLog.findAll).not.toHaveBeenCalled();
  });

  test("FM returns 200", async () => {
    mockIncidentLog.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/incident").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
  });

  test("Staff returns 403 — Incident Dashboard is FM-only, matching the frontend route guard", async () => {
    const res = await request(app).get("/api/incident").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    expect(mockIncidentLog.findAll).not.toHaveBeenCalled();
  });
});

describe("GET /api/incident/:id authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  test("no token returns 401", async () => {
    const res = await request(app).get("/api/incident/1");
    expect(res.status).toBe(401);
  });

  test("Tenant returns 403", async () => {
    const res = await request(app).get("/api/incident/1").set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(403);
  });

  test("Staff cannot fetch a single incident (403)", async () => {
    const res = await request(app).get("/api/incident/1").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    expect(mockIncidentLog.findByPk).not.toHaveBeenCalled();
  });

  test("missing incident returns 404", async () => {
    mockIncidentLog.findByPk.mockResolvedValue(null);
    const res = await request(app).get("/api/incident/999").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
  });
});

describe("incident write-route authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Tenant cannot create an incident (403)", async () => {
    const res = await request(app)
      .post("/api/incident")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ camera_location: "Dock", status: "Active", source: "Manual", severity: "Low" });
    expect(res.status).toBe(403);
    expect(mockIncidentLog.create).not.toHaveBeenCalled();
  });

  test("FM can create an incident (201)", async () => {
    mockIncidentLog.create.mockResolvedValue({ id: 2 });
    const res = await request(app)
      .post("/api/incident")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_location: "Dock", status: "Active", source: "Manual", severity: "Low" });
    expect(res.status).toBe(201);
  });

  test("Staff cannot create an incident (403) — administration is FM-only", async () => {
    const res = await request(app)
      .post("/api/incident")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ camera_location: "Dock", status: "Active", source: "Manual", severity: "Low" });
    expect(res.status).toBe(403);
    expect(mockIncidentLog.create).not.toHaveBeenCalled();
  });

  test("Tenant cannot update an incident (403)", async () => {
    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ resolutionStatus: "Cleared" });
    expect(res.status).toBe(403);
  });

  test("Staff cannot update an incident (403)", async () => {
    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ resolutionStatus: "Cleared" });
    expect(res.status).toBe(403);
    expect(mockIncidentLog.findByPk).not.toHaveBeenCalled();
  });

  test("Staff cannot delete an incident (403) — deletion is FM-only", async () => {
    const res = await request(app)
      .delete("/api/incident/1")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  test("FM can delete an incident (200)", async () => {
    mockIncidentLog.findByPk.mockResolvedValue({ id: 1, destroy: jest.fn().mockResolvedValue() });
    const res = await request(app)
      .delete("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/incident/scan-frame authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unauthenticated frame scan is rejected (401)", async () => {
    const res = await request(app).post("/api/incident/scan-frame").send({});
    expect(res.status).toBe(401);
  });

  test("Tenant cannot scan frames (403)", async () => {
    const res = await request(app)
      .post("/api/incident/scan-frame")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test("service key is accepted but a missing frame still returns 400", async () => {
    const res = await request(app)
      .post("/api/incident/scan-frame")
      .set("x-service-key", "test-service-key")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/frame/i);
  });
});
