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

jest.mock("../../models", () => ({
  MonitoringZone: mockMonitoringZone,
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
    expect(instance.update).toHaveBeenCalledWith(expect.objectContaining({ severity: "High", detection_enabled: false }));
  });

  test("Staff cannot update zone detection setup (403)", async () => {
    const res = await request(app)
      .put("/api/zones/1")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ severity: "High" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/zones/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FM can delete a zone (200)", async () => {
    const instance = makeZoneInstance();
    mockMonitoringZone.findByPk.mockResolvedValue(instance);
    const res = await request(app)
      .delete("/api/zones/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    expect(instance.destroy).toHaveBeenCalled();
  });

  test("Staff cannot delete a zone (403)", async () => {
    const res = await request(app)
      .delete("/api/zones/1")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});
