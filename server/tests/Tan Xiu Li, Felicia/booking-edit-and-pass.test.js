// Backend tests — manual Edit Booking (PATCH /api/bookings/:id) and the safe
// public Driver Pass DTO (GET /api/bookings/:ref).
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockBooking = {
  create: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
};
const mockUser = { findByPk: jest.fn() };
jest.mock("../../models", () => ({ Booking: mockBooking, User: mockUser }));

delete process.env.WHATSAPP_ENABLED;
process.env.APP_SECRET = "test-secret";

const bookingRouter = require("../../routes/booking");

const app = express();
app.use(express.json());
app.use("/api/bookings", bookingRouter);

const tokenFor = (role, id = 7) => jwt.sign({ id, role }, process.env.APP_SECRET);

const makeBooking = (overrides = {}) => ({
  id: 42,
  booking_ref: "FG-EDIT01",
  transport_company: "NinjaVan",
  license_plate: "GBG 1234M",
  driver_phone: "+6591234567",
  driver_name: "Ahmad",
  loading_bay: "Bay A",
  slot_start: "2026-07-10T09:00:00.000Z",
  slot_end: "2026-07-10T10:00:00.000Z",
  notes: "fragile goods",
  status: "Pending",
  tenantId: 50,
  arrived_at: null,
  completed_at: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  update: jest.fn().mockResolvedValue(true),
  ...overrides,
});

describe("PATCH /api/bookings/:id — manual edit", () => {
  beforeEach(() => jest.clearAllMocks());

  test("unauthenticated → 401", async () => {
    const res = await request(app).patch("/api/bookings/42").send({ driver_name: "X" });
    expect(res.status).toBe(401);
  });

  test("Staff cannot edit (403)", async () => {
    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("Staff")}`)
      .send({ driver_name: "X" });
    expect(res.status).toBe(403);
  });

  test("Tenant cannot edit ANOTHER tenant's booking (403)", async () => {
    mockBooking.findByPk.mockResolvedValue(makeBooking({ tenantId: 999 }));
    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("Tenant", 50)}`)
      .send({ driver_name: "X" });
    expect(res.status).toBe(403);
  });

  test("owning Tenant can edit editable fields", async () => {
    const booking = makeBooking({ tenantId: 50 });
    mockBooking.findByPk.mockResolvedValue(booking);
    mockBooking.findOne.mockResolvedValue(null); // no slot clash

    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("Tenant", 50)}`)
      .send({ driver_name: "New Driver", notes: "updated" });

    expect(res.status).toBe(200);
    expect(booking.update).toHaveBeenCalledWith({ driver_name: "New Driver", notes: "updated" });
  });

  test("FM can edit any booking; non-editable fields are ignored", async () => {
    const booking = makeBooking();
    mockBooking.findByPk.mockResolvedValue(booking);
    mockBooking.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ transport_company: "DHL", status: "Completed", tenantId: 1, booking_ref: "HACK" });

    expect(res.status).toBe(200);
    // Whitelist: only the editable field went through — no status/tenantId/ref tampering.
    expect(booking.update).toHaveBeenCalledWith({ transport_company: "DHL" });
  });

  test("slot conflict on the edited window → 409", async () => {
    const booking = makeBooking();
    mockBooking.findByPk.mockResolvedValue(booking);
    mockBooking.findOne.mockResolvedValue(makeBooking({ id: 99 })); // clash

    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ slot_start: "2026-07-10T09:30:00", slot_end: "2026-07-10T10:30:00" });

    expect(res.status).toBe(409);
    expect(booking.update).not.toHaveBeenCalled();
  });

  test("slot_end before slot_start → 400", async () => {
    mockBooking.findByPk.mockResolvedValue(makeBooking());
    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ slot_start: "2026-07-10T10:00:00", slot_end: "2026-07-10T09:00:00" });
    expect(res.status).toBe(400);
  });

  test("closed (Completed/Cancelled) bookings cannot be edited → 409", async () => {
    mockBooking.findByPk.mockResolvedValue(makeBooking({ status: "Completed" }));
    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ driver_name: "X" });
    expect(res.status).toBe(409);
  });

  test("invalid driver_phone → 400", async () => {
    mockBooking.findByPk.mockResolvedValue(makeBooking());
    const res = await request(app)
      .patch("/api/bookings/42")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ driver_phone: "abc" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/bookings/:ref — public Driver Pass safe DTO", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns ONLY the safe pass fields", async () => {
    mockBooking.findOne.mockResolvedValue(makeBooking());
    const res = await request(app).get("/api/bookings/FG-EDIT01");

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "arrived_at", "booking_ref", "completed_at", "driver_name",
      "license_plate", "loading_bay", "slot_end", "slot_start",
      "status", "transport_company",
    ]);
    // Private fields must never leak on the public route.
    expect(res.body.tenantId).toBeUndefined();
    expect(res.body.driver_phone).toBeUndefined();
    expect(res.body.notes).toBeUndefined();
    expect(res.body.createdAt).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });

  test("unknown ref → 404", async () => {
    mockBooking.findOne.mockResolvedValue(null);
    const res = await request(app).get("/api/bookings/FG-NOPE");
    expect(res.status).toBe(404);
  });
});
