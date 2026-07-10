// Backend RBAC tests — requireRole middleware (FM-only / FM+Staff gates).
// verifyToken is DB-backed: the mocked User table below is the authoritative
// source of each account's role/active state, keyed by the JWT's user id.
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const DB_USERS = {
  1: { id: 1, role: "FM", isActive: true },
  2: { id: 2, role: "Tenant", isActive: true },
  3: { id: 3, role: "Staff", isActive: true },
};
jest.mock("../../models", () => ({
  User: { findByPk: jest.fn((id) => Promise.resolve(DB_USERS[id] || null)) },
}));

process.env.APP_SECRET = "test-secret";
const { verifyToken, requireRole, ROLES } = require("../../middlewares/auth");

const app = express();
app.use(express.json());
app.get("/fm-only", verifyToken, requireRole(ROLES.FM), (req, res) => res.json({ ok: true }));
app.get("/fm-staff", verifyToken, requireRole(ROLES.FM, ROLES.STAFF), (req, res) => res.json({ ok: true }));

const ID_BY_ROLE = { FM: 1, Tenant: 2, Staff: 3 };
const token = (role) => jwt.sign({ id: ID_BY_ROLE[role], role }, process.env.APP_SECRET);

describe("requireRole middleware", () => {
  test("no token → 401", async () => {
    const res = await request(app).get("/fm-only");
    expect(res.status).toBe(401);
  });

  test("Tenant on FM-only → 403", async () => {
    const res = await request(app).get("/fm-only").set("Authorization", `Bearer ${token(ROLES.TENANT)}`);
    expect(res.status).toBe(403);
  });

  test("Staff on FM-only → 403", async () => {
    const res = await request(app).get("/fm-only").set("Authorization", `Bearer ${token(ROLES.STAFF)}`);
    expect(res.status).toBe(403);
  });

  test("FM on FM-only → 200", async () => {
    const res = await request(app).get("/fm-only").set("Authorization", `Bearer ${token(ROLES.FM)}`);
    expect(res.status).toBe(200);
  });

  test("Staff on FM+Staff → 200", async () => {
    const res = await request(app).get("/fm-staff").set("Authorization", `Bearer ${token(ROLES.STAFF)}`);
    expect(res.status).toBe(200);
  });

  test("Tenant on FM+Staff → 403", async () => {
    const res = await request(app).get("/fm-staff").set("Authorization", `Bearer ${token(ROLES.TENANT)}`);
    expect(res.status).toBe(403);
  });
});
