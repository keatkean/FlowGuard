// Backend tests for Detection Setup — /api/zones (stored inside MonitoringZone).
// FM can configure; Staff can view but not edit; validation rejects bad thresholds/enums.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.APP_SECRET = "test-secret";

const mockMonitoringZone = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
};
const mockCamera = {
  update: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
};
const mockTx = { id: "tx" };
const mockSequelize = { transaction: jest.fn(async (fn) => fn(mockTx)) };

jest.mock("../../models", () => ({
  MonitoringZone: mockMonitoringZone,
  Camera: mockCamera,
  sequelize: mockSequelize,
}));

const zonesRouter = require("../../routes/zones");

const app = express();
app.use(express.json());
app.use("/api/zones", zonesRouter);

const token = (role) => jwt.sign({ id: 1, role }, process.env.APP_SECRET);
const fmToken = token("FM");
const staffToken = token("Staff");

const makeZoneInstance = (overrides = {}) => ({
  id: 1,
  zone_name: "Zone A",
  location: "Loading Bay",
  time_threshold: 5,
  monitored_classes: "[]",
  toJSON() {
    return { ...this };
  },
  update: jest.fn().mockResolvedValue(),
  destroy: jest.fn().mockResolvedValue(),
  ...overrides,
});

const makeCameraInstance = (overrides = {}) => ({
  id: 10,
  zone_id: null,
  update: jest.fn().mockResolvedValue(),
  ...overrides,
});

const validPayload = { zone_name: "Zone A", location: "Loading Bay", time_threshold: 5 };

describe("GET /api/zones", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unauthenticated user cannot view detection setup (401)", async () => {
    const res = await request(app).get("/api/zones");
    expect(res.status).toBe(401);
  });

  test("Staff can view detection setup (200)", async () => {
    mockMonitoringZone.findAll.mockResolvedValue([makeZoneInstance()]);
    const res = await request(app).get("/api/zones").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/zones/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Staff can fetch a single zone by valid id (200) with parsed monitored_classes", async () => {
    mockMonitoringZone.findByPk.mockResolvedValue(makeZoneInstance({ monitored_classes: '["suitcase","backpack"]' }));
    const res = await request(app).get("/api/zones/1").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.monitored_classes).toEqual(["suitcase", "backpack"]);
  });

  test("missing zone returns 404", async () => {
    mockMonitoringZone.findByPk.mockResolvedValue(null);
    const res = await request(app).get("/api/zones/999").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
  });

  test("non-numeric id is handled cleanly (404, no DB lookup)", async () => {
    const res = await request(app).get("/api/zones/not-a-number").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(404);
    expect(mockMonitoringZone.findByPk).not.toHaveBeenCalled();
  });

  test("unauthenticated user cannot fetch a zone (401)", async () => {
    const res = await request(app).get("/api/zones/1");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/zones", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can save a detection setup zone (201)", async () => {
    mockMonitoringZone.create.mockResolvedValue(makeZoneInstance());
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send(validPayload);
    expect(res.status).toBe(201);
  });

  test("Staff cannot edit detection setup (403)", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(validPayload);
    expect(res.status).toBe(403);
    expect(mockMonitoringZone.create).not.toHaveBeenCalled();
  });

  test("missing zone_name/location returns 400", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ time_threshold: 5 });
    expect(res.status).toBe(400);
  });

  test("non-positive time_threshold returns 400", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, time_threshold: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/time_threshold/);
  });

  test("negative unattended_threshold_seconds returns 400", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, unattended_threshold_seconds: -10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unattended_threshold_seconds/);
  });

  test("invalid severity returns 400", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, severity: "Catastrophic" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/severity/);
  });

  test("empty monitored_classes array returns 400 (monitored object class cannot be empty)", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, monitored_classes: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/monitored_classes/);
  });

  test("creating a zone with camera_id assigns the camera atomically (201)", async () => {
    const zone = makeZoneInstance();
    const camera = makeCameraInstance({ id: 10, zone_id: null });
    mockMonitoringZone.create.mockResolvedValue(zone);
    mockCamera.findByPk.mockResolvedValue(camera);

    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, camera_id: 10 });

    expect(res.status).toBe(201);
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(mockMonitoringZone.create.mock.calls[0][1]).toEqual({ transaction: mockTx });
    expect(camera.update).toHaveBeenCalledWith({ zone_id: zone.id }, { transaction: mockTx });
  });

  test("camera_id already assigned to another zone returns 409, zone is never created", async () => {
    mockCamera.findByPk.mockResolvedValue(makeCameraInstance({ id: 10, zone_id: 77 }));
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, camera_id: 10 });
    expect(res.status).toBe(409);
    expect(mockMonitoringZone.create).not.toHaveBeenCalled();
  });

  test("nonexistent camera_id returns 400, zone is never created", async () => {
    mockCamera.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, camera_id: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/camera/i);
    expect(mockMonitoringZone.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/zones/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can update zone detection setup (200)", async () => {
    const instance = makeZoneInstance();
    mockMonitoringZone.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ severity: "High", detection_enabled: false });
    expect(res.status).toBe(200);
    expect(instance.update).toHaveBeenCalledWith(expect.objectContaining({ severity: "High", detection_enabled: false }), { transaction: mockTx });
  });

  test("Staff cannot update zone detection setup (403)", async () => {
    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ severity: "High" });
    expect(res.status).toBe(403);
  });
});

