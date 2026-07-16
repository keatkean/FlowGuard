const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Booking, User } = require('../models');
const { verifyToken, requireRole } = require('../middlewares/auth');
const whatsapp = require('../services/whatsappService');

const STATUSES = ['Pending', 'Confirmed', 'Arrived', 'Completed', 'Cancelled'];

function genRef() {
    return `FG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Resolve which tenant/unit a booking belongs to, based on who is creating it:
//   Tenant → their own id; Staff → their managerId (the tenant they work for); FM → optional body.tenantId.
// Returns null if it cannot be determined (FM with no tenantId, or Staff with no manager).
async function resolveTenantId(user, bodyTenantId) {
    if (user.role === 'Tenant') return user.id;
    if (user.role === 'Staff') {
        const staff = await User.findByPk(user.id, { attributes: ['managerId'] });
        return staff?.managerId ?? null;
    }
    return bodyTenantId || null; // FM
}

// ---------------------------------------------------------------------------
// CREATE — FM, Tenant, or Staff create a loading-bay booking request. (400 on bad input)
// Staff may book on behalf of their tenant/unit (booking is linked to their managerId).
// ---------------------------------------------------------------------------
router.post('/create', verifyToken, requireRole('FM', 'Tenant', 'Staff'), async (req, res) => {
    try {
        const {
            transport_company, license_plate, driver_phone, loading_bay,
            driver_name, slot_start, slot_end, notes, tenant_name
        } = req.body;

        const missing = ['transport_company', 'license_plate', 'driver_phone', 'loading_bay']
            .filter(f => !req.body[f] || !String(req.body[f]).trim());
        if (missing.length) {
            return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}.` });
        }
        if (!/^[+\d][\d\s-]{6,}$/.test(String(driver_phone))) {
            return res.status(400).json({ error: 'driver_phone is not a valid phone number.' });
        }

        // Optional slot-conflict guard (409) when a time window is supplied.
        if (slot_start && slot_end) {
            if (new Date(slot_end) <= new Date(slot_start)) {
                return res.status(400).json({ error: 'slot_end must be after slot_start.' });
            }
            const clash = await Booking.findOne({
                where: {
                    loading_bay,
                    status: { [Op.ne]: 'Cancelled' },
                    slot_start: { [Op.lt]: new Date(slot_end) },
                    slot_end: { [Op.gt]: new Date(slot_start) }
                }
            });
            if (clash) {
                return res.status(409).json({ error: `${loading_bay} is already booked for that time window.` });
            }
        }

        // Link the booking to a tenant/unit so the right people can see it
        // (Tenant → self, Staff → their managerId, FM → optional body.tenantId).
        const tenantId = await resolveTenantId(req.user, req.body.tenantId);

        const booking = await Booking.create({
            booking_ref: genRef(),
            transport_company,
            license_plate,
            driver_phone,
            loading_bay,
            driver_name: driver_name || null,
            slot_start: slot_start || null,
            slot_end: slot_end || null,
            notes: notes || null,
            tenant_name: tenant_name || null,
            tenantId,
            status: 'Pending'
        });

        // Confirmation to the driver — non-fatal (must never fail the booking).
        let whatsappResult = null;
        try {
            whatsappResult = await whatsapp.sendBookingCreated(booking);
        } catch (waErr) {
            console.error('WhatsApp notify failed (non-fatal):', waErr.message);
        }

        res.status(201).json({ message: 'Booking created.', booking, whatsapp: whatsappResult });
    } catch (err) {
        console.error('Booking create error:', err);
        res.status(500).json({ error: 'Internal server error while creating booking.' });
    }
});

// ---------------------------------------------------------------------------
// READ (list) — FM sees all; Tenant sees own unit; Staff sees their unit's bookings.
// ---------------------------------------------------------------------------
router.get('/', verifyToken, async (req, res) => {
    try {
        const where = {};
        if (req.user.role === 'Tenant') {
            where.tenantId = req.user.id;
        } else if (req.user.role === 'Staff') {
            // Staff only see bookings for the tenant/unit they belong to.
            const tenantId = await resolveTenantId(req.user, null);
            where.tenantId = tenantId ?? -1; // -1 → matches nothing if no manager set
        }
        // FM → no filter (all bookings)
        const bookings = await Booking.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
        res.status(200).json(bookings);
    } catch (err) {
        console.error('Booking list error:', err);
        res.status(500).json({ error: 'Could not retrieve bookings.' });
    }
});

// READ (all) — FM-only compat alias (unscoped). Declared BEFORE '/:ref'.
router.get('/all', verifyToken, requireRole('FM'), async (req, res) => {
    try {
        const bookings = await Booking.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
        res.status(200).json(bookings);
    } catch (err) {
        console.error('Booking list error:', err);
        res.status(500).json({ error: 'Could not retrieve bookings.' });
    }
});

