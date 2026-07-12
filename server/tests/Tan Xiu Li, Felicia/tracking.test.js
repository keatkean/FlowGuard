// Backend tests - POST /api/facial-recognition/track proxy.
// The tracking route is the scanners' real-time face-box/head-turn feed: it
// forwards one temporary frame to FastAPI's detection-only endpoint and
// returns SAFE transient telemetry — never an identity, never a database
// read/write, never an Attendance or SecurityLog side effect.
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const mockUser = { findByPk: jest.fn() };
const mockSecurityLog = { create: jest.fn() };
const mockAttendance = { create: jest.fn(), findOne: jest.fn() };
const mockEvaluationParticipant = { findOne: jest.fn() };
const mockParticipantService = { listEvaluationParticipants: jest.fn(), syncEligibleEvaluationParticipants: jest.fn() };
jest.mock("../../models", () => ({
  User: mockUser,
  SecurityLog: mockSecurityLog,
  Attendance: mockAttendance,
  EvaluationParticipant: mockEvaluationParticipant
}));
jest.mock("../../services/evaluationParticipants", () => mockParticipantService);

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

const AUTH_USERS = {
  1: { id: 1, role: "FM", isActive: true },
  60: { id: 60, role: "Staff", isActive: true },
};
const primeDb = () => {
  mockUser.findByPk.mockImplementation((id) => Promise.resolve(AUTH_USERS[id] ?? null));
};

const aiReplies = (data) => mockAxios.post.mockResolvedValue({ data });

describe("POST /api/facial-recognition/track - access control", () => {
  beforeEach(() => { jest.clearAllMocks(); primeDb(); });

  test("unauthenticated request -> 401 (service-key path never reached)", async () => {
    const res = await request(app).post("/api/facial-recognition/track").send({ image: FRAME });
    expect(res.status).toBe(401);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("Staff token -> 403 (FM only)", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ image: FRAME });
    expect(res.status).toBe(403);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("trusted edge token authenticates without a JWT", async () => {
    aiReplies({ faceDetected: false, faceCount: 0, box: null, headTurnRatio: null });
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/facial-recognition/track - forwarding & timeout", () => {
  beforeEach(() => { jest.clearAllMocks(); primeDb(); });

  test("missing / non-data-URL image -> 400", async () => {
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: "not-an-image" });
    expect(res.status).toBe(400);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("forwards to FastAPI /user/track with the service key and a SHORTER timeout than recognition", async () => {
    aiReplies({ faceDetected: false, faceCount: 0, box: null, headTurnRatio: null });
    await request(app)
      .post("/api/facial-recognition/track")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME });
    expect(mockAxios.post).toHaveBeenCalledWith(
      "http://fake-ai:8501/user/track",
      { image: FRAME },
      expect.objectContaining({
        timeout: 5000, // full recognition uses 15000
        headers: expect.objectContaining({ "X-AI-Service-Key": "test-ai-key" })
      })
    );
  });

  test("AI service offline -> controlled 503", async () => {
    mockAxios.post.mockRejectedValue({ code: "ECONNREFUSED" });
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ image: FRAME });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/offline/i);
  });

  test("tracking timeout (ECONNABORTED) -> controlled 503, no side effects", async () => {
    mockAxios.post.mockRejectedValue({ code: "ECONNABORTED" });
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME });
    expect(res.status).toBe(503);
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/facial-recognition/track - safe telemetry only, zero side effects", () => {
  beforeEach(() => { jest.clearAllMocks(); primeDb(); });

  test("returns box + headTurnRatio and NEVER identity data, even if the AI reply leaks extras", async () => {
    aiReplies({
      faceDetected: true,
      faceCount: 1,
      box: [10, 20, 100, 120],
      headTurnRatio: 0.47,
      inferenceMs: 120,
      // Hostile/buggy extras that must be stripped by the whitelist:
      matchedUserId: 25,
      name: "Should Never Pass Through",
      embedding: [0.1, 0.2]
    });
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      faceDetected: true,
      faceCount: 1,
      box: [10, 20, 100, 120],
      headTurnRatio: 0.47,
      inferenceMs: 120
    });
    expect(JSON.stringify(res.body)).not.toMatch(/matchedUserId|name|user|embedding|vector|confidence/i);
  });

  test("does not query User/Attendance or write SecurityLogs", async () => {
    aiReplies({ faceDetected: true, faceCount: 1, box: [1, 2, 3, 4], headTurnRatio: 0.5 });
    // Edge-token auth so even the auth middleware performs no DB lookup.
    await request(app)
      .post("/api/facial-recognition/track")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME });
    expect(mockUser.findByPk).not.toHaveBeenCalled();
    expect(mockAttendance.create).not.toHaveBeenCalled();
    expect(mockSecurityLog.create).not.toHaveBeenCalled();
  });

  test("no-face result passes through as an explicit null box/ratio", async () => {
    aiReplies({ faceDetected: false, faceCount: 0, box: null, headTurnRatio: null, inferenceMs: 40 });
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ faceDetected: false, faceCount: 0, box: null, headTurnRatio: null });
    expect(mockSecurityLog.create).not.toHaveBeenCalled(); // never an intrusion log from tracking
  });

  test("multiple-face result reports the count so the UI can halt authorization", async () => {
    aiReplies({ faceDetected: true, faceCount: 2, box: [5, 5, 50, 60], headTurnRatio: 0.52, inferenceMs: 90 });
    const res = await request(app)
      .post("/api/facial-recognition/track")
      .set("x-edge-token", "test-edge-token")
      .send({ image: FRAME });
    expect(res.status).toBe(200);
    expect(res.body.faceCount).toBe(2);
    expect(res.body.faceDetected).toBe(true);
  });
});