describe("Atomic camera assignment on zone update", () => {
  beforeEach(() => jest.clearAllMocks());

  test("replacing a zone's camera releases the old one and assigns the new one atomically", async () => {
    const zone = makeZoneInstance({ id: 1 });
    const oldCamera = makeCameraInstance({ id: 5, zone_id: 1 });
    const newCamera = makeCameraInstance({ id: 10, zone_id: null });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);
    mockCamera.findByPk.mockResolvedValue(newCamera);
    mockCamera.findOne.mockResolvedValue(oldCamera); // whichever camera currently holds zone 1

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_id: 10 });

    expect(res.status).toBe(200);
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(oldCamera.update).toHaveBeenCalledWith({ zone_id: null }, { transaction: mockTx });
    expect(newCamera.update).toHaveBeenCalledWith({ zone_id: 1 }, { transaction: mockTx });
    expect(zone.update).toHaveBeenCalledWith(expect.any(Object), { transaction: mockTx });
  });

  test("assigning the SAME camera already on this zone remains valid (no conflict, no unassign)", async () => {
    const zone = makeZoneInstance({ id: 1 });
    const sameCamera = makeCameraInstance({ id: 5, zone_id: 1 });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);
    mockCamera.findByPk.mockResolvedValue(sameCamera);
    mockCamera.findOne.mockResolvedValue(sameCamera);

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_id: 5 });

    expect(res.status).toBe(200);
    // The current-holder lookup returns the SAME camera being assigned — never unassigned.
    expect(sameCamera.update).toHaveBeenCalledTimes(1);
    expect(sameCamera.update).toHaveBeenCalledWith({ zone_id: 1 }, { transaction: mockTx });
  });

  test("a camera actively assigned to ANOTHER zone returns 409, old assignment is preserved", async () => {
    const zone = makeZoneInstance({ id: 1 });
    const stolenCamera = makeCameraInstance({ id: 10, zone_id: 77 });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);
    mockCamera.findByPk.mockResolvedValue(stolenCamera);

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_id: 10 });

    expect(res.status).toBe(409);
    expect(zone.update).not.toHaveBeenCalled();
    expect(stolenCamera.update).not.toHaveBeenCalled();
  });

  test("camera_id: null explicitly releases the zone's current camera", async () => {
    const zone = makeZoneInstance({ id: 1 });
    const currentCamera = makeCameraInstance({ id: 5, zone_id: 1 });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);
    mockCamera.findOne.mockResolvedValue(currentCamera);

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_id: null });

    expect(res.status).toBe(200);
    expect(mockCamera.findByPk).not.toHaveBeenCalled();
    expect(currentCamera.update).toHaveBeenCalledWith({ zone_id: null }, { transaction: mockTx });
  });

  test("nonexistent replacement camera_id returns 400, old assignment untouched", async () => {
    const zone = makeZoneInstance({ id: 1 });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);
    mockCamera.findByPk.mockResolvedValue(null);

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_id: 999 });

    expect(res.status).toBe(400);
    expect(zone.update).not.toHaveBeenCalled();
    expect(mockCamera.findOne).not.toHaveBeenCalled();
  });

  test("omitting camera_id entirely leaves the current assignment untouched (backward compatible)", async () => {
    const zone = makeZoneInstance({ id: 1 });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ severity: "High" });

    expect(res.status).toBe(200);
    expect(mockCamera.findByPk).not.toHaveBeenCalled();
    expect(mockCamera.findOne).not.toHaveBeenCalled();
  });

  test("a failure while assigning the new camera rolls back — zone fields are never committed", async () => {
    const zone = makeZoneInstance({ id: 1 });
    const oldCamera = makeCameraInstance({ id: 5, zone_id: 1 });
    const newCamera = makeCameraInstance({
      id: 10,
      zone_id: null,
      update: jest.fn().mockRejectedValue(new Error("db down")),
    });
    mockMonitoringZone.findByPk.mockResolvedValue(zone);
    mockCamera.findByPk.mockResolvedValue(newCamera);
    mockCamera.findOne.mockResolvedValue(oldCamera);

    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ camera_id: 10 });

    expect(res.status).toBe(500);
    // The zone metadata write is sequenced AFTER the camera swap inside the same
    // transaction — it never runs once the camera assignment throws, so a real
    // Postgres transaction rolls back the old camera's release too.
    expect(zone.update).not.toHaveBeenCalled();
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/zones/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can delete a zone (200) and its camera(s) are released in the same transaction", async () => {
    const instance = makeZoneInstance();
    mockMonitoringZone.findByPk.mockResolvedValue(instance);
    mockCamera.update.mockResolvedValue([1]);
    const res = await request(app)
      .delete("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    // Cameras are unassigned BEFORE the zone is destroyed, in the same transaction —
    // so a camera can immediately be mapped to another Detection Setup rule.
    expect(mockCamera.update).toHaveBeenCalledWith(
      { zone_id: null },
      expect.objectContaining({ where: { zone_id: 1 }, transaction: mockTx })
    );
    expect(instance.destroy).toHaveBeenCalledWith({ transaction: mockTx });
    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
  });

  test("Staff cannot delete a zone (403)", async () => {
    const res = await request(app)
      .delete("/api/zones/1")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});

