// Backend tests — account security lifecycle (Felicia).
// Covers: DB-backed session enforcement (suspended / deleted / tokenVersion
// revocation), suspension permissions, transactional off-boarding (user row
// genuinely gone, tenant 409 guard), change-password, and forgot/reset flows.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// Mutable in-memory "users table" — the DB-backed verifyToken and the routes
// both read through User.findByPk, so deleting from this map genuinely makes
// the account disappear for every subsequent request.
const DB = { users: {} };

const mockUser = {
  findByPk: jest.fn((id) => Promise.resolve(DB.users[id] ?? null)),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  count: jest.fn(),
};

const mockAttendance = { destroy: jest.fn(), findAll: jest.fn() };
const mockSecurityLog = { update: jest.fn() };
const mockBooking = { update: jest.fn() };
const mockTransaction = jest.fn(async (fn) => fn({ id: "tx" }));

jest.mock("../../models", () => ({
  User: mockUser,
  Attendance: mockAttendance,
  Invite: { findOne: jest.fn(), create: jest.fn() },
  SecurityLog: mockSecurityLog,
  Booking: mockBooking,
  sequelize: { transaction: mockTransaction },
}));

// Never send real email in tests.
jest.mock("../../services/mailer", () => ({
  sendPasswordResetEmail: jest.fn(() => Promise.resolve({ simulated: true })),
  isMailConfigured: () => false,
}));

jest.mock("axios", () => ({
  post: jest.fn(() => Promise.resolve({ data: { vector: Array(512).fill(0.1) } })),
  get: jest.fn(() => Promise.resolve({ data: {} })),
}));

process.env.APP_SECRET = "test-secret";

const userRouter = require("../../routes/user");
const { sendPasswordResetEmail } = require("../../services/mailer");

const app = express();
app.use(express.json());
app.use("/user", userRouter);

const sign = (payload) => jwt.sign(payload, process.env.APP_SECRET);

// Helper: a user row whose update() mutates itself (like a Sequelize instance).
const makeUser = (fields) => {
  const row = {
    tokenVersion: 0,
    isActive: true,
    ...fields,
    update: jest.fn(function (patch) {
      Object.assign(row, patch);
      return Promise.resolve(row);
    }),
    destroy: jest.fn(() => {
      delete DB.users[row.id];
      return Promise.resolve();
    }),
  };
  return row;
};

const resetDb = () => {
  Object.keys(DB.users).forEach((k) => delete DB.users[k]);
  DB.users[1] = makeUser({ id: 1, name: "Fatimah FM", email: "fm@x.com", role: "FM" });
  DB.users[2] = makeUser({ id: 2, name: "Tina Tenant", email: "tenant@x.com", role: "Tenant" });
  DB.users[3] = makeUser({ id: 3, name: "Sam Staff", email: "staff@x.com", role: "Staff", managerId: 2 });
};

beforeEach(() => {
  jest.clearAllMocks();
  resetDb();
  mockUser.findByPk.mockImplementation((id) => Promise.resolve(DB.users[id] ?? null));
});

