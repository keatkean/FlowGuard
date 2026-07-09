// Backend tests for /api/edge/detection-alerts — SecurePi hardware ingest.
const request = require("supertest");
const express = require("express");

process.env.EDGE_INGEST_TOKEN = "test-edge-token";

const mockDetectionAlert = {
  create: jest.fn(),
};
const mockMonitoringZone = { findOne: jest.fn() };
const mockCamera = { findOne: jest.fn() };

jest.mock("../../models", () => ({
  DetectionAlert: mockDetectionAlert,
  MonitoringZone: mockMonitoringZone,
  Camera: mockCamera,
}));

const edgeDetectionAlertsRouter = require("../../routes/edgeDetectionAlerts");

const app = express();
app.use(express.json());
app.use("/api/edge", edgeDetectionAlertsRouter);

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

describe("POST /api/edge/detection-alerts", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects missing bearer token (401)", async () => {
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .send(securePiPayload);
    expect(res.status).toBe(401);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
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
    mockMonitoringZone.findOne.mockResolvedValue(null);
    mockCamera.findOne.mockResolvedValue(null);
    mockDetectionAlert.create.mockResolvedValue({ id: 9, ...securePiPayload });
    const res = await request(app)
      .post("/api/edge/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send(securePiPayload);
    expect(res.status).toBe(201);
    expect(mockDetectionAlert.create).toHaveBeenCalledWith(expect.objectContaining({
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