describe("detection_type — explicit Detection Setup category", () => {
  beforeEach(() => jest.clearAllMocks());

  test("POST saves an explicit detection_type (201)", async () => {
    mockMonitoringZone.create.mockResolvedValue(makeZoneInstance({ detection_type: "crowd_density" }));
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, detection_type: "crowd_density" });
    expect(res.status).toBe(201);
    expect(mockMonitoringZone.create.mock.calls[0][0]).toEqual(expect.objectContaining({ detection_type: "crowd_density" }));
    expect(res.body.detection_type).toBe("crowd_density");
  });

  test("unsupported detection_type returns 400", async () => {
    const res = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ ...validPayload, detection_type: "alien_invasion" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/detection_type/);
    expect(mockMonitoringZone.create).not.toHaveBeenCalled();
  });

  test("PUT updates detection_type (200)", async () => {
    const instance = makeZoneInstance({ detection_type: "unattended_object" });
    mockMonitoringZone.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ detection_type: "unauthorized_access" });
    expect(res.status).toBe(200);
    expect(instance.update).toHaveBeenCalledWith(expect.objectContaining({ detection_type: "unauthorized_access" }), { transaction: mockTx });
  });

  test("GET serializes a null detection_type (old row) with the safe 'unattended_object' fallback", async () => {
    mockMonitoringZone.findByPk.mockResolvedValue(makeZoneInstance({ detection_type: null }));
    const res = await request(app).get("/api/zones/1").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.detection_type).toBe("unattended_object");
  });

  test("GET list preserves an explicitly-saved detection_type", async () => {
    mockMonitoringZone.findAll.mockResolvedValue([makeZoneInstance({ detection_type: "crowd_density" })]);
    const res = await request(app).get("/api/zones").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].detection_type).toBe("crowd_density");
  });
});