// ---------------------------------------------------------------------------
// 1. DB-backed session enforcement (verifyToken)
// ---------------------------------------------------------------------------
describe("Session enforcement — DB is authoritative on every request", () => {
  test("suspended user is rejected immediately even with a previously valid token", async () => {
    const token = sign({ id: 3, role: "Staff", tokenVersion: 0 });
    DB.users[3].isActive = false; // FM suspends mid-session
    const res = await request(app).get("/user/my-code").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  test("deleted user is rejected (401) on the next request", async () => {
    const token = sign({ id: 3, role: "Staff", tokenVersion: 0 });
    delete DB.users[3];
    const res = await request(app).get("/user/my-code").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test("stale tokenVersion (lost device) is revoked with 401", async () => {
    const token = sign({ id: 1, role: "FM", tokenVersion: 0 });
    DB.users[1].tokenVersion = 1; // password changed / sessions revoked
    const res = await request(app).get("/user/").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/revoked/i);
  });

  test("the DATABASE role wins over the role claimed in the JWT", async () => {
    // Token forged/stale as FM, but the DB says this account is Staff.
    const token = sign({ id: 3, role: "FM", tokenVersion: 0 });
    const res = await request(app).get("/user/").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403); // FM-only list rejected
  });
});

// ---------------------------------------------------------------------------
// 2. Suspension permissions + revocation side-effect
// ---------------------------------------------------------------------------
describe("PUT /user/suspend/:id", () => {
  test("FM suspends a user; tokenVersion is bumped so old tokens die", async () => {
    const token = sign({ id: 1, role: "FM", tokenVersion: 0 });
    const res = await request(app).put("/user/suspend/3").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(DB.users[3].isActive).toBe(false);
    expect(DB.users[3].tokenVersion).toBe(1);
  });

  test("FM reactivates a suspended user", async () => {
    DB.users[3].isActive = false;
    const token = sign({ id: 1, role: "FM", tokenVersion: 0 });
    const res = await request(app).put("/user/suspend/3").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(DB.users[3].isActive).toBe(true);
  });

  test("Tenant may suspend their OWN Staff", async () => {
    const token = sign({ id: 2, role: "Tenant", tokenVersion: 0 });
    const res = await request(app).put("/user/suspend/3").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(DB.users[3].isActive).toBe(false);
  });

  test("Tenant cannot suspend a user who is not their Staff", async () => {
    DB.users[4] = makeUser({ id: 4, name: "Other Staff", email: "o@x.com", role: "Staff", managerId: 99 });
    const token = sign({ id: 2, role: "Tenant", tokenVersion: 0 });
    const res = await request(app).put("/user/suspend/4").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("Staff cannot suspend anyone", async () => {
    const token = sign({ id: 3, role: "Staff", tokenVersion: 0 });
    const res = await request(app).put("/user/suspend/2").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 3. Transactional off-boarding
// ---------------------------------------------------------------------------
describe("DELETE /user/:id — complete off-boarding", () => {
  const fmToken = () => sign({ id: 1, role: "FM", tokenVersion: 0 });

  test("user row is GENUINELY gone after deletion (subsequent lookups 404/401)", async () => {
    mockUser.count.mockResolvedValue(0);
    const res = await request(app).delete("/user/3").set("Authorization", `Bearer ${fmToken()}`);
    expect(res.status).toBe(200);

    // The in-memory table no longer holds the row…
    expect(DB.users[3]).toBeUndefined();
    // …so deleting again 404s…
    const again = await request(app).delete("/user/3").set("Authorization", `Bearer ${fmToken()}`);
    expect(again.status).toBe(404);
    // …and the deleted user's own old token is dead (account gone → 401).
    const ghost = await request(app)
      .get("/user/my-code")
      .set("Authorization", `Bearer ${sign({ id: 3, role: "Staff", tokenVersion: 0 })}`);
    expect(ghost.status).toBe(401);
  });

  test("wipes biometrics, deletes attendance, anonymises logs and bookings inside ONE transaction", async () => {
    mockUser.count.mockResolvedValue(0);
    const target = DB.users[3];
    const res = await request(app).delete("/user/3").set("Authorization", `Bearer ${fmToken()}`);
    expect(res.status).toBe(200);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(target.update).toHaveBeenCalledWith(
      { faceVector: null, isEnrolled: false },
      expect.objectContaining({ transaction: expect.anything() })
    );
    expect(mockAttendance.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 3 }, transaction: expect.anything() })
    );
    // Anonymised: personnelName + matchedUserId stripped; descriptions with the
    // person's name replaced by a neutral audit description.
    expect(mockSecurityLog.update).toHaveBeenCalledWith(
      { personnelName: null, matchedUserId: null },
      expect.objectContaining({ transaction: expect.anything() })
    );
    expect(mockSecurityLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ desc: expect.stringMatching(/anonymised/i) }),
      expect.objectContaining({ transaction: expect.anything() })
    );
    // Bookings keep operational audit but lose the personal account linkage.
    expect(mockBooking.update).toHaveBeenCalledWith(
      { tenantId: null },
      expect.objectContaining({ where: { tenantId: 3 }, transaction: expect.anything() })
    );
    expect(target.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ transaction: expect.anything() })
    );
  });

  test("tenant with linked Staff → 409, nothing deleted", async () => {
    mockUser.count.mockResolvedValue(2);
    const res = await request(app).delete("/user/2").set("Authorization", `Bearer ${fmToken()}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/linked Staff/i);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(DB.users[2]).toBeDefined();
  });

  test("tenant with no remaining Staff can be off-boarded", async () => {
    mockUser.count.mockResolvedValue(0);
    const res = await request(app).delete("/user/2").set("Authorization", `Bearer ${fmToken()}`);
    expect(res.status).toBe(200);
    expect(DB.users[2]).toBeUndefined();
  });

  test("self-deletion stays restricted", async () => {
    const res = await request(app).delete("/user/1").set("Authorization", `Bearer ${fmToken()}`);
    expect(res.status).toBe(400);
    expect(DB.users[1]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3b. Enrolment permissions (POST /user/enroll-face)
// ---------------------------------------------------------------------------
describe("POST /user/enroll-face — permissions", () => {
  const IMAGES = { images: { front: "a", left: "b", right: "c" } };

  test("any authenticated user may enrol THEMSELVES", async () => {
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${sign({ id: 3, role: "Staff", tokenVersion: 0 })}`)
      .send(IMAGES);
    expect(res.status).toBe(200);
  });

  test("Tenant may re-enrol their OWN Staff (target.managerId === requester.id)", async () => {
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${sign({ id: 2, role: "Tenant", tokenVersion: 0 })}`)
      .send({ ...IMAGES, targetUserId: 3 });
    expect(res.status).toBe(200);
  });

  test("Tenant cannot enrol someone else's Staff", async () => {
    DB.users[4] = makeUser({ id: 4, name: "Other Staff", email: "o@x.com", role: "Staff", managerId: 99 });
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${sign({ id: 2, role: "Tenant", tokenVersion: 0 })}`)
      .send({ ...IMAGES, targetUserId: 4 });
    expect(res.status).toBe(403);
  });

  test("Staff cannot enrol another account", async () => {
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${sign({ id: 3, role: "Staff", tokenVersion: 0 })}`)
      .send({ ...IMAGES, targetUserId: 2 });
    expect(res.status).toBe(403);
  });

  test("FM may re-enrol any user", async () => {
    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${sign({ id: 1, role: "FM", tokenVersion: 0 })}`)
      .send({ ...IMAGES, targetUserId: 3 });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 4. Change password
// ---------------------------------------------------------------------------
describe("PUT /user/change-password", () => {
  let staffToken;
  beforeEach(async () => {
    DB.users[3].password = await bcrypt.hash("OldPass123", 10);
    staffToken = sign({ id: 3, role: "Staff", tokenVersion: 0 });
  });

  test("wrong current password → 401", async () => {
    const res = await request(app)
      .put("/user/change-password")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ currentPassword: "nope", newPassword: "FreshPass456" });
    expect(res.status).toBe(401);
  });

  test("new password too short → 400", async () => {
    const res = await request(app)
      .put("/user/change-password")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ currentPassword: "OldPass123", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  test("new password must differ from the current one → 400", async () => {
    const res = await request(app)
      .put("/user/change-password")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ currentPassword: "OldPass123", newPassword: "OldPass123" });
    expect(res.status).toBe(400);
  });

  test("valid change: rehashes, bumps tokenVersion, exposes no hash", async () => {
    const res = await request(app)
      .put("/user/change-password")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ currentPassword: "OldPass123", newPassword: "FreshPass456" });
    expect(res.status).toBe(200);

    // Stored hash is bcrypt of the NEW password, never plaintext.
    expect(DB.users[3].password).not.toBe("FreshPass456");
    expect(await bcrypt.compare("FreshPass456", DB.users[3].password)).toBe(true);
    // All previous sessions revoked…
    expect(DB.users[3].tokenVersion).toBe(1);
    const replay = await request(app).get("/user/my-code").set("Authorization", `Bearer ${staffToken}`);
    expect(replay.status).toBe(401);
    // …and no hash in the response body.
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });
});

