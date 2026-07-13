// Backend tests — Smart Logistics booking CRUD + WhatsApp (disabled/mock-safe).
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

// Ensure WhatsApp runs in disabled/simulated mode (no real sends, no crash).
delete process.env.WHATSAPP_ENABLED;
process.env.APP_SECRET = "test-secret";

const bookingRouter = require("../../routes/booking");
const whatsapp = require("../../services/whatsappService");

const app = express();
app.use(express.json());
app.use("/api/bookings", bookingRouter);

const tokenFor = (role) => jwt.sign({ id: 7, role, email: `${role}@harrison.com` }, process.env.APP_SECRET);

const validBody = {
  transport_company: "NinjaVan",
  license_plate: "GBG 1234M",
  driver_phone: "+6591234567",
  loading_bay: "Bay A",
};

describe("Booking routes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("POST /create rejects missing required fields (400)", async () => {
    const res = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ transport_company: "NinjaVan" });
    expect(res.status).toBe(400);
  });

  test("POST /create creates a Pending booking (201)", async () => {
    mockBooking.create.mockResolvedValue({ id: 1, ...validBody, status: "Pending" });
    const res = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(mockBooking.create).toHaveBeenCalledWith(expect.objectContaining({ status: "Pending" }));
  });

  test("POST /create triggers a (simulated) WhatsApp confirmation", async () => {
    mockBooking.create.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", status: "Pending" });
    const res = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.whatsapp).toEqual(expect.objectContaining({ simulated: true, success: true }));
  });

  test("Staff CAN create a booking, linked to their tenant/unit (managerId)", async () => {
    // Staff token id = 7; their managerId (tenant) = 50
    mockUser.findByPk.mockResolvedValue({ managerId: 50 });
    mockBooking.create.mockResolvedValue({ id: 3, ...validBody, booking_ref: "FG-STF", status: "Pending" });
    const res = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", `Bearer ${tokenFor("Staff")}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(mockBooking.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 50, status: "Pending" }));
    // WhatsApp still fires on a Staff-created booking
    expect(res.body.whatsapp).toEqual(expect.objectContaining({ simulated: true, success: true }));
  });

  test("POST /create lets a Tenant create their own booking (tenantId set)", async () => {
    mockBooking.create.mockResolvedValue({ id: 2, ...validBody, booking_ref: "FG-TEN", status: "Pending" });
    const res = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", `Bearer ${tokenFor("Tenant")}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(mockBooking.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7 }));
  });

  test("GET / requires authentication (401)", async () => {
    const res = await request(app).get("/api/bookings/");
    expect(res.status).toBe(401);
  });

  test("GET / returns a list for an authenticated FM (200)", async () => {
    mockBooking.findAll.mockResolvedValue([{ id: 1, status: "Pending" }]);
    const res = await request(app).get("/api/bookings/").set("Authorization", `Bearer ${tokenFor("FM")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET / scopes a Tenant to their own bookings", async () => {
    mockBooking.findAll.mockResolvedValue([]);
    await request(app).get("/api/bookings/").set("Authorization", `Bearer ${tokenFor("Tenant")}`);
    expect(mockBooking.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 7 } }));
  });

  test("PATCH /:id/status by FM updates status + simulates WhatsApp (200)", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockBooking.findByPk.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", update });
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: "Confirmed" });
    expect(res.body.whatsapp).toEqual(expect.objectContaining({ simulated: true, success: true }));
  });

  test("PATCH /:id/status is forbidden for Staff (facility-level — FM only) (403)", async () => {
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("Staff")}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(403);
    expect(mockBooking.findByPk).not.toHaveBeenCalled();
  });

  test("PATCH /:id/status to Completed fires a next-in-line alert", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockBooking.findByPk.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", update });
    mockBooking.findOne.mockResolvedValue({ id: 2, ...validBody, booking_ref: "FG-NEXT" });
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Completed" });
    expect(res.status).toBe(200);
    expect(res.body.nextInLine).toBe("FG-NEXT");
  });

  test("PATCH /:id/status to Arrived notifies the driver (FM, 200)", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockBooking.findByPk.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", update });
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Arrived" });
    expect(res.status).toBe(200);
    expect(res.body.whatsapp).toEqual(expect.objectContaining({ simulated: true }));
  });

  test("PATCH /:id/status to Cancelled notifies the driver (200)", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockBooking.findByPk.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", update });
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Cancelled" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: "Cancelled" });
  });

  test("WhatsApp failure does NOT fail the status update (still 200)", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockBooking.findByPk.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", update });
    const spy = jest.spyOn(whatsapp, "sendBookingConfirmed").mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(200);
    spy.mockRestore();
  });

  test("PATCH /:id/status is forbidden for Tenant (403)", async () => {
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("Tenant")}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(403);
  });

  test("PATCH /:id/status returns 404 when booking missing", async () => {
    mockBooking.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/bookings/999/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Confirmed" });
    expect(res.status).toBe(404);
  });

  test("PATCH /:id/status rejects an invalid status (400)", async () => {
    const res = await request(app)
      .patch("/api/bookings/1/status")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ status: "Teleported" });
    expect(res.status).toBe(400);
  });

  test("PATCH /:id/cancel soft-cancels a booking (200)", async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockBooking.findByPk.mockResolvedValue({ id: 1, ...validBody, booking_ref: "FG-AAA", tenantId: 7, update });
    const res = await request(app)
      .patch("/api/bookings/1/cancel")
      .set("Authorization", `Bearer ${tokenFor("FM")}`);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: "Cancelled" });
  });
});

describe("Gate scan (entry/exit)", () => {
  beforeEach(() => jest.clearAllMocks());

  const bookingWith = (status, extra = {}) => ({
    id: 1, ...validBody, booking_ref: "FG-AAA", status,
    update: jest.fn().mockResolvedValue(true), ...extra,
  });

  test("FM marks entry → Arrived (200)", async () => {
    const b = bookingWith("Confirmed");
    mockBooking.findOne.mockResolvedValueOnce(b);
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "entry" });
    expect(res.status).toBe(200);
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ status: "Arrived" }));
  });

  test("Staff CANNOT gate scan — FM only now (403)", async () => {
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("Staff")}`)
      .send({ action: "entry" });
    expect(res.status).toBe(403);
    expect(mockBooking.findOne).not.toHaveBeenCalled();
  });

  test("Tenant cannot gate scan (403)", async () => {
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("Tenant")}`)
      .send({ action: "entry" });
    expect(res.status).toBe(403);
    expect(mockBooking.findOne).not.toHaveBeenCalled();
  });

  test("unauthenticated cannot gate scan (401)", async () => {
    const res = await request(app).patch("/api/bookings/FG-AAA/gate-scan").send({ action: "entry" });
    expect(res.status).toBe(401);
  });

  test("invalid booking ref → 404", async () => {
    mockBooking.findOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .patch("/api/bookings/FG-NONE/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "entry" });
    expect(res.status).toBe(404);
  });

  test("entry on a Cancelled booking is rejected (409)", async () => {
    mockBooking.findOne.mockResolvedValueOnce(bookingWith("Cancelled"));
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "entry" });
    expect(res.status).toBe(409);
  });

  test("exit → Completed and triggers next-in-line for same bay (200)", async () => {
    const b = bookingWith("Arrived");
    mockBooking.findOne
      .mockResolvedValueOnce(b)                                       // lookup
      .mockResolvedValueOnce({ id: 2, ...validBody, booking_ref: "FG-NEXT" }); // next-in-line
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "exit" });
    expect(res.status).toBe(200);
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ status: "Completed" }));
    expect(res.body.nextInLine).toBe("FG-NEXT");
  });

  test("exit on an already-Completed booking does not duplicate (200, no nextInLine)", async () => {
    mockBooking.findOne.mockResolvedValueOnce(bookingWith("Completed"));
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "exit" });
    expect(res.status).toBe(200);
    expect(res.body.alreadyCompleted).toBe(true);
    expect(res.body.nextInLine).toBeNull();
    expect(mockBooking.findOne).toHaveBeenCalledTimes(1); // no next-in-line lookup
  });

  test("plate mismatch is flagged but the scan still succeeds", async () => {
    const b = bookingWith("Confirmed"); // license_plate = "GBG 1234M"
    mockBooking.findOne.mockResolvedValueOnce(b);
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "entry", observedPlate: "XYZ 0000Z" });
    expect(res.status).toBe(200);
    expect(res.body.plateMatched).toBe(false);
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ status: "Arrived" }));
  });

  test("WhatsApp failure does not fail the gate scan (still 200)", async () => {
    const b = bookingWith("Confirmed");
    mockBooking.findOne.mockResolvedValueOnce(b);
    const spy = jest.spyOn(whatsapp, "sendBookingArrived").mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .patch("/api/bookings/FG-AAA/gate-scan")
      .set("Authorization", `Bearer ${tokenFor("FM")}`)
      .send({ action: "entry" });
    expect(res.status).toBe(200);
    spy.mockRestore();
  });
});

describe("WhatsApp service (disabled mode)", () => {
  test("is not configured without WHATSAPP_ENABLED=true", () => {
    expect(whatsapp.isConfigured()).toBe(false);
  });

  test("sendBookingConfirmed returns a simulated success and does not throw", async () => {
    const result = await whatsapp.sendBookingConfirmed({ driver_phone: "+6500000000", loading_bay: "Bay A" });
    expect(result).toEqual(expect.objectContaining({ success: true, simulated: true }));
  });

  test("masks the API key in logs", () => {
    expect(whatsapp._maskKey("supersecret1234")).toBe("****1234");
    expect(whatsapp._maskKey("")).toBe("(none)");
  });
});
