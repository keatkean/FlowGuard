# Driver Pass QR + Loading Bay Gate Scan — Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Additive enhancement — driver-pass QR view + FM/Staff gate scan (entry/exit).
No facial-recognition / object-detection / booking-CRUD / WhatsApp logic broken. No YOLO/OCR.
**Date:** 2026-06-21

## What changed

1. **Fixed the driver-pass route mismatch.** The route was `/driver-pass/:bookingId` but
   `DriverPass.jsx` read `useParams().ref`, so the WhatsApp link (`…/driver-pass/<ref>`) opened a
   broken page. Route is now `/driver-pass/:ref` (matches the page + the WhatsApp link).
2. **Driver Pass page rebuilt** to show all required fields + a QR code, with a clear warning for
   Cancelled/Completed bookings and robust 404 handling. Mobile-friendly (reuses `DriverPass.css`).
3. **Gate Scan workflow** added for FM/Staff — a backend `PATCH /api/bookings/:ref/gate-scan` route
   and a Gate Scan modal on the Logistics page (manual booking-ref entry + optional plate).
4. **Booking model** gained nullable `arrived_at` / `completed_at` timestamps (additive).

## Driver pass route used
**`/driver-pass/:ref`** — canonical. The WhatsApp `driverPassLink()` already builds
`${FRONTEND_URL}/driver-pass/<booking_ref>`, which now resolves correctly.
`/driver-portal` (no `:ref`) is a separate mock page and was left untouched (no conflict).

## QR code flow
- `DriverPass.jsx` uses the already-installed **`react-qr-code`** (no new dependency).
- The QR **encodes the booking reference** (e.g. `FG-02C7F5`) — simplest for the gate-scan lookup,
  which is keyed on `booking_ref`.
- The page fetches the booking via the **public** route `GET /api/bookings/:ref` and shows:
  FlowGuard / Harrison Food Factory, reference, transport company, plate, driver name, bay,
  slot start/end, current **status badge**, the QR, and a warning banner if Cancelled/Completed.

## Gate scan entry/exit flow
Backend: `PATCH /api/bookings/:ref/gate-scan` (auth, **FM/Staff only**),
body `{ action: 'entry' | 'exit', observedPlate?: string }`.

- **Entry:** `Pending`/`Confirmed` → **Arrived** (`arrived_at` set) + WhatsApp arrival message.
  `Cancelled`/`Completed` → rejected `409`.
- **Exit:** `Arrived`/`Confirmed` → **Completed** (`completed_at` set) + WhatsApp completed message +
  next-in-line alert. `Cancelled` → `409`. Already `Completed` → `200 { alreadyCompleted:true }`
  with **no duplicate** notification / next-in-line.
- **Plate check:** if `observedPlate` is supplied it's normalized and compared to
  `booking.license_plate`; a mismatch is **flagged** (`plateMatched:false`) but does **not block** the
  scan (PoC-friendly; hard-block can be a Phase 2 toggle).
- Response JSON: `{ booking, action, plateMatched, whatsappStatus, nextInLine, message }`.
- All WhatsApp calls are wrapped non-fatally — a send failure never fails the scan.

## WhatsApp next-in-line trigger
On a successful **exit** (→ Completed), the route finds the next non-cancelled booking for the **same
bay** (`status IN [Pending, Confirmed]`, earliest `slot_start` then `createdAt`) and sends the
"Previous vehicle has left Bay X — you may proceed" message, returning `nextInLine` (the next ref).
This supports "previous driver left early → notify the next driver immediately". Already-completed
exits don't re-trigger it (no duplicates).

## Role rules
| Action | FM | Staff | Tenant | Public |
|--------|:--:|:--:|:--:|:--:|
| View driver pass (`/driver-pass/:ref`) | ✅ | ✅ | ✅ | ✅ (public link) |
| See Gate Scan control | ✅ | ✅ | ❌ | ❌ |
| Gate entry/exit (`/:ref/gate-scan`) | ✅ | ✅ | ❌ (403) | ❌ (401) |
| Create booking | ✅ | ❌ | ✅ | ❌ |

UI mirrors this: the Gate Scan button/modal renders only for `canManage` (FM/Staff); Tenant never
sees it. Existing filters/date/search/table/booking modal are unchanged.