// ---------------------------------------------------------------------------
// 5. Forgot / reset password
// ---------------------------------------------------------------------------
describe("POST /user/forgot-password and /user/reset-password", () => {
  test("unknown email still gets the SAME generic response (no enumeration)", async () => {
    mockUser.findOne.mockResolvedValueOnce(null);
    const res = await request(app).post("/user/forgot-password").send({ email: "ghost@x.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email matches/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test("known email: stores only the SHA-256 hash with a 15-minute expiry and emails the reset link", async () => {
    mockUser.findOne.mockResolvedValueOnce(DB.users[3]);
    const before = Date.now();
    const res = await request(app).post("/user/forgot-password").send({ email: "staff@x.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email matches/i); // same generic reply

    const stored = DB.users[3];
    expect(stored.passwordResetTokenHash).toMatch(/^[a-f0-9]{64}$/); // hash, not raw token
    const expiresIn = new Date(stored.passwordResetExpiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThan(14 * 60 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(16 * 60 * 1000);

    // Email went to the account with a /reset-password?token= link, and the RAW
    // token in the link hashes to what was stored (hash-only storage).
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [to, url] = sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe("staff@x.com");
    expect(url).toMatch(/\/reset-password\?token=[a-f0-9]{64}/);
    const rawToken = url.split("token=")[1];
    const rehash = crypto.createHash("sha256").update(rawToken).digest("hex");
    expect(rehash).toBe(stored.passwordResetTokenHash);
  });

  test("reset with a valid token: rehashes password, clears reset fields, revokes sessions", async () => {
    const raw = "a".repeat(64);
    DB.users[3].passwordResetTokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    DB.users[3].passwordResetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    mockUser.findOne.mockResolvedValueOnce(DB.users[3]);

    const res = await request(app)
      .post("/user/reset-password")
      .send({ token: raw, newPassword: "BrandNew789" });
    expect(res.status).toBe(200);

    // Route looked the account up by the HASH of the submitted token.
    expect(mockUser.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          passwordResetTokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
        }),
      })
    );
    expect(await bcrypt.compare("BrandNew789", DB.users[3].password)).toBe(true);
    expect(DB.users[3].passwordResetTokenHash).toBeNull();
    expect(DB.users[3].passwordResetExpiresAt).toBeNull();
    expect(DB.users[3].tokenVersion).toBe(1);
  });

  test("invalid/expired token → 400 without touching any account", async () => {
    mockUser.findOne.mockResolvedValueOnce(null); // no unexpired match
    const res = await request(app)
      .post("/user/reset-password")
      .send({ token: "deadbeef", newPassword: "BrandNew789" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  test("forgot-password is rate-limited per client (429 after the window fills)", async () => {
    mockUser.findOne.mockResolvedValue(null);
    // 2 requests were already spent by the tests above; the limiter allows 5
    // per 15 minutes per IP, so requests 3-5 pass and the 6th trips 429.
    const r3 = await request(app).post("/user/forgot-password").send({ email: "g@x.com" });
    const r4 = await request(app).post("/user/forgot-password").send({ email: "g@x.com" });
    const r5 = await request(app).post("/user/forgot-password").send({ email: "g@x.com" });
    const r6 = await request(app).post("/user/forgot-password").send({ email: "g@x.com" });
    expect([r3.status, r4.status, r5.status]).toEqual([200, 200, 200]);
    expect(r6.status).toBe(429);
  });
});
