// Backend tests — POST /api/facial-recognition/denied-event.
// V-Patrol's server-owned audit for FINAL denied outcomes (identity mismatch,
// liveness timeout, persistent multiple faces). The client may only name an
// allowed reason; the server owns type/description/severity/icon/review
// status and resolves the candidate's name/role from PostgreSQL.
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockUser = { findByPk: jest.fn(), update: jest.fn() };
const mockSecurityLog = { create: jest.fn() };
const mockAttendance = { findAll: jest.fn(), create: jest.fn() };
const mockEvaluationParticipant = { findOne: jest.fn() };
jest.mock("../../models", () => ({
  User: mockUser,
  SecurityLog: mockSecurityLog,
  Attendance: mockAttendance,
  EvaluationParticipant: mockEvaluationParticipant,
}));
jest.mock("../../services/evaluationParticipants", () => ({
  listEvaluationParticipants: jest.fn(),
  syncEligibleEvaluationParticipants: jest.fn(),
}));

const mockAxios = { post: jest.fn() };
jest.mock("axios", () => mockAxios);

process.env.APP_SECRET = "test-secret";

const facialRecognitionRouter = require("../../routes/facialRecognition");
const { resetLogCooldowns, createSecurityLog } = require("../../services/securityAudit");

const app = express();
app.use(express.json());
app.use("/api/facial-recognition", facialRecognitionRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);
const staffToken = jwt.sign({ id: 60, role: "Staff" }, process.env.APP_SECRET);

const FRAME = "data:image/jpeg;base64,dGVzdA==";

// Candidate stored in PostgreSQL. The faceVector/password fields exist on the
// record on purpose — the endpoint must never leak them.
const feliciaUser = {
  id: 25, name: "Tan Xiu Li, Felicia", role: "Staff",
  isActive: true, isEnrolled: true,
  faceVector: "[0.1,0.2]", password: "hashed-secret", tokenVersion: 3,
};

// verifyToken is DB-backed: it re-reads the authenticated account via
// User.findByPk. Key the mock by id so both the middleware lookup and the
// route-level candidate lookup resolve.
const AUTH_USERS = {
  1: { id: 1, role: "FM", isActive: true },
  60: { id: 60, role: "Staff", isActive: true },
};
const primeDb = (extra = {}) => {
  const table = { ...AUTH_USERS, ...extra };
  mockUser.findByPk.mockImplementation((id) => Promise.resolve(table[id] ?? null));
};

// Unique per-test location defeats the 30s dedup window between tests.
let locSeq = 0;
const nextLocation = () => `Test Gantry ${++locSeq}`;

