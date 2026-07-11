// Backend tests for /api/detection-alerts — AI engine posts via a shared service key,
// FM/Staff view and act on alerts via JWT, and alerts resolve camera/zone links.
// Every alert is created atomically with a linked IncidentLog (incident_log_id), and
// updates/deletes keep the linked incident consistent.
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
const mockIncidentLog = {
  findByPk: jest.fn(),
  create: jest.fn(),
};
const mockMonitoringZone = { findOne: jest.fn() };
const mockCamera = { findOne: jest.fn() };
// Managed-transaction mock: runs the callback with a sentinel transaction object and
// rejects (→ rollback in production) when the callback throws.
const mockTx = { id: "tx" };
const mockSequelize = { transaction: jest.fn(async (fn) => fn(mockTx)) };

jest.mock("../../models", () => ({
  DetectionAlert: mockDetectionAlert,
  IncidentLog: mockIncidentLog,
  MonitoringZone: mockMonitoringZone,
  Camera: mockCamera,
  sequelize: mockSequelize,
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

const makeAlertInstance = (overrides = {}) => ({
  id: 1,
  incident_log_id: 55,
  update: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  ...overrides,
});

const makeIncidentInstance = (overrides = {}) => ({
  id: 55,
  resolutionStatus: "Active",
  update: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  ...overrides,
});

// Default happy-path create mocks: DetectionAlert.create returns an instance whose
// .update records the incident link; IncidentLog.create returns the linked incident.
const primeCreateMocks = () => {
  mockMonitoringZone.findOne.mockResolvedValue(null);
  mockCamera.findOne.mockResolvedValue(null);
  const created = makeAlertInstance({ incident_log_id: null });
  mockDetectionAlert.create.mockResolvedValue(created);
  mockIncidentLog.create.mockResolvedValue({ id: 55 });
  return created;
};

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

describe("GET /api/detection-alerts/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can fetch a single alert by valid id (200)", async () => {
    mockDetectionAlert.findByPk.mockResolvedValue({ id: 4, zone_name: "Zone A" });
    const res = await request(app).get("/api/detection-alerts/4").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(4);
  });

  test("missing alert returns 404", async () => {
    mockDetectionAlert.findByPk.mockResolvedValue(null);
    const res = await request(app).get("/api/detection-alerts/999").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
  });

  test("non-numeric id is handled cleanly (404, no DB lookup)", async () => {
    const res = await request(app).get("/api/detection-alerts/not-a-number").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
    expect(mockDetectionAlert.findByPk).not.toHaveBeenCalled();
  });

  test("Tenant cannot fetch an alert (403)", async () => {
    const res = await request(app).get("/api/detection-alerts/4").set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(403);
  });

  test("unauthenticated request returns 401", async () => {
    const res = await request(app).get("/api/detection-alerts/4");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/detection-alerts (AI engine service key)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("valid AI_SERVICE_KEY header succeeds without a JWT (201)", async () => {
    primeCreateMocks();
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

  test("edge token header cannot bypass the normal protected alert route", async () => {
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("Authorization", "Bearer test-edge-token")
      .send(alertPayload);
    expect(res.status).toBe(403);
    expect(mockDetectionAlert.create).not.toHaveBeenCalled();
  });

  test("FM/Staff JWT can also create a manual alert (201)", async () => {
    primeCreateMocks();
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
    primeCreateMocks();
    mockMonitoringZone.findOne.mockResolvedValue({ id: 7 });
    mockCamera.findOne.mockResolvedValue({ id: 3 });
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send(alertPayload);
    expect(res.status).toBe(201);
    expect(mockDetectionAlert.create.mock.calls[0][0]).toEqual(expect.objectContaining({ zone_id: 7, camera_id: 3 }));
  });

  test("duration 400s with no explicit severity derives High in BOTH records", async () => {
    primeCreateMocks();
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send({ ...alertPayload, duration_seconds: 400 });
    expect(res.status).toBe(201);
    expect(mockDetectionAlert.create.mock.calls[0][0].severity).toBe("High");
    expect(mockIncidentLog.create.mock.calls[0][0].severity).toBe("High");
  });

  test("explicit severity Critical is used in BOTH records", async () => {
    primeCreateMocks();
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send({ ...alertPayload, severity: "Critical", duration_seconds: 10 });
    expect(res.status).toBe(201);
    expect(mockDetectionAlert.create.mock.calls[0][0].severity).toBe("Critical");
    expect(mockIncidentLog.create.mock.calls[0][0].severity).toBe("Critical");
  });

  test("alert and incident are created in one transaction and linked", async () => {
    const created = primeCreateMocks();
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send(alertPayload);
    expect(res.status).toBe(201);
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(mockDetectionAlert.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(mockIncidentLog.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(created.update).toHaveBeenCalledWith({ incident_log_id: 55 }, { transaction: mockTx });
  });

  test("incident creation failure rolls back: 500 and both creates share the transaction", async () => {
    primeCreateMocks();
    mockIncidentLog.create.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .post("/api/detection-alerts")
      .set("x-service-key", "test-service-key")
      .send(alertPayload);
    expect(res.status).toBe(500);
    // The alert create ran inside the SAME transaction that the failure aborts,
    // so the detection alert cannot survive the incident failure.
    expect(mockDetectionAlert.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/detection-alerts/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Staff can acknowledge/clear an alert (200)", async () => {
    mockDetectionAlert.findByPk.mockResolvedValue(makeAlertInstance());
    mockIncidentLog.findByPk.mockResolvedValue(makeIncidentInstance());
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(200);
  });

  test("Staff can mark an alert investigating (200) and the linked incident follows", async () => {
    const instance = makeAlertInstance();
    const incident = makeIncidentInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "Investigating" });
    expect(res.status).toBe(200);
    expect(instance.update.mock.calls[0][0]).toEqual({ status: "Investigating" });
    expect(incident.update.mock.calls[0][0]).toEqual({ resolutionStatus: "Investigating" });
  });

  test("Escalated maps to the incident's 'Escalated to Security' resolution", async () => {
    const instance = makeAlertInstance();
    const incident = makeIncidentInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Escalated" });
    expect(res.status).toBe(200);
    expect(incident.update.mock.calls[0][0]).toEqual({ resolutionStatus: "Escalated to Security" });
  });

  test("updating severity changes both linked records", async () => {
    const instance = makeAlertInstance();
    const incident = makeIncidentInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ severity: "Critical" });
    expect(res.status).toBe(200);
    expect(instance.update.mock.calls[0][0]).toEqual({ severity: "Critical" });
    expect(incident.update.mock.calls[0][0]).toEqual({ severity: "Critical" });
  });

  test("updating person_name changes both linked records", async () => {
    const instance = makeAlertInstance();
    const incident = makeIncidentInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ person_name: "Jia Wei" });
    expect(res.status).toBe(200);
    expect(instance.update.mock.calls[0][0]).toEqual({ person_name: "Jia Wei" });
    expect(incident.update.mock.calls[0][0]).toEqual({ person_name: "Jia Wei" });
  });

  test("an older alert with no linked incident is handled safely (200)", async () => {
    const instance = makeAlertInstance({ incident_log_id: null });
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(200);
    expect(instance.update.mock.calls[0][0]).toEqual({ status: "Cleared" });
    expect(mockIncidentLog.findByPk).not.toHaveBeenCalled();
  });

  test("a linked incident that no longer exists is handled safely (200)", async () => {
    const instance = makeAlertInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    mockIncidentLog.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(200);
  });

  test("invalid alert status is rejected (400)", async () => {
    const instance = makeAlertInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "Waiting Around" });
    expect(res.status).toBe(400);
    expect(instance.update).not.toHaveBeenCalled();
  });

  test("invalid severity is rejected (400)", async () => {
    const instance = makeAlertInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ severity: "Emergency" });
    expect(res.status).toBe(400);
    expect(instance.update).not.toHaveBeenCalled();
  });

  test("unsupported fields are rejected, not silently ignored (400)", async () => {
    const instance = makeAlertInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Cleared", camera_location: "Moved Camera" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/camera_location/);
    expect(instance.update).not.toHaveBeenCalled();
  });

  test("missing alert returns 404", async () => {
    mockDetectionAlert.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .put("/api/detection-alerts/999")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(404);
  });

  test("Tenant cannot act on alerts (403)", async () => {
    const res = await request(app)
      .put("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ status: "Cleared" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/detection-alerts/:id (false alarm)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can delete an alert and its linked incident is removed too (200)", async () => {
    const instance = makeAlertInstance();
    const incident = makeIncidentInstance();
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    const res = await request(app)
      .delete("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(instance.destroy).toHaveBeenCalled();
    expect(incident.destroy).toHaveBeenCalled();
  });

  test("an older alert with no linked incident deletes safely (200)", async () => {
    const instance = makeAlertInstance({ incident_log_id: null });
    mockDetectionAlert.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .delete("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(instance.destroy).toHaveBeenCalled();
    expect(mockIncidentLog.findByPk).not.toHaveBeenCalled();
  });

  test("Staff cannot delete alerts (403)", async () => {
    const res = await request(app)
      .delete("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    expect(mockDetectionAlert.findByPk).not.toHaveBeenCalled();
  });

  test("Tenant cannot delete alerts (403)", async () => {
    const res = await request(app)
      .delete("/api/detection-alerts/1")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(403);
  });

  test("unauthenticated delete returns 401", async () => {
    const res = await request(app).delete("/api/detection-alerts/1");
    expect(res.status).toBe(401);
  });

  test("missing alert returns 404", async () => {
    mockDetectionAlert.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .delete("/api/detection-alerts/999")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
  });
});
