# WhatsApp Notification Workflow & Staff Access — Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Additive enhancement of the Smart Logistics WhatsApp workflow + Staff RBAC verification.
No facial-recognition / object-detection / booking-CRUD logic changed. No YOLO/OCR added.
**Date:** 2026-06-21

## What changed

1. **Booking-created notification** — creating a booking now sends/simulates a WhatsApp confirmation
   to the driver (previously only status changes notified).
2. **Full status-change notifications** — Confirmed, Arrived, Completed, and Cancelled each send a
   tailored message (was only Confirmed + next-in-line).
3. **Next-in-line message** updated to the requested wording ("Previous vehicle has left Bay X…").
4. **All WhatsApp sends wrapped non-fatally** in the route so a failure can never fail
   booking creation or a status update.
5. **Driver-pass link** included in the created message, built from `FRONTEND_URL`/`CLIENT_URL`.
6. **Staff access verified** (route, sidebar, view, status update) and locked out of creating bookings.

## WhatsApp mock vs real API behavior

`server/services/whatsappService.js` (unchanged contract):
- **Mock mode (default):** when `WHATSAPP_ENABLED !== "true"` **or** any credential is missing, it
  logs a safe line (key masked to `****1234`) and returns `{ success:true, simulated:true }`. No
  network call. This is what the demo uses.
- **Real mode:** only when **all** of `WHATSAPP_ENABLED=true`, `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`,
  `WHATSAPP_PHONE_NUMBER_ID` are present. Posts to the Graph API with a 10s timeout. On error it logs
  a short status (never the key/payload) and returns `{ success:false }` — it never throws.
- Keys are read from env only, never hardcoded, never logged in full, never committed.

## Environment variables used
```
WHATSAPP_ENABLED=false                          # "true" only with real creds
WHATSAPP_API_URL=https://graph.facebook.com/v19.0
WHATSAPP_API_KEY=your-whatsapp-token            # placeholder only
WHATSAPP_PHONE_NUMBER_ID=your-whatsapp-phone-id
FRONTEND_URL=http://localhost:5173              # base for driver-pass links (falls back to CLIENT_URL)
```
`.env.example` holds placeholders only; no real `.env` is committed.

## Booking creation notification
On a successful `POST /api/bookings/create`, the driver receives:
`FlowGuard — Harrison Food Factory` · `Booking <ref> received` · `Company · Plate` ·
`Bay · Slot (start – end)` · `Driver pass: <FRONTEND_URL>/driver-pass/<ref>` · "wait for confirmation".
The API response now includes a `whatsapp` status object (simulated/real, success).

## Status update notifications (`PATCH /api/bookings/:id/status`, FM/Staff)
| New status | Driver message |
|------------|----------------|
| Confirmed | Booking confirmed for slot/bay; wait for call-in, don't arrive early |
| Arrived | Arrival logged at bay; proceed to check-in |
| Completed | Loading session completed; thank you — safe travels |
| Cancelled | Booking cancelled |

## Next-in-line alert workflow
When a booking is marked **Completed**, the route notifies the leaving driver, then finds the **next
non-cancelled booking for the same bay** (earliest `slot_start`, then `createdAt`) and sends:
*"Previous vehicle has left Bay X. You may proceed to the loading bay if you are ready (booking …)."*
The API returns `nextInLine` (the next booking's ref) so the UI can surface it. This supports the
"previous driver left early → notify the next driver" requirement.

**Dedup:** the query only targets `Pending`/`Confirmed` bookings, so a normal flow notifies the next
driver once. Strict idempotency (e.g. a `nextNotifiedAt` flag to prevent a duplicate if Completed is
re-applied) is deferred to **Phase 2** to avoid a schema change now.

## Staff access behavior
- **Route:** `/logistics` is `ACCESS.ANY` (FM/Staff/Tenant) — Staff can open it.
- **Sidebar:** "Logistics & Bays" renders for FM/Staff/Tenant.
- **View + status:** Staff can list bookings and `PATCH /:id/status` (route allows FM/Staff); the UI
  shows the "Mark …" status buttons for Staff.
- **Create:** Staff **cannot** create — `POST /create` is FM/Tenant only (403 for Staff), and the
  "+ New Booking" button is hidden from Staff. Tenant can still create/cancel their own bookings.

## Error handling
WhatsApp calls are wrapped in `try/catch` in both create and status routes; a failure logs a safe,
masked message and the booking operation still returns success. The `whatsapp` field in the response
makes mock/real status visible for the demo.

## Files changed
| File | Change |
|------|--------|
| `server/services/whatsappService.js` | New events (`sendBookingCreated/Arrived/Completed`), richer messages, driver-pass link, updated next-in-line text |
| `server/routes/booking.js` | Notify on create; per-status notifications (Confirmed/Arrived/Completed/Cancelled); all non-fatal; `whatsapp` in create response |
| `server/.env.example` | Added `FRONTEND_URL` placeholder |
| `client/src/pages/TenantLogistics.jsx` | Surface create-time WhatsApp status in the notice |
| `server/tests/Tan Xiu Li, Felicia/logistics.test.js` | +6 tests (create notify, Staff 403, Tenant create, Arrived/Cancelled notify, WhatsApp-failure resilience) |
| `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` | +2 tests (Staff status controls / no New Booking, Tenant sees New Booking) |
| `docs/Tan Xiu Li, Felicia/whatsapp-notification-workflow-report.md` | This report |

## Tests / build results
```
cd server && npm test            → Test Suites: 5 passed · Tests: 49 passed ✅
cd client && npm test -- --run   → Test Files: 8 passed · Tests: 50 passed ✅
cd client && npm run build       → built successfully ✅
```

## Remaining Phase 2 items
- WhatsApp **approved message templates** for production / outside the 24-hour customer-service window
  (free-text only works inside the session window).
- **Idempotent next-in-line** (a `nextNotifiedAt` flag) to guarantee no duplicate sends on re-completion.
- **YOLO + OCR license-plate recognition** at the gate.
- **QR gate-scan automation** (scan driver pass → auto-mark Arrived).

## Suggested commit message
```
feat(logistics): full WhatsApp notification workflow (mock-safe) + Staff RBAC verified

- whatsappService: add booking-created/arrived/completed events, richer messages,
  driver-pass link, updated next-in-line wording (env-only, masked key, never throws)
- booking route: notify on create; per-status notifications (Confirmed/Arrived/
  Completed/Cancelled); next-in-line on Completed; all WhatsApp sends non-fatal
- frontend: show create-time WhatsApp status in the notice
- Staff: view + status update allowed; create blocked (FM/Tenant only); Tenant create/cancel intact
- tests: +6 backend, +2 frontend; .env.example adds FRONTEND_URL placeholder

Additive only; mock mode default; real send gated on env vars; no AI/CRUD/secret changes.
```
