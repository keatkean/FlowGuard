// Backend tests for Camera Inventory — /api/cameras (FM create/edit/deactivate, Staff view-only).
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.APP_SECRET = "test-secret";

const mockCamera = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
};

const mockMonitoringZone = {
  findByPk: jest.fn(),
};

jest.mock("../../models", () => ({
  Camera: mockCamera,
  MonitoringZone: mockMonitoringZone,
  sequelize: {
    fn: jest.fn(),
    col: jest.fn(),
    where: jest.fn(),
  },
}));

const camerasRouter = require("../../routes/cameras");

const app = express();
app.use(express.json());
app.use("/api/cameras", camerasRouter);

const token = (role) => jwt.sign({ id: 1, role }, process.env.APP_SECRET);
const fmToken = token("FM");
const staffToken = token("Staff");

const validPayload = {
  camera_code: "CAM-10",
  camera_name: "Dispatch Bay Camera",
  location: "Zone G - Dispatch",
};

describe("GET /api/cameras", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unauthenticated user cannot list cameras (401)", async () => {
    const res = await request(app).get("/api/cameras");
    expect(res.status).toBe(401);
  });

  test("Staff can list cameras (200)", async () => {
    mockCamera.findAll.mockResolvedValue([]);
    const res = await request(app).get("/api/cameras").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/cameras", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can create a camera (201)", async () => {
    mockCamera.findOne.mockResolvedValue(null);
    mockCamera.create.mockResolvedValue({ id: 1, ...validPayload, status: "Online" });
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(mockCamera.create).toHaveBeenCalled();
  });

  test("Staff cannot create a camera (403)", async () => {
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(validPayload);
    expect(res.status).toBe(403);
    expect(mockCamera.create).not.toHaveBeenCalled();
  });

  test("missing camera_name returns 400", async () => {
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_code: "CAM-11", location: "Zone A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/camera_name/);
  });

  test("missing location returns 400", async () => {
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_code: "CAM-11", camera_name: "Gate Camera" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location/);
  });

  test("invalid status returns 400", async () => {
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, status: "Broken" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });

  test("duplicate camera_code returns 409", async () => {
    mockCamera.findOne.mockResolvedValue({ id: 99, camera_code: "CAM-10" });
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send(validPayload);
    expect(res.status).toBe(409);
  });

  test("zone_id referencing a nonexistent zone returns 400", async () => {
    mockCamera.findOne.mockResolvedValue(null);
    mockMonitoringZone.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, zone_id: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zone/i);
  });

  test("zone already mapped to another camera returns 409 (one camera per rule)", async () => {
    // The zone-exclusivity check runs before the camera_code duplicate check —
    // an existing camera already holds this zone.
    mockCamera.findOne.mockResolvedValue({ id: 42, zone_id: 5 });
    mockMonitoringZone.findByPk.mockResolvedValue({ id: 5 });
    const res = await request(app)
      .post("/api/cameras")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, zone_id: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/zone/i);
    expect(mockCamera.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/cameras/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can update camera status (200)", async () => {
    const instance = { id: 1, camera_code: "CAM-10", update: jest.fn().mockResolvedValue() };
    mockCamera.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/cameras/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Maintenance" });
    expect(res.status).toBe(200);
    expect(instance.update).toHaveBeenCalledWith(expect.objectContaining({ status: "Maintenance" }));
  });

  test("Staff cannot update a camera (403)", async () => {
    const res = await request(app)
      .put("/api/cameras/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ status: "Maintenance" });
    expect(res.status).toBe(403);
  });

  test("updating a nonexistent camera returns 404", async () => {
    mockCamera.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .put("/api/cameras/999")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ status: "Online" });
    expect(res.status).toBe(404);
  });

  test("mapping a camera to a zone already held by ANOTHER camera returns 409", async () => {
    const instance = { id: 1, camera_code: "CAM-10", update: jest.fn().mockResolvedValue() };
    mockCamera.findByPk.mockResolvedValue(instance);
    mockMonitoringZone.findByPk.mockResolvedValue({ id: 5 });
    mockCamera.findOne.mockResolvedValue({ id: 77, zone_id: 5 }); // a different camera holds zone 5
    const res = await request(app)
      .put("/api/cameras/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ zone_id: 5 });
    expect(res.status).toBe(409);
    expect(instance.update).not.toHaveBeenCalled();
  });

  test("a camera can re-save/keep its OWN zone_id (excludeId lets it through)", async () => {
    const instance = { id: 1, camera_code: "CAM-10", update: jest.fn().mockResolvedValue() };
    mockCamera.findByPk.mockResolvedValue(instance);
    mockMonitoringZone.findByPk.mockResolvedValue({ id: 5 });
    mockCamera.findOne.mockResolvedValue({ id: 1, zone_id: 5 }); // this camera itself
    const res = await request(app)
      .put("/api/cameras/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ zone_id: 5 });
    expect(res.status).toBe(200);
    expect(instance.update).toHaveBeenCalledWith(expect.objectContaining({ zone_id: 5 }));
  });
});

describe("DELETE /api/cameras/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can deactivate a camera (200)", async () => {
    const instance = { id: 1, update: jest.fn().mockResolvedValue(), destroy: jest.fn().mockResolvedValue() };
    mockCamera.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .delete("/api/cameras/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(instance.update).toHaveBeenCalledWith({ status: "Disabled" });
    expect(instance.destroy).toHaveBeenCalled();
  });

  test("Staff cannot deactivate a camera (403)", async () => {
    const res = await request(app)
      .delete("/api/cameras/1")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});
