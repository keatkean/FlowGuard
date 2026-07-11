// Backend tests - POST /api/facial-recognition/recognize orchestration.
// The Node route forwards frames to FastAPI, then resolves identity, role and
// account status from PostgreSQL (the source of truth), never from AI metadata.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const mockUser = { findByPk: jest.fn() };
const mockSecurityLog = { create: jest.fn() };
jest.mock("../../models", () => ({ User: mockUser, SecurityLog: mockSecurityLog }));

const mockAxios = { post: jest.fn() };
jest.mock("axios", () => mockAxios);

process.env.APP_SECRET = "test-secret";
process.env.FACE_AI_URL = "http://fake-ai:8501";
process.env.AI_SERVICE_KEY = "test-ai-key";
process.env.EDGE_SERVICE_TOKEN = "test-edge-token";

const facialRecognitionRouter = require("../../routes/facialRecognition");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use("/api/facial-recognition", facialRecognitionRouter);

const fmToken = jwt.sign({ id: 1, role: "FM" }, process.env.APP_SECRET);
const staffToken = jwt.sign({ id: 60, role: "Staff" }, process.env.APP_SECRET);

const FRAME = "data:image/jpeg;base64,dGVzdA==";

// Unique per-test camera location defeats the route's 30s log-dedup window.
let locSeq = 0;
const nextLocation = () => `Test Gate ${++locSeq}`;

const aiReplies = (data) => mockAxios.post.mockResolvedValue({ data });

// verifyToken is now DB-backed: it re-reads the authenticated account by the
// JWT's id via User.findByPk. Key the mock by id so BOTH the middleware lookup
// (auth ids 1/60) and the route-level lookup (matchedUserId) resolve correctly.
const AUTH_USERS = {
  1: { id: 1, role: "FM", isActive: true },
  60: { id: 60, role: "Staff", isActive: true },
};
const primeDb = (extra = {}) => {
  const table = { ...AUTH_USERS, ...extra };
  mockUser.findByPk.mockImplementation((id) => Promise.resolve(table[id] ?? null));
};

