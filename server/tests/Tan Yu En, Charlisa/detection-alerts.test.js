// Backend tests for /api/detection-alerts — AI engine posts via a shared service key,
// FM/Staff view and act on alerts via JWT, and alerts resolve camera/zone links.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.APP_SECRET = "test-secret";
process.env.AI_SERVICE_KEY = "test-service-key";

const mockDetectionAlert = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
};
const mockMonitoringZone = { findOne: jest.fn() };
const mockCamera = { findOne: jest.fn() };

jest.mock("../../models", () => ({
  DetectionAlert: mockDetectionAlert,
  MonitoringZone: mockMonitoringZone,
  Camera: mockCamera,
}));

const detectionAlertsRouter = require("../../routes/detectionAlerts");

const app = express();
app.use(express.json());
app.use("/api/detection-alerts", detectionAlertsRouter);

const token = (role) => jwt.sign({ id: 1, role }, process.env.APP_SECRET);
const fmToken = token("FM");
const staffToken = token("Staff");
const tenantToken = token("Tenant");

const alertPayload = { zone_name: "Zone A", camera_location: "Loading Bay", object_class: "person" };

describe("GET /api/detection-alerts", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unauthenticated user cannot view alerts (401)", async () => {
    const res = await request(app).get("/api/detection-alerts");
    expect(res.status).toBe(401);
  });

  test("Staff can view alerts (200)", async () => {
    mockDetectionAlert.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/detection-alerts").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/detection-alerts (AI engine service key)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("valid AI_SERVICE_KEY header succeeds without a JWT (201)", async () => {
    mockMonitoringZone.findOne.mockResolvedValue(null);
    mockCamera.findOne.mockResolvedValue(null);
    mockDetectionAlert.create.mockResolvedValue({ id: 1, ...alertPayload });
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send(alertPayload);
    expect(res.status).toBe(201);
  });

  test("missing service key and no JWT returns 401", async () => {
    const res = await request(app).post("/api/detection-alerts").send(alertPayload);
    expect(res.status).toBe(401);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });

  test("wrong service key and no JWT returns 401 (cannot bypass with a bad key)", async () => {
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "not-the-real-key")
      .send(alertPayload);
    expect(res.status).toBe(401);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });

  test("FM/Staff JWT can also create a manual alert (201)", async () => {
    mockMonitoringZone.findOne.mockResolvedValue(null);
    mockCamera.findOne.mockResolvedValue(null);
    mockDetectionAlert.create.mockResolvedValue({ id: 2, ...alertPayload });
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("Authorization", `Bearer ${fmToken}`)
      .send(alertPayload);
    expect(res.status).toBe(201);
  });

  test("missing zone_name/camera_location returns 400", async () => {
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send({ object_class: "person" });
    expect(res.status).toBe(400);
  });

  test("resolves zone_id and camera_id when a matching zone/camera exists", async () => {
    mockMonitoringZone.findOne.mockResolvedValue({ id: 7 });
    mockCamera.findOne.mockResolvedValue({ id: 3 });
    mockDetectionAlert.create.mockResolvedValue({ id: 4, ...alertPayload, zone_id: 7, camera_id: 3 });
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send(alertPayload);
    expect(res.status).toBe(201);
    expect(mockDetectionAlert.create).toHaveBeenCalledWith(expect.objectContaining({ zone_id: 7, camera_id: 3 }));
  });
});

describe("PUT /api/detection-alerts/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Staff can acknowledge/clear an alert (200)", async () => {
    const instance = { id: 1, update: jest.fn().mockResolvedValue() };
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(200);
  });

  test("Tenant cannot act on alerts (403)", async () => {
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(403);
  });
});