const postDenied = (body, token = fmToken) =>
  request(app)
    .post("/api/facial-recognition/denied-event")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("POST /api/facial-recognition/denied-event", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLogCooldowns();
    primeDb({ 25: feliciaUser });
    // Echo the row Sequelize would return (incl. server timestamps).
    mockSecurityLog.create.mockImplementation((values) =>
      Promise.resolve({ ...values, createdAt: new Date("2026-07-12T08:00:00.000Z") }));
  });

  test("1. requires authentication (401 unauth, 403 non-FM staff session)", async () => {
    const unauth = await request(app)
      .post("/api/facial-recognition/denied-event")
      .send({ reason: "LIVENESS_TIMEOUT" });
    expect(unauth.status).toBe(401);

    const staff = await postDenied({ reason: "LIVENESS_TIMEOUT" }, staffToken);
    expect(staff.status).toBe(403);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("2. invalid or missing reason → 400, no log", async () => {
    for (const reason of [undefined, "HACKED", "granted", 42, ""]) {
      const res = await postDenied({ reason });
      expect(res.status).toBe(400);
    }
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("3. arbitrary SecurityLog fields cannot be injected", async () => {
    const res = await postDenied({
      reason: "LIVENESS_TIMEOUT",
      type: "Gantry Access",
      severity: "safe",
      desc: "totally fine, nothing happened",
      icon: "UNLOCK",
      reviewStatus: "Resolved",
      personnelName: "Fake Admin",
    });
    expect(res.status).toBe(400);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("3b. malformed candidateUserId / confidence → 400", async () => {
    expect((await postDenied({ reason: "LIVENESS_TIMEOUT", candidateUserId: "25; DROP TABLE" })).status).toBe(400);
    expect((await postDenied({ reason: "LIVENESS_TIMEOUT", confidence: 7 })).status).toBe(400);
    expect((await postDenied({ reason: "LIVENESS_TIMEOUT", confidence: "high" })).status).toBe(400);
    expect((await postDenied({ reason: "LIVENESS_TIMEOUT", confidence: -0.2 })).status).toBe(400);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("4. FINAL_IDENTITY_MISMATCH → critical Identity Confirmation Failure, Pending Review", async () => {
    const location = nextLocation();
    const res = await postDenied({
      reason: "FINAL_IDENTITY_MISMATCH", candidateUserId: 25,
      cameraLocation: location, confidence: 0.67,
    });

    expect(res.status).toBe(201);
    expect(res.body.logged).toBe(true);
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
    const written = mockSecurityLog.create.mock.calls[0][0];
    expect(written.type).toBe("Identity Confirmation Failure");
    expect(written.severity).toBe("critical");
    expect(written.icon).toBe("DENIED");
    expect(written.reviewStatus).toBe("Pending Review");
    expect(written.desc).toContain(`final same-person check at ${location}`);
    expect(written.matchedUserId).toBe(25);

    expect(res.body.log).toMatchObject({
      type: "Identity Confirmation Failure",
      severity: "critical",
      icon: "DENIED",
      reviewStatus: "Pending Review",
      personnelName: "Tan Xiu Li, Felicia",
      role: "Staff",
      confidence: 0.67,
      cameraLocation: location,
    });
  });

  test("5. LIVENESS_TIMEOUT → critical Liveness Verification Failed, Pending Review", async () => {
    const location = nextLocation();
    const res = await postDenied({ reason: "LIVENESS_TIMEOUT", candidateUserId: 25, cameraLocation: location });

    expect(res.status).toBe(201);
    const written = mockSecurityLog.create.mock.calls[0][0];
    expect(written.type).toBe("Liveness Verification Failed");
    expect(written.severity).toBe("critical");
    expect(written.icon).toBe("DENIED");
    expect(written.reviewStatus).toBe("Pending Review");
    expect(written.desc).toContain(`head-turn verification timed out at ${location}`);
  });

  test("6. MULTIPLE_FACES → Multiple Faces Detected with ALERT icon, Pending Review", async () => {
    const location = nextLocation();
    const res = await postDenied({ reason: "MULTIPLE_FACES", cameraLocation: location });

    expect(res.status).toBe(201);
    const written = mockSecurityLog.create.mock.calls[0][0];
    expect(written.type).toBe("Multiple Faces Detected");
    expect(written.severity).toBe("critical");
    expect(written.icon).toBe("ALERT");
    expect(written.reviewStatus).toBe("Pending Review");
    expect(written.desc).toContain(`access-verification attempt at ${location}`);
    expect(written.personnelName).toBeNull();
    expect(written.matchedUserId).toBeNull();
  });

  test("7. candidate name/role come from PostgreSQL — never trusted from the client", async () => {
    const res = await postDenied({
      reason: "FINAL_IDENTITY_MISMATCH", candidateUserId: 25, cameraLocation: nextLocation(),
    });
    expect(mockUser.findByPk).toHaveBeenCalledWith(25, expect.objectContaining({
      attributes: expect.not.arrayContaining(["faceVector", "password", "tokenVersion"]),
    }));
    expect(res.body.log.personnelName).toBe("Tan Xiu Li, Felicia");
    expect(res.body.log.role).toBe("Staff");
  });

  test("7b. candidate id the DB no longer knows → logged as unknown identity", async () => {
    primeDb({ 999: null });
    const res = await postDenied({
      reason: "FINAL_IDENTITY_MISMATCH", candidateUserId: 999, cameraLocation: nextLocation(),
    });
    expect(res.status).toBe(201);
    const written = mockSecurityLog.create.mock.calls[0][0];
    expect(written.personnelName).toBeNull();
    expect(written.matchedUserId).toBeNull();
  });

  test("8. faceVector and sensitive fields never appear in the response or the written row", async () => {
    const res = await postDenied({
      reason: "FINAL_IDENTITY_MISMATCH", candidateUserId: 25, cameraLocation: nextLocation(),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/faceVector|embedding|password|tokenVersion|data:image/i);
    expect(JSON.stringify(mockSecurityLog.create.mock.calls[0][0])).not.toMatch(/faceVector|embedding|password|tokenVersion/i);
  });

  test("9. repeated denied events within the cooldown are deduplicated", async () => {
    const location = nextLocation();
    const first = await postDenied({ reason: "LIVENESS_TIMEOUT", candidateUserId: 25, cameraLocation: location });
    expect(first.body.logged).toBe(true);
    for (let i = 0; i < 3; i++) {
      const res = await postDenied({ reason: "LIVENESS_TIMEOUT", candidateUserId: 25, cameraLocation: location });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ logged: false, deduplicated: true });
    }
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
  });

  test("9b. dedup keys are per reason/identity/location", async () => {
    const location = nextLocation();
    await postDenied({ reason: "LIVENESS_TIMEOUT", candidateUserId: 25, cameraLocation: location });
    await postDenied({ reason: "FINAL_IDENTITY_MISMATCH", candidateUserId: 25, cameraLocation: location });
    await postDenied({ reason: "MULTIPLE_FACES", cameraLocation: location });
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(3);
  });

  test("10. creates no Attendance record and modifies no User", async () => {
    await postDenied({ reason: "FINAL_IDENTITY_MISMATCH", candidateUserId: 25, cameraLocation: nextLocation() });
    expect(mockAttendance.create).not.toHaveBeenCalled();
    expect(mockAttendance.findAll).not.toHaveBeenCalled();
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  test("SecurityLog write failure → controlled 500, UI-safe error only", async () => {
    mockSecurityLog.create.mockRejectedValue(new Error("db down"));
    const res = await postDenied({ reason: "LIVENESS_TIMEOUT", cameraLocation: nextLocation() });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not record denied event." });
  });
});

describe("existing recognition/audit behaviour is unchanged", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLogCooldowns();
    primeDb({ 25: feliciaUser });
    mockSecurityLog.create.mockImplementation((values) =>
      Promise.resolve({ ...values, createdAt: new Date("2026-07-12T08:00:00.000Z") }));
  });

  test("11. /recognize still writes Intrusion Alert (unknown) and Suspended Access Attempt itself", async () => {
    mockAxios.post.mockResolvedValue({ data: { matchedUserId: null, confidence: 0.3, box: [1, 2, 3, 4], liveness_ratio: 0.5, faceDetected: true } });
    let res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(res.body.user.status).toBe("DENIED");
    expect(mockSecurityLog.create.mock.calls[0][0].type).toBe("Intrusion Alert");

    primeDb({ 25: { ...feliciaUser, isActive: false } });
    mockAxios.post.mockResolvedValue({ data: { matchedUserId: 25, confidence: 0.9, box: [1, 2, 3, 4], liveness_ratio: 0.5, faceDetected: true } });
    res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(res.body.user.status).toBe("SUSPENDED");
    expect(mockSecurityLog.create.mock.calls[1][0].type).toBe("Suspended Access Attempt");
  });

  test("12. /access-event logged field remains a boolean (createSecurityLog stays boolean)", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/access-event")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ userId: 25, cameraLocation: nextLocation() });
    expect(res.status).toBe(200);
    expect(typeof res.body.logged).toBe("boolean");
    expect(res.body.logged).toBe(true);

    // Service-level contract: the legacy helper still resolves to true/false.
    const asBoolean = await createSecurityLog({
      type: "Gantry Access", desc: "x", severity: "safe", icon: "UNLOCK",
      personnelName: "n", cameraLocation: nextLocation(),
    });
    expect(asBoolean).toBe(true);
    mockSecurityLog.create.mockRejectedValue(new Error("db down"));
    const asFalse = await createSecurityLog({
      type: "Gantry Access", desc: "x", severity: "safe", icon: "UNLOCK",
      personnelName: "n", cameraLocation: nextLocation(),
    });
    expect(asFalse).toBe(false);
  });
});
