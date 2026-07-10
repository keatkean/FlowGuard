const request = require("supertest");
const express = require("express");

// Mock models BEFORE requiring the route
const mockUser = {
  findByPk: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  count: jest.fn(),
};

jest.mock("../models", () => ({
  User: mockUser,
  Attendance: { findAll: jest.fn(), destroy: jest.fn() },
  Invite: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  SecurityLog: { update: jest.fn() },
  Booking: { update: jest.fn() },
  // Transactional off-boarding: run the callback with a stub transaction.
  sequelize: { transaction: jest.fn((fn) => fn({})) },
}));

jest.mock("axios", () => ({
  post: jest.fn(() => Promise.resolve({ data: { vector: Array(512).fill(0.1) } })),
  get: jest.fn(() => Promise.resolve({ data: { message: "Staff list updated from database" } })),
}));

// Stable secret for JWT
process.env.APP_SECRET = "test-secret";

const jwt = require("jsonwebtoken");
const userRouter = require("../routes/user");

const app = express();
app.use(express.json());
app.use("/user", userRouter);

const fmPayload = { id: 99, role: "FM" };
const fmToken = jwt.sign(fmPayload, process.env.APP_SECRET);
const tenantToken = jwt.sign({ id: 50, role: "Tenant" }, process.env.APP_SECRET);
const staffToken = jwt.sign({ id: 60, role: "Staff" }, process.env.APP_SECRET);