// ---------------------------------------------------------------------------
// UPDATE status — FM only (facility-level: Pending → Confirmed → Arrived → Completed).
// Confirmed → WhatsApp slot confirmation. Completed → auto next-in-line alert.
// ---------------------------------------------------------------------------
router.patch('/:id/status', verifyToken, requireRole('FM'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}.` });
        }

        const booking = await Booking.findByPk(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });

        await booking.update({ status });

        let whatsappResult = null;
        let nextInLine = null;

        // All WhatsApp sends are non-fatal — a failure must never fail the status update.
        try {
            if (status === 'Confirmed') {
                whatsappResult = await whatsapp.sendBookingConfirmed(booking);
            } else if (status === 'Arrived') {
                whatsappResult = await whatsapp.sendBookingArrived(booking);
            } else if (status === 'Cancelled') {
                whatsappResult = await whatsapp.sendBookingCancelled(booking);
            } else if (status === 'Completed') {
                // Notify the leaving driver, then alert the next waiting booking for the same bay.
                whatsappResult = await whatsapp.sendBookingCompleted(booking);
                const next = await Booking.findOne({
                    where: { loading_bay: booking.loading_bay, status: { [Op.in]: ['Pending', 'Confirmed'] } },
                    order: [['slot_start', 'ASC'], ['createdAt', 'ASC']]
                });
                if (next) {
                    await whatsapp.sendNextInLine(next);
                    nextInLine = next.booking_ref;
                }
            }
        } catch (waErr) {
            console.error('WhatsApp notify failed (non-fatal):', waErr.message);
        }

        res.status(200).json({ message: `Booking ${status}.`, booking, whatsapp: whatsappResult, nextInLine });
    } catch (err) {
        console.error('Booking status error:', err);
        res.status(500).json({ error: 'Could not update booking status.' });
    }
});

// ---------------------------------------------------------------------------
// EDIT — manual booking update. FM may edit any booking; a Tenant may edit
// only their own unit's bookings. Closed bookings cannot be edited.
// Editable fields only — status changes stay on /:id/status and /:ref/gate-scan,
// and cancellation remains the soft-delete on /:id/cancel.
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
    'transport_company', 'driver_name', 'driver_phone', 'license_plate',
    'loading_bay', 'slot_start', 'slot_end', 'notes'
];

router.patch('/:id', verifyToken, requireRole('FM', 'Tenant'), async (req, res) => {
    try {
        const booking = await Booking.findByPk(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });

        const isFM = req.user.role === 'FM';
        const isOwnerTenant = req.user.role === 'Tenant' && booking.tenantId === req.user.id;
        if (!isFM && !isOwnerTenant) {
            return res.status(403).json({ error: 'You can only edit your own bookings.' });
        }
        if (['Completed', 'Cancelled'].includes(booking.status)) {
            return res.status(409).json({ error: `Cannot edit a ${booking.status} booking.` });
        }

        // Whitelist — ignore any other fields (status, tenantId, booking_ref…).
        const updates = {};
        for (const field of EDITABLE_FIELDS) {
            if (field in req.body) updates[field] = req.body[field];
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No editable fields supplied.' });
        }

        if ('driver_phone' in updates && !/^[+\d][\d\s-]{6,}$/.test(String(updates.driver_phone))) {
            return res.status(400).json({ error: 'driver_phone is not a valid phone number.' });
        }

        // Slot-conflict validation on the resulting time window/bay.
        const newStart = 'slot_start' in updates ? updates.slot_start : booking.slot_start;
        const newEnd = 'slot_end' in updates ? updates.slot_end : booking.slot_end;
        const newBay = 'loading_bay' in updates ? updates.loading_bay : booking.loading_bay;
        if (newStart && newEnd) {
            if (new Date(newEnd) <= new Date(newStart)) {
                return res.status(400).json({ error: 'slot_end must be after slot_start.' });
            }
            const clash = await Booking.findOne({
                where: {
                    id: { [Op.ne]: booking.id }, // ignore the booking being edited
                    loading_bay: newBay,
                    status: { [Op.ne]: 'Cancelled' },
                    slot_start: { [Op.lt]: new Date(newEnd) },
                    slot_end: { [Op.gt]: new Date(newStart) }
                }
            });
            if (clash) {
                return res.status(409).json({ error: `${newBay} is already booked for that time window.` });
            }
        }

        await booking.update(updates);
        res.status(200).json({ message: 'Booking updated.', booking });
    } catch (err) {
        console.error('Booking edit error:', err);
        res.status(500).json({ error: 'Could not update booking.' });
    }
});

// ---------------------------------------------------------------------------
// CANCEL — FM, or the Tenant who owns it. Soft cancel (status='Cancelled').
// ---------------------------------------------------------------------------
router.patch('/:id/cancel', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findByPk(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });

        const isFM = req.user.role === 'FM';
        const isOwnerTenant = req.user.role === 'Tenant' && booking.tenantId === req.user.id;
        if (!isFM && !isOwnerTenant) {
            return res.status(403).json({ error: 'You can only cancel your own bookings.' });
        }

        await booking.update({ status: 'Cancelled' });

        // WhatsApp is non-fatal — a notify failure must never fail the cancel.
        let whatsappResult = null;
        try {
            whatsappResult = await whatsapp.sendBookingCancelled(booking);
        } catch (waErr) {
            console.error('WhatsApp notify failed (non-fatal):', waErr.message);
        }

        res.status(200).json({ message: 'Booking cancelled.', booking, whatsapp: whatsappResult });
    } catch (err) {
        console.error('Booking cancel error:', err);
        res.status(500).json({ error: 'Could not cancel booking.' });
    }
});

// ---------------------------------------------------------------------------
// GATE SCAN — FM only: scan/verify a driver pass by booking_ref at the bay.
//   body: { action: 'entry' | 'exit', observedPlate?: string }
//   entry: Pending/Confirmed → Arrived (+ WhatsApp arrival)
//   exit:  Arrived/Confirmed → Completed (+ WhatsApp completed + next-in-line)
// Plate mismatch is flagged (warn) but does not block. WhatsApp is non-fatal.
// ---------------------------------------------------------------------------
router.patch('/:ref/gate-scan', verifyToken, requireRole('FM'), async (req, res) => {
    try {
        const { action, observedPlate } = req.body;
        if (!['entry', 'exit'].includes(action)) {
            return res.status(400).json({ error: "action must be 'entry' or 'exit'." });
        }

        const booking = await Booking.findOne({ where: { booking_ref: req.params.ref } });
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });

        // Optional plate verification (warn-only — never blocks the scan).
        let plateMatched = null;
        if (observedPlate && String(observedPlate).trim()) {
            const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
            plateMatched = norm(observedPlate) === norm(booking.license_plate);
        }

        let whatsappStatus = null;
        let nextInLine = null;

        if (action === 'entry') {
            if (booking.status === 'Cancelled' || booking.status === 'Completed') {
                return res.status(409).json({ error: `Cannot mark arrival: booking is ${booking.status}.`, booking, plateMatched });
            }
            await booking.update({ status: 'Arrived', arrived_at: new Date() });
            try {
                whatsappStatus = await whatsapp.sendBookingArrived(booking);
            } catch (waErr) {
                console.error('WhatsApp notify failed (non-fatal):', waErr.message);
            }
        } else { // exit
            if (booking.status === 'Cancelled') {
                return res.status(409).json({ error: 'Cannot mark exit: booking is Cancelled.', booking, plateMatched });
            }
            if (booking.status === 'Completed') {
                // Idempotent — already completed, do not re-notify / re-trigger next-in-line.
                return res.status(200).json({
                    message: 'Booking already completed.', booking, action,
                    plateMatched, whatsappStatus: null, nextInLine: null, alreadyCompleted: true
                });
            }
            await booking.update({ status: 'Completed', completed_at: new Date() });
            try {
                whatsappStatus = await whatsapp.sendBookingCompleted(booking);
                const next = await Booking.findOne({
                    where: { loading_bay: booking.loading_bay, status: { [Op.in]: ['Pending', 'Confirmed'] } },
                    order: [['slot_start', 'ASC'], ['createdAt', 'ASC']]
                });
                if (next) {
                    await whatsapp.sendNextInLine(next);
                    nextInLine = next.booking_ref;
                }
            } catch (waErr) {
                console.error('WhatsApp notify failed (non-fatal):', waErr.message);
            }
        }

        return res.status(200).json({
            message: `Gate ${action} recorded.`, booking, action, plateMatched, whatsappStatus, nextInLine
        });
    } catch (err) {
        console.error('Gate scan error:', err);
        return res.status(500).json({ error: 'Could not process gate scan.' });
    }
});

// ---------------------------------------------------------------------------
// PUBLIC — driver pass lookup by booking_ref. NO auth (driver has no login).
// MUST stay last so it doesn't shadow '/all' or '/'.
// ---------------------------------------------------------------------------
router.get('/:ref', async (req, res) => {
    try {
        const booking = await Booking.findOne({ where: { booking_ref: req.params.ref } });
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        // SAFE public DTO — only what the driver pass needs. Never expose
        // tenantId, driver_phone, private notes, or internal timestamps.
        res.json({
            booking_ref: booking.booking_ref,
            transport_company: booking.transport_company,
            driver_name: booking.driver_name,
            license_plate: booking.license_plate,
            loading_bay: booking.loading_bay,
            slot_start: booking.slot_start,
            slot_end: booking.slot_end,
            status: booking.status,
            arrived_at: booking.arrived_at,
            completed_at: booking.completed_at
        });
    } catch (err) {
        console.error('Booking lookup error:', err);
        res.status(500).json({ message: 'Error fetching booking' });
    }
});

module.exports = router;
