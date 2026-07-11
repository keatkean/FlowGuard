// Backend tests for /api/edge/detection-alerts — SecurePi hardware ingest.
// Edge alerts are created atomically with a linked IncidentLog so they surface
// in the Incident Dashboard with the same severity.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.EDGE_INGEST_TOKEN = "test-edge-token";
process.env.APP_SECRET = "test-secret";

const mockDetectionAlert = {
  create: jest.fn(),
};
const mockIncidentLog = {
  create: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
};
const mockMonitoringZone = { findOne: jest.fn() };
const mockCamera = { findOne: jest.fn() };
const mockTx = { id: "tx" };
const mockSequelize = { transaction: jest.fn(async (fn) => fn(mockTx)) };

jest.mock("../../models", () => ({
  DetectionAlert: mockDetectionAlert,
  IncidentLog: mockIncidentLog,
  MonitoringZone: mockMonitoringZone,
  Camera: mockCamera,
  sequelize: mockSequelize,
}));

const edgeDetectionAlertsRouter = require("../../routes/edgeDetectionAlerts");
// Mounted alongside the incident router so the test can confirm an edge-ingested
// incident is visible through the Incident Dashboard API.
const incidentRouter = require("../../routes/incident");

const app = express();
app.use(express.json());
app.use("/api/edge", edgeDetectionAlertsRouter);
app.use("/api/incident", incidentRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);

const securePiPayload = {
  zone_name: "Loading Bay",
  camera_location: "Loading Bay Camera 01",
  alert_type: "Unattended Object",
  object_class: "package-like object",
  duration_seconds: 65,
  severity: "High",
  status: "Active",
  source: "SecurePi Edge Node",
  confidence: 0.87,
  snapshot_url: "alerts/loading-bay/event.jpg",
  device_id: "securepi-loading-bay-01",
  timestamp: "2026-07-09T08:15:00.000Z",
  ignored_extra: "does not break the API",
};

const primeCreateMocks = () => {
  mockMonitoringZone.findOne.mockResolvedValue(null);
  mockCamera.findOne.mockResolvedValue(null);
  const created = { id: 9, update: jest.fn().mockResolvedValue() };
  mockDetectionAlert.create.mockResolvedValue(created);
  mockIncidentLog.create.mockResolvedValue({ id: 77 });
  return created;
};

describe("POST /api/edge/detection-alerts", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects missing bearer token (401)", async () => {
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .send(securePiPayload);
    expect(res.status).toBe(401);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });

  test("returns 503 when EDGE_INGEST_TOKEN is not configured", async () => {
    const saved = process.env.EDGE_INGEST_TOKEN;
    delete process.env.EDGE_INGEST_TOKEN;
    try {
      const res = await request(app)
        .post("/api/edge/detection-alerts")
        .set("Authorization", "Bearer test-edge-token")
        .send(securePiPayload);
      expect(res.status).toBe(503);
      expect(mockDetectionAlert.create).not.toHaveBeenCalled();
    } finally {
      process.env.EDGE_INGEST_TOKEN = saved;
    }
  });

  test("rejects wrong bearer token (401)", async () => {
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer wrong-token")
      .send(securePiPayload);
    expect(res.status).toBe(401);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });

  test("accepts SecurePi alert metadata with EDGE_INGEST_TOKEN (201)", async () => {
    primeCreateMocks();
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send(securePiPayload);
    expect(res.status).toBe(201);
    expect(mockDetectionAlert.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      source: "SecurePi Edge Node",
      alert_type: "Unattended Object",
      object_class: "package-like object",
      severity: "High",
      confidence: 0.87,
      snapshot_url: "alerts/loading-bay/event.jpg",
      device_id: "securepi-loading-bay-01",
      duration_seconds: 65,
    }));
    expect(mockDetectionAlert.create.mock.calls[0][0]).not.toHaveProperty("ignored_extra");
  });

  test("creates both records with matching severity, linked, in one transaction", async () => {
    const created = primeCreateMocks();
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send({ ...securePiPayload, severity: undefined, duration_seconds: 400 });
    expect(res.status).toBe(201);
    // 400s with no explicit severity → High in BOTH records
    expect(mockDetectionAlert.create.mock.calls[0][0].severity).toBe("High");
    expect(mockIncidentLog.create.mock.calls[0][0].severity).toBe("High");
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(mockDetectionAlert.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(mockIncidentLog.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(created.update).toHaveBeenCalledWith({ incident_log_id: 77 }, { transaction: mockTx });
  });

  test("incident creation failure rolls back the detection alert (500, shared transaction)", async () => {
    primeCreateMocks();
    mockIncidentLog.create.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send(securePiPayload);
    expect(res.status).toBe(500);
    expect(mockDetectionAlert.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });

  test("edge-ingested incident is visible through the Incident Dashboard API", async () => {
    primeCreateMocks();
    const ingest = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send(securePiPayload);
    expect(ingest.status).toBe(201);

    // The dashboard lists whatever IncidentLog holds — return the row the bridge created.
    const bridged = mockIncidentLog.create.mock.calls[0][0];
    mockIncidentLog.findAll.mockResolvedValue([{ id: 77, ...bridged }]);
    const res = await request(app)
      .get("/api/incident")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual(expect.objectContaining({
      camera_location: "Loading Bay Camera 01",
      severity: "High",
      source: "Object Detection",
      resolutionStatus: "Active",
    }));
  });

  test("rejects invalid severity (400)", async () => {
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send({ ...securePiPayload, severity: "Emergency" });
    expect(res.status).toBe(400);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });

  test("requires zone_name and camera_location (400)", async () => {
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send({ object_class: "package-like object" });
    expect(res.status).toBe(400);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });
});