describe("User routes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("POST /user/enroll-face enrolls a face and triggers AI cache refresh", async () => {
    mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
    mockUser.update.mockResolvedValue([1]);
    const axios = require("axios");
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ images: { front: "a", left: "b", right: "c" } });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/successful/i);
    // refresh endpoint was hit on the FACE_AI_URL base
    expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/refresh$/), expect.any(Object));
  });

  test("POST /user/enroll-face still succeeds (refresh pending) when AI refresh fails", async () => {
    mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
    mockUser.update.mockResolvedValue([1]);
    require("axios").get.mockRejectedValueOnce({ message: "connect ECONNREFUSED" });
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ images: { front: "a", left: "b", right: "c" } });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/refresh pending/i);
  });

  test("POST /user/enroll-face returns 400 for missing images", async () => {
    mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ images: { front: "a" } });
    expect(res.status).toBe(400);
  });

  test("POST /user/enroll-face returns 503 when the AI service is offline", async () => {
    mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
    require("axios").post.mockRejectedValueOnce({ code: "ECONNREFUSED" });
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ images: { front: "a", left: "b", right: "c" } });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/offline/i);
  });

  test("DELETE /user/:id removes a user and wipes biometric data", async () => {
    const update = jest.fn().mockResolvedValue(true);
    const destroy = jest.fn().mockResolvedValue(true);
    // Middleware re-reads the FM (id 99); the route loads the target (id 1).
    const fmAccount = { id: 99, role: "FM", isActive: true };
    const target = { id: 1, name: "Worker Bee", role: "Staff", managerId: 99, update, destroy };
    mockUser.findByPk.mockImplementation((id) =>
      Promise.resolve(Number(id) === 99 ? fmAccount : target)
    );
    const res = await request(app)
      .delete("/user/1")
      .set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(200);
    // PDPA: biometric vector explicitly nulled inside the transaction, access
    // logs anonymised (name + matched user id stripped), row hard-deleted.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ faceVector: null, isEnrolled: false }),
      expect.any(Object)
    );
    expect(require("../models").SecurityLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ personnelName: null, matchedUserId: null }),
      expect.objectContaining({ where: expect.anything() })
    );
    expect(destroy).toHaveBeenCalled();
  });


  describe("Tenant invitation expiry", () => {
    const tenantRegistration = {
      recaptchaToken: "captcha",
      name: "Tenant One",
      email: "tenant@example.com",
      password: "StrongPass123",
      role: "Tenant",
      tenantCode: "INVITE-TEST"
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-07-10T01:00:00.000Z"));
      require("axios").post.mockResolvedValue({ data: { success: true, score: 0.9 } });
      mockUser.create.mockResolvedValue({ id: 12 });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const registerWithExpiry = async (expiresAt, inviteExtras = {}) => {
      const invite = { isUsed: false, expiresAt, update: jest.fn().mockResolvedValue(true), ...inviteExtras };
      require("../models").Invite.findOne.mockResolvedValue(invite);
      const res = await request(app).post("/user/register").send(tenantRegistration);
      return { res, invite };
    };

    test("valid immediately before 48 hours", async () => {
      const { res, invite } = await registerWithExpiry(new Date("2026-07-10T01:00:00.001Z"));
      expect(res.status).toBe(200);
      expect(invite.update).toHaveBeenCalledWith({ isUsed: true });
      expect(mockUser.create).toHaveBeenCalled();
    });

    test("invalid exactly at expiry", async () => {
      const { res, invite } = await registerWithExpiry(new Date("2026-07-10T01:00:00.000Z"));
      expect(res.status).toBe(401);
      expect(res.body.errors[0]).toMatch(/expired/i);
      expect(invite.update).not.toHaveBeenCalled();
    });

    test("invalid after expiry", async () => {
      const { res } = await registerWithExpiry(new Date("2026-07-10T00:59:59.999Z"));
      expect(res.status).toBe(401);
      expect(res.body.errors[0]).toMatch(/expired/i);
    });

    test("used invite rejected", async () => {
      require("../models").Invite.findOne.mockResolvedValue(null);
      const res = await request(app).post("/user/register").send(tenantRegistration);
      expect(res.status).toBe(401);
      expect(res.body.errors[0]).toMatch(/invalid or used/i);
    });

    test("invite list returns EXPIRED for expired unused invites", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
      require("../models").Invite.findAll.mockResolvedValue([
        { id: 1, code: "INVITE-OLD", role: "Tenant", isUsed: false, expiresAt: new Date("2026-07-10T01:00:00.000Z"), createdAt: new Date("2026-07-08T01:00:00.000Z") }
      ]);
      const res = await request(app).get("/user/tenant-invites").set("Authorization", `Bearer ${fmToken}`);
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ status: "EXPIRED", isUsable: false });
    });

    test("invite list returns PENDING for valid unused invites", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
      require("../models").Invite.findAll.mockResolvedValue([
        { id: 2, code: "INVITE-NEW", role: "Tenant", isUsed: false, expiresAt: new Date("2026-07-10T01:00:00.001Z"), createdAt: new Date("2026-07-08T01:00:00.000Z") }
      ]);
      const res = await request(app).get("/user/tenant-invites").set("Authorization", `Bearer ${fmToken}`);
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ status: "PENDING", isUsable: true });
    });
  });
  test("DELETE /user/:id blocks self deletion", async () => {
    mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true, name: "Self User" });
    const res = await request(app).delete("/user/99").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/self-deletion/i);
  });

  test("DELETE /user/:id blocks tenant deletion while linked Staff exist", async () => {
    const fmAccount = { id: 99, role: "FM", isActive: true };
    const tenant = { id: 10, name: "Unit Owner", role: "Tenant", managerId: null };
    mockUser.findByPk.mockImplementation((id) => Promise.resolve(Number(id) === 99 ? fmAccount : tenant));
    mockUser.count.mockResolvedValue(2);
    const res = await request(app).delete("/user/10").set("Authorization", `Bearer ${fmToken}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/linked Staff/i);
  });
  // --- Manual user creation (role rules) ---
  describe("POST /user/manual-create", () => {
    const body = { name: "New Person", email: "new@harrison.com", password: "Temp1234!" };

    test("FM can create a Tenant; no password hash returned", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true }); // authenticateToken
      mockUser.create.mockResolvedValue({ id: 7, name: body.name, email: body.email, role: "Tenant", isActive: true });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${fmToken}`)
        .send(body);
      expect(res.status).toBe(201);
      expect(mockUser.create).toHaveBeenCalledWith(expect.objectContaining({ role: "Tenant" }));
      expect(res.body.user.role).toBe("Tenant");
      expect(res.body.user.password).toBeUndefined();
    });

    test("Tenant can create Staff (linked via managerId)", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 50, role: "Tenant", isActive: true });
      mockUser.create.mockResolvedValue({ id: 8, name: body.name, email: body.email, role: "Staff", isActive: true });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send(body);
      expect(res.status).toBe(201);
      expect(mockUser.create).toHaveBeenCalledWith(expect.objectContaining({ role: "Staff", managerId: 50 }));
    });

    test("Tenant cannot create a Tenant (role mismatch → 403)", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 50, role: "Tenant", isActive: true });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({ ...body, role: "Tenant" });
      expect(res.status).toBe(403);
      expect(mockUser.create).not.toHaveBeenCalled();
    });

    test("No one can create an FM via manual flow (FM->FM blocked → 403)", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${fmToken}`)
        .send({ ...body, role: "FM" });
      expect(res.status).toBe(403);
      expect(mockUser.create).not.toHaveBeenCalled();
    });

    test("Staff cannot create users (403)", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 60, role: "Staff", isActive: true });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${staffToken}`)
        .send(body);
      expect(res.status).toBe(403);
      expect(mockUser.create).not.toHaveBeenCalled();
    });

    test("Duplicate email fails with 400", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
      mockUser.create.mockRejectedValue({ name: "SequelizeUniqueConstraintError" });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${fmToken}`)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatch(/already registered/i);
    });

    test("Missing fields return 400", async () => {
      mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
      const res = await request(app)
        .post("/user/manual-create")
        .set("Authorization", `Bearer ${fmToken}`)
        .send({ email: "x@y.com" });
      expect(res.status).toBe(400);
    });
  });
});