## Files changed
| File | Change |
|------|--------|
| `client/src/App.jsx` | `/driver-pass/:bookingId` → `/driver-pass/:ref` |
| `client/src/pages/DriverPass.jsx` | Full pass view: all fields, status badge, Cancelled/Completed warning, QR, 404 handling |
| `client/src/pages/TenantLogistics.jsx` | Gate Scan button (FM/Staff) + modal (ref + optional plate; Mark Arrived/Completed) |
| `server/models/Booking.js` | Added nullable `arrived_at`, `completed_at` |
| `server/routes/booking.js` | Added `PATCH /:ref/gate-scan` (FM/Staff; entry/exit; plate check; next-in-line; non-fatal WhatsApp) |
| `server/tests/Tan Xiu Li, Felicia/logistics.test.js` | +10 gate-scan tests |
| `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` | +3 gate-scan tests (FM sees / Tenant hidden / submit calls API) |
| `docs/Tan Xiu Li, Felicia/driver-pass-qr-gate-scan-report.md` | This report |

No new dependencies; `package.json` unchanged. No secrets added.

## Tests / build results
```
cd server && npm test            → Test Suites: 6 passed · Tests: 69 passed ✅
cd client && npm test -- --run   → Test Files: 8 passed · Tests: 53 passed ✅
cd client && npm run build       → built successfully ✅
```
Backend gate-scan coverage: FM/Staff entry, Tenant 403, no-token 401, invalid ref 404, Cancelled
entry 409, exit→Completed + next-in-line, already-Completed no-duplicate, plate mismatch flagged,
WhatsApp-failure resilience.

## Remaining Phase 2 items
- **YOLO + OCR license-plate recognition** (auto-read plate instead of manual `observedPlate`).
- **Browser camera QR scanning** (manual ref entry is the current PoC fallback).
- **WhatsApp webhook delivery-status tracking** (sent/delivered/read).
- **Deployed `FRONTEND_URL`** so drivers can open the pass on their phones (not localhost).
- **Physical barrier / turnstile integration** on gate entry/exit.
- Optional **hard-block on plate mismatch** (currently warn-only).

## Suggested commit message
```
feat(logistics): driver-pass QR + FM/Staff loading-bay gate scan (entry/exit)

- fix driver-pass route to /driver-pass/:ref (matches page + WhatsApp link)
- DriverPass: full details + status + Cancelled/Completed warning + QR (react-qr-code)
- backend PATCH /api/bookings/:ref/gate-scan (FM/Staff): entry→Arrived, exit→Completed,
  plate check (warn), next-in-line on exit, idempotent, non-fatal WhatsApp; arrived_at/completed_at
- Logistics: Gate Scan modal for FM/Staff (manual ref + optional plate); Tenant hidden
- tests: +10 backend, +3 frontend

Additive only; no AI/CRUD/WhatsApp-core changes; no new deps; no secrets.
```

---

## Follow-up: Driver Pass mobile UI polish (2026-06-21)

Driver Pass mobile UI polished for driver phone view, with larger QR, clearer details, and no
floating widget overlap.

**Root cause of the cramped look:** `DriverPass.css` styled class names that no longer matched the
JSX (`.driver-pass-container` / `.qr-wrapper` / `.pass-details` vs the actual
`.driver-container` / `.qr-section` / `.info-grid`), so the page rendered largely unstyled.

**What changed (frontend/CSS only):**
- Rewrote `DriverPass.css` to the real classes: mobile-first ticket card
  (`width: min(100% - 24px, 420px)`, centered, comfortable padding, top-aligned so it scrolls and
  never clips), a larger scannable QR (`min(230px, 64vw)` on a white frame), a clear monospace
  booking ref, and clean detail rows (muted label / readable value). Desktop centers the ticket.
- Header hierarchy: **FlowGuard** / Harrison Food Factory / "Driver Entry Pass" badge.
- Hid floating widgets on the pass: `AIChatPopup` is not rendered on `/driver-pass/*` (route-gated in
  `App.jsx`), and the reCAPTCHA badge is hidden via `body.driver-pass-page .grecaptcha-badge`
  (DriverPass adds/removes that body class on mount/unmount).
- Status badge + Cancelled/Completed warnings retained; defensive guards and QR fallback unchanged.
- No sidebar on the public pass (DriverPass renders standalone, no `<Sidebar/>`).

**Tests/build:** `npm test -- --run` → 10 files, **61 passed** ✅ · `npm run build` → built ✅
(added a Cancelled-warning test; existing QR/fallback/404/missing-field tests still pass).