describe("POST /api/facial-recognition/recognize - access control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeDb();
  });

  test("unauthenticated request -> 401", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .send({ image: FRAME });
    expect(res.status).toBe(401);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("Staff token -> 403 (FM only)", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ image: FRAME });
    expect(res.status).toBe(403);
  });

  test("trusted edge token authenticates without a JWT", async () => {
    aiReplies({ matchedUserId: null, confidence: 0, box: null, liveness_ratio: 0.5, faceDetected: false });
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(res.status).toBe(200);
  });

  test("wrong edge token without JWT -> 401", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("x-edge-token", "wrong-token")
      .send({ image: FRAME });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/facial-recognition/recognize - validation & AI forwarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeDb();
  });

  test("missing / non-data-URL image -> 400", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: "not-an-image" });
    expect(res.status).toBe(400);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("forwards the frame to FastAPI with the X-AI-Service-Key header", async () => {
    aiReplies({ matchedUserId: null, faceDetected: false, box: null, liveness_ratio: 0.5 });
    await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(mockAxios.post).toHaveBeenCalledWith(
      "http://fake-ai:8501/user/recognize",
      { image: FRAME },
      expect.objectContaining({
        headers: expect.objectContaining({ "X-AI-Service-Key": "test-ai-key" })
      })
    );
  });

  test("AI service offline -> controlled 503 (no crash)", async () => {
    mockAxios.post.mockRejectedValue({ code: "ECONNREFUSED" });
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/offline/i);
  });

  test("AI service 5xx reply -> 502", async () => {
    mockAxios.post.mockRejectedValue({ response: { status: 500 } });
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/facial-recognition/recognize - outcomes & security logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeDb();
  });

  test("no face detected -> user null and NO suspicious-person log", async () => {
    aiReplies({ matchedUserId: null, confidence: 0, box: null, liveness_ratio: 0.5, faceDetected: false });
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("unknown person -> DENIED result + intrusion SecurityLog (no biometric data)", async () => {
    aiReplies({ matchedUserId: null, confidence: 0.34, box: [1, 2, 3, 4], liveness_ratio: 0.5, faceDetected: true });
    const location = nextLocation();
    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: location });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: null, name: "Unknown Person", role: null, status: "DENIED", confidence: 0.34
    });
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
    const log = mockSecurityLog.create.mock.calls[0][0];
    expect(log.type).toBe("Intrusion Alert");
    expect(log.cameraLocation).toBe(location);
    expect(JSON.stringify(log)).not.toMatch(/faceVector|embedding|vector/i);
  });

  test("repeated unknown detections within the cooldown do NOT flood the log", async () => {
    aiReplies({ matchedUserId: null, confidence: 0.3, box: [1, 2, 3, 4], liveness_ratio: 0.5, faceDetected: true });
    const location = nextLocation();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/facial-recognition/recognize")
        .set("Authorization", `Bearer ${fmToken}`)
        .send({ image: FRAME, cameraLocation: location });
    }
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
  });

  test("recognised ACTIVE user -> AUTHORIZED with name/role from PostgreSQL, no log", async () => {
    aiReplies({ matchedUserId: 25, confidence: 0.92, box: [10, 20, 30, 40], liveness_ratio: 0.31, faceDetected: true });
    // The DB record deliberately differs from anything the AI could claim -
    // proving role/name/status come from PostgreSQL, not FastAPI metadata.
    primeDb({
      25: { id: 25, name: "Tan Xiu Li, Felicia", role: "FM", isActive: true, isEnrolled: true }
    });

    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });

    expect(mockUser.findByPk).toHaveBeenCalledWith(25, expect.any(Object));
    expect(res.body.user).toEqual({
      id: 25, name: "Tan Xiu Li, Felicia", role: "FM", status: "AUTHORIZED", confidence: 0.92
    });
    expect(res.body.box).toEqual([10, 20, 30, 40]);
    expect(res.body.liveness_ratio).toBe(0.31);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
    // Safe fields only - nothing biometric in the response.
    expect(JSON.stringify(res.body)).not.toMatch(/faceVector|embedding/i);
  });

  test("recognised SUSPENDED user -> SUSPENDED result + denial SecurityLog", async () => {
    aiReplies({ matchedUserId: 25, confidence: 0.92, box: [1, 2, 3, 4], liveness_ratio: 0.4, faceDetected: true });
    primeDb({
      25: { id: 25, name: "Tan Xiu Li, Felicia", role: "FM", isActive: false, isEnrolled: true }
    });

    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });

    expect(res.body.user.status).toBe("SUSPENDED");
    expect(res.body.user.name).toBe("Tan Xiu Li, Felicia");
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
    const log = mockSecurityLog.create.mock.calls[0][0];
    expect(log.type).toBe("Suspended Access Attempt");
    expect(log.matchedUserId).toBe(25);
    expect(log.personnelName).toBe("Tan Xiu Li, Felicia");
  });

  test("match for a user the DB no longer knows -> DENIED (stale AI cache)", async () => {
    aiReplies({ matchedUserId: 999, confidence: 0.8, box: [1, 2, 3, 4], liveness_ratio: 0.5, faceDetected: true });
    primeDb({ 999: null }); // FM auth account still resolves; matched id does not

    const res = await request(app)
      .post("/api/facial-recognition/recognize")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME, cameraLocation: nextLocation() });

    expect(res.body.user.status).toBe("DENIED");
    expect(res.body.user.id).toBeNull();
    expect(mockSecurityLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/facial-recognition/evaluate — side-effect-free model evaluation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeDb();
  });

  test("unauthenticated rejected", async () => {
    const res = await request(app).post("/api/facial-recognition/evaluate").send({ image: FRAME });
    expect(res.status).toBe(401);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("non-FM rejected", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/evaluate")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ image: FRAME });
    expect(res.status).toBe(403);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("FM allowed and returns safe telemetry only", async () => {
    aiReplies({ matchedUserId: 25, confidence: 0.91, box: [1, 2, 3, 4], liveness_ratio: 0.31, faceDetected: true, inference_ms: 77 });
    const res = await request(app)
      .post("/api/facial-recognition/evaluate")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      matchedUserId: 25,
      outcome: "MATCHED",
      confidence: 0.91,
      box: [1, 2, 3, 4],
      liveness: { ratio: 0.31, status: "movement-detected" },
      timings: { inferenceMs: 77 }
    });
    expect(JSON.stringify(res.body)).not.toMatch(/data:image|template|vector|embedding|name|email/i);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
    expect(mockUser.findByPk).toHaveBeenCalledTimes(1); // auth lookup only; no matched-user DB resolution or mutation
  });

  test("no face returns NO_FACE without suspicious log", async () => {
    aiReplies({ matchedUserId: null, confidence: 0, box: null, liveness_ratio: 0.5, faceDetected: false, inference_ms: 10 });
    const res = await request(app)
      .post("/api/facial-recognition/evaluate")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("NO_FACE");
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("FastAPI failure returns controlled 503", async () => {
    mockAxios.post.mockRejectedValue({ code: "ECONNREFUSED" });
    const res = await request(app)
      .post("/api/facial-recognition/evaluate")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/offline/i);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });
});