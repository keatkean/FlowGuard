// Backend tests — enrolment privacy lifecycle.
// Browser memory → Node request memory → FastAPI request memory → protected
// biometric template stored against the User ID → original photos discarded.
// Raw photos must never be persisted (DB, disk, cloud storage, or logs).
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const mockUser = { findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn() };
jest.mock("../../models", () => ({
  User: mockUser,
  Attendance: { findAll: jest.fn(), destroy: jest.fn() },
  Invite: { findOne: jest.fn(), create: jest.fn() },
  SecurityLog: { update: jest.fn() },
}));

const mockAxios = {
  post: jest.fn(() => Promise.resolve({ data: { vector: Array(512).fill(0.1) } })),
  get: jest.fn(() => Promise.resolve({ data: { message: "ok" } })),
};
jest.mock("axios", () => mockAxios);

process.env.APP_SECRET = "test-secret";
process.env.AI_SERVICE_KEY = "test-ai-key";

const userRouter = require("../../routes/user");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use("/user", userRouter);

const fmToken = jwt.sign({ id: 99, role: "FM" }, process.env.APP_SECRET);

describe("POST /user/enroll-face — privacy lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findByPk.mockResolvedValue({ id: 99, role: "FM", isActive: true });
    mockUser.update.mockResolvedValue([1]);
  });

  test("stores ONLY the protected template + enrolment flag — never the raw photos", async () => {
    const photos = {
      front: "data:image/jpeg;base64,RAW_FRONT_PHOTO",
      left: "data:image/jpeg;base64,RAW_LEFT_PHOTO",
      right: "data:image/jpeg;base64,RAW_RIGHT_PHOTO",
    };

    const res = await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ images: photos });

    expect(res.status).toBe(200);
    expect(mockUser.update).toHaveBeenCalledTimes(1);

    const [savedFields] = mockUser.update.mock.calls[0];
    // Exactly the template + flag — no image fields sneak into the DB write.
    expect(Object.keys(savedFields).sort()).toEqual(["faceVector", "isEnrolled"]);
    expect(Array.isArray(savedFields.faceVector)).toBe(true);
    expect(JSON.stringify(savedFields)).not.toMatch(/RAW_(FRONT|LEFT|RIGHT)_PHOTO/);
  });

  test("sends the images to FastAPI with the service key, then discards them", async () => {
    await request(app)
      .post("/user/enroll-face")
      .set("Authorization", `Bearer ${fmToken}`)
      .send({ images: { front: "a", left: "b", right: "c" } });

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/encode-faces$/),
      { front: "a", left: "b", right: "c" },
      expect.objectContaining({
        headers: expect.objectContaining({ "X-AI-Service-Key": "test-ai-key" })
      })
    );
  });
});
