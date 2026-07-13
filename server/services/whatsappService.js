// Mock-safe WhatsApp Cloud API service for Smart Logistics.
//
// Reads ALL credentials from environment variables only — nothing is hardcoded.
//   WHATSAPP_ENABLED            must be exactly "true" to send for real (else mock mode)
//   WHATSAPP_API_URL            e.g. https://graph.facebook.com/v20.0
//   WHATSAPP_ACCESS_TOKEN       Meta access token (preferred)
//   WHATSAPP_API_KEY            fallback token if ACCESS_TOKEN is unset
//   WHATSAPP_PHONE_NUMBER_ID    Meta phone number id
//
// Never throws — always resolves to a result object so a booking flow can't crash on it.

// Read config at call time so env changes (and tests) are picked up; token has a fallback.
function readConfig() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    apiUrl: process.env.WHATSAPP_API_URL,
    token: process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_KEY,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  };
}

// Backwards-compatible API-key mask (last 4 only).
function maskKey(key) {
  if (!key) return '(none)';
  return key.length <= 4 ? '****' : `****${key.slice(-4)}`;
}

// Access-token mask — first 6 + last 4 only.
function maskToken(token) {
  if (!token) return '(none)';
  return token.length <= 10 ? '****' : `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// Phone mask — last 4 digits only.
function maskPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '(none)';
  return digits.length <= 4 ? '****' : `****${digits.slice(-4)}`;
}

// Normalize Singapore numbers: strip spaces/dashes/+, add 65 to bare 8-digit locals.
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s-]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  p = p.replace(/\D/g, '');
  if (p.length === 8) p = `65${p}`;
  return p;
}

function isConfigured() {
  const c = readConfig();
  return c.enabled && Boolean(c.apiUrl && c.token && c.phoneId);
}

// HTTP helper: prefer global fetch (Node 18+); fall back to axios if unavailable.
async function httpPostJson(url, token, payload) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (typeof fetch === 'function') {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, data };
  }
  const axios = require('axios');
  try {
    const r = await axios.post(url, payload, { headers, timeout: 10000 });
    return { ok: true, status: r.status, data: r.data };
  } catch (e) {
    return { ok: false, status: e.response?.status, data: e.response?.data };
  }
}

// Core sender. Never throws — always resolves to a result object.
async function sendMessage(to, body) {
  const { enabled, apiUrl, token, phoneId } = readConfig();

  // Mock mode: WHATSAPP_ENABLED is not exactly "true".
  if (!enabled) {
    console.log(`[WhatsApp] Simulated send (WHATSAPP_ENABLED is not "true"). to=${maskPhone(to)} body="${body}"`);
    return { success: true, simulated: true, message: 'WhatsApp disabled — message simulated.' };
  }

  // Enabled but misconfigured → safe failure (do not call the API, do not crash).
  if (!apiUrl || !token || !phoneId) {
    console.error('[WhatsApp] Enabled but missing config (API_URL / token / PHONE_NUMBER_ID) — cannot send.');
    return { success: false, simulated: false, error: 'WhatsApp is enabled but credentials are incomplete.' };
  }

  const normalized = normalizePhone(to);
  const url = `${apiUrl.replace(/\/$/, '')}/${phoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: normalized,
    type: 'text',
    text: { preview_url: false, body },
  };

  try {
    const result = await httpPostJson(url, token, payload);
    if (!result.ok) {
      const metaMsg = result.data?.error?.message || `HTTP ${result.status || 'error'}`;
      console.error(`[WhatsApp] Send failed to ${maskPhone(normalized)} (token ${maskToken(token)}): ${metaMsg}`);
      return { success: false, simulated: false, error: metaMsg };
    }
    console.log(`[WhatsApp] Sent to ${maskPhone(normalized)} (token ${maskToken(token)})`);
    return { success: true, simulated: false, message: 'WhatsApp message sent.' };
  } catch (err) {
    console.error(`[WhatsApp] Send error to ${maskPhone(normalized)} (token ${maskToken(token)}): ${err.message}`);
    return { success: false, simulated: false, error: err.message };
  }
}

function formatSlot(booking) {
  if (!booking.slot_start) return 'your scheduled time';
  try {
    return new Date(booking.slot_start).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(booking.slot_start);
  }
}

function formatSlotRange(booking) {
  const start = formatSlot(booking);
  if (!booking.slot_end) return start;
  try {
    const end = new Date(booking.slot_end).toLocaleString('en-SG', { timeStyle: 'short' });
    return `${start} – ${end}`;
  } catch {
    return start;
  }
}

// Driver-pass deep link (read base URL from env; falls back for local demo).
function driverPassLink(booking) {
  if (!booking.booking_ref) return '';
  const base = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/driver-pass/${booking.booking_ref}`;
}

// --- Notification events (all non-throwing; simulated when WhatsApp is disabled) ---

// Booking created — full details + driver pass link.
function sendBookingCreated(booking) {
  const link = driverPassLink(booking);
  const lines = [
    'FlowGuard — Harrison Food Factory',
    `Booking ${booking.booking_ref} received.`,
    `Company: ${booking.transport_company} · Plate: ${booking.license_plate}`,
    `Bay: ${booking.loading_bay} · Slot: ${formatSlotRange(booking)}`,
    link ? `Driver pass: ${link}` : null,
    'Please wait for confirmation before arriving.',
  ].filter(Boolean);
  return sendMessage(booking.driver_phone, lines.join('\n'));
}

function sendBookingConfirmed(booking) {
  return sendMessage(
    booking.driver_phone,
    `FlowGuard: Booking ${booking.booking_ref} is confirmed for ${formatSlotRange(booking)}, ${booking.loading_bay}. Please wait for the call-in and do not arrive early.`
  );
}

function sendBookingArrived(booking) {
  return sendMessage(
    booking.driver_phone,
    `FlowGuard: Arrival logged for booking ${booking.booking_ref} at ${booking.loading_bay}. Please proceed to check-in.`
  );
}

function sendBookingCompleted(booking) {
  return sendMessage(
    booking.driver_phone,
    `FlowGuard: Loading session completed for booking ${booking.booking_ref} at ${booking.loading_bay}. Thank you — safe travels.`
  );
}

function sendNextInLine(booking) {
  return sendMessage(
    booking.driver_phone,
    `FlowGuard — Harrison Food Factory: Previous vehicle has left ${booking.loading_bay}. You may proceed to the loading bay if you are ready (booking ${booking.booking_ref}).`
  );
}

function sendBookingCancelled(booking) {
  return sendMessage(
    booking.driver_phone,
    `FlowGuard: Your loading bay booking (${booking.booking_ref}) has been cancelled.`
  );
}

module.exports = {
  sendMessage,
  sendBookingCreated,
  sendBookingConfirmed,
  sendBookingArrived,
  sendBookingCompleted,
  sendNextInLine,
  sendBookingCancelled,
  isConfigured,
  normalizePhone,
  _maskKey: maskKey,
  _maskToken: maskToken,
  _maskPhone: maskPhone,
};
