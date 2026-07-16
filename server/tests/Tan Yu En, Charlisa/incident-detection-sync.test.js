// Backend tests for reverse IncidentLog -> DetectionAlert synchronisation on
// /api/incident — the mirror image of detectionAlerts.js's forward sync (tested in
// detection-alerts.test.js). Editing/deleting an incident from the Incident Dashboard
// must keep the linked Object Detection alert consistent, in one transaction.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.APP_SECRET = "test-secret";

const mockIncidentLog = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
};
const mockDetectionAlert = {
  findOne: jest.fn(),
};
const mockTx = { id: "tx" };
const mockSequelize = { transaction: jest.fn(async (fn) => fn(mockTx)) };

jest.mock("../../models", () => ({
  IncidentLog: mockIncidentLog,
  DetectionAlert: mockDetectionAlert,
  sequelize: mockSequelize,
}));

const incidentRouter = require("../../routes/incident");

const app = express();
app.use(express.json());
app.use("/api/incident", incidentRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);

const makeIncidentInstance = (overrides = {}) => ({
  id: 1,
  resolutionStatus: "Active",
  severity: "Medium",
  person_name: null,
  notes: "",
  update: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  ...overrides,
});

const makeAlertInstance = (overrides = {}) => ({
  id: 9,
  incident_log_id: 1,
  status: "Active",
  update: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  ...overrides,
});

describe("PATCH /api/incident/:id — reverse sync to DetectionAlert", () => {
  beforeEach(() => jest.clearAllMocks());

  test("resolutionStatus update mirrors onto the linked alert's status", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ resolutionStatus: "Escalated to Security" });

    expect(res.status).toBe(200);
    expect(mockDetectionAlert.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { incident_log_id: 1 },
    }));
    expect(alert.update).toHaveBeenCalledWith({ status: "Escalated" }, { transaction: mockTx });
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });

  test("Cleared resolutionStatus maps to the alert's Cleared status", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ resolutionStatus: "Cleared" });

    expect(res.status).toBe(200);
    expect(alert.update).toHaveBeenCalledWith({ status: "Cleared" }, { transaction: mockTx });
  });

  test("severity update changes the linked DetectionAlert's severity", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ severity: "Critical" });

    expect(res.status).toBe(200);
    expect(incident.update.mock.calls[0][0]).toEqual(expect.objectContaining({ severity: "Critical" }));
    expect(alert.update).toHaveBeenCalledWith({ severity: "Critical" }, { transaction: mockTx });
  });

  test("person_name update changes the linked DetectionAlert's person_name", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ person_name: "Jia Wei" });

    expect(res.status).toBe(200);
    expect(incident.update.mock.calls[0][0]).toEqual(expect.objectContaining({ person_name: "Jia Wei" }));
    expect(alert.update).toHaveBeenCalledWith({ person_name: "Jia Wei" }, { transaction: mockTx });
  });

  test("invalid severity is rejected (400) before any update runs", async () => {
    const incident = makeIncidentInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ severity: "Catastrophic" });
    expect(res.status).toBe(400);
    expect(incident.update).not.toHaveBeenCalled();
  });

  test("an old incident with no linked DetectionAlert updates safely (200), no recursive/second update call", async () => {
    const incident = makeIncidentInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ resolutionStatus: "Cleared" });

    expect(res.status).toBe(200);
    expect(incident.update).toHaveBeenCalledTimes(1);
  });

  test("notes-only update does not touch the linked alert (no mapped field changed)", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ notes: "Reviewed footage, no issue." });

    expect(res.status).toBe(200);
    expect(alert.update).not.toHaveBeenCalled();
  });

  test("a transaction failure rolls back and neither the incident nor the alert stick (500)", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance({
      update: jest.fn().mockRejectedValue(new Error("db down")),
    });
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .patch("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ resolutionStatus: "Cleared" });

    expect(res.status).toBe(500);
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });

  test("missing incident returns 404", async () => {
    mockIncidentLog.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/incident/999")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ resolutionStatus: "Cleared" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/incident/:id — reverse sync to DetectionAlert", () => {
  beforeEach(() => jest.clearAllMocks());

  test("deleting an incident soft-deletes its linked DetectionAlert too, in one transaction", async () => {
    const incident = makeIncidentInstance();
    const alert = makeAlertInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(alert);

    const res = await request(app)
      .delete("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`);

    expect(res.status).toBe(200);
    expect(alert.destroy).toHaveBeenCalledWith({ transaction: mockTx });
    expect(incident.destroy).toHaveBeenCalledWith({ transaction: mockTx });
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });

  test("an old incident with no linked DetectionAlert deletes safely (200)", async () => {
    const incident = makeIncidentInstance();
    mockIncidentLog.findByPk.mockResolvedValue(incident);
    mockDetectionAlert.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/incident/1")
      .set("Authorization", `Bearer ${fmToken}`);

    expect(res.status).toBe(200);
    expect(incident.destroy).toHaveBeenCalledWith({ transaction: mockTx });
  });

  test("missing incident returns 404, no DetectionAlert lookup attempted", async () => {
    mockIncidentLog.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .delete("/api/incident/999")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
    expect(mockDetectionAlert.findOne).not.toHaveBeenCalled();
  });
});
