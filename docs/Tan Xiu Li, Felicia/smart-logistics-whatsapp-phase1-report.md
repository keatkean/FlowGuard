# Smart Logistics & WhatsApp — Phase 1 Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Phase 1 MVP only — loading-bay booking CRUD + mock-safe WhatsApp notifications.
No facial-recognition / RBAC-core / error-handling / teammate logic rewritten.
**Date:** 2026-06-21

---

## A. What was implemented

1. **Loading-bay booking CRUD** on the existing `Booking` model/route (extended, not replaced):
   create (FM/Tenant), read (role-scoped), status update (FM/Staff), and soft cancel.
2. **Mock-safe WhatsApp service** (`server/services/whatsappService.js`) — env-only credentials,
   simulates sends when disabled, never throws, never logs the full key.
3. **Phase 1 WhatsApp events:** booking confirmed, automatic next-in-line (on Completed),
   booking cancelled.
4. **Functional Logistics page** — queue table, status badges, create form, role-aware
   status/cancel buttons, WhatsApp status feedback, and loading/error/empty states.
5. **RBAC** wired through existing constants/middleware; the public driver-pass endpoint kept intact.

---

## B. Files changed

| Area | File | Change |
|------|------|--------|
| Backend | `server/services/whatsappService.js` | **NEW** — mock-safe WhatsApp sender + event helpers |
| Backend | `server/models/Booking.js` | Extended (additive): `tenant_name`, `tenantId`, `driver_name`, `slot_start`, `slot_end`, `notes` |
| Backend | `server/routes/booking.js` | Rewritten: RBAC CRUD + status/cancel/next-in-line; WhatsApp via service; public `/:ref` kept |
| Backend | `server/.env.example` | New WhatsApp vars (`WHATSAPP_ENABLED`, `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`) |
| Frontend | `client/src/pages/TenantLogistics.jsx` | Rewritten: queue table, create form, role-aware actions, WhatsApp status, states |
| Frontend | `client/src/App.jsx` | `/logistics` → `ACCESS.ANY` (adds Staff operational view) |
| Frontend | `client/src/components/Sidebar.jsx` | Show "Logistics & Bays" to Staff too |
| Tests | `server/tests/Tan Xiu Li, Felicia/logistics.test.js` | **NEW** — 14 tests (booking CRUD + WhatsApp) |
| Tests | `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` | **NEW** — 4 tests (render / form / empty / Staff) |

---

## C. CRUD mapping

| CRUD | Action | Endpoint | Roles |
|------|--------|----------|-------|
| **Create** | New booking request (status Pending) | `POST /api/bookings/create` | FM, Tenant |
| **Read** | List bookings (FM/Staff all; Tenant own) | `GET /api/bookings/` | FM, Staff, Tenant |
| **Read** | List all (compat alias) | `GET /api/bookings/all` | FM, Staff |
| **Read** | Driver pass lookup by ref (public) | `GET /api/bookings/:ref` | Public |
| **Update** | Advance status (Pending→Confirmed→Arrived→Completed) | `PATCH /api/bookings/:id/status` | FM, Staff |
| **Delete** | Soft cancel (status=Cancelled) | `PATCH /api/bookings/:id/cancel` | FM, or owning Tenant |

> Cancellation is a **soft delete** (`status='Cancelled'`, plus the model's `paranoid:true`) for
> auditability — no hard delete.

---

## D. WhatsApp integration explanation

`server/services/whatsappService.js` is **mock-safe by default**:

- Reads `WHATSAPP_ENABLED`, `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`
  from the environment only — **nothing hardcoded**.
- If `WHATSAPP_ENABLED !== "true"` or any credential is missing → logs a safe line
  (`key=****1234`) and returns `{ success:true, simulated:true }`. It **never throws**, so a
  booking action can't crash on it.
- When enabled, it POSTs a WhatsApp text message via the configured API and returns
  `{ success, simulated:false }`; on failure it returns `{ success:false }` (still no throw).

Events (the route calls these; results are returned to the frontend):

| Event | Trigger | Message |
|-------|---------|---------|
| Confirmed | status → `Confirmed` | "Your loading bay slot is confirmed at [time], [Bay]. Please do not arrive early." |
| Next-in-line | status → `Completed` (alerts next waiting booking for that bay) | "You are next in line. Please proceed to the loading bay entrance ([Bay])." |
| Cancelled | cancel | "Your loading bay booking ([ref]) has been cancelled." |

**To enable real sending later:** set the four env vars (with `WHATSAPP_ENABLED=true`) in
`server/.env` (never commit it). No code change required.

---

## E. Environment variables needed

```
WHATSAPP_ENABLED=false                          # "true" only with real creds to send live
WHATSAPP_API_URL=https://graph.facebook.com/v19.0
WHATSAPP_API_KEY=your-whatsapp-token            # never commit the real value
WHATSAPP_PHONE_NUMBER_ID=your-whatsapp-phone-id
```

All four live in `server/.env` (gitignored). `.env.example` documents placeholders only.

---

## F. RBAC access rules

| Capability | FM | Staff | Tenant | Public |
|------------|:--:|:--:|:--:|:--:|
| View `/logistics` page | ✅ | ✅ | ✅ | ❌ |
| Create booking | ✅ | ❌ | ✅ | ❌ |
| List all bookings | ✅ | ✅ | own only | ❌ |
| Update status | ✅ | ✅ | ❌ | ❌ |
| Cancel booking | ✅ | ❌ | own only | ❌ |
| Driver pass (`/:ref`) | ✅ | ✅ | ✅ | ✅ (by design) |

Enforced server-side (`verifyToken` + `requireRole` + ownership checks) **and** mirrored in the UI
(role-conditional form/buttons). No existing route protection was weakened.

---

## G. API endpoints added / changed

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| `POST` | `/api/bookings/create` | FM, Tenant | **Changed** — now validated + RBAC'd; no WhatsApp on create |
| `GET` | `/api/bookings/` | any auth | **Added** — RBAC-scoped list |
| `GET` | `/api/bookings/all` | FM, Staff | **Changed** — now requires auth |
| `PATCH` | `/api/bookings/:id/status` | FM, Staff | **Added** — status flow + WhatsApp (confirm / next-in-line) |
| `PATCH` | `/api/bookings/:id/cancel` | FM / owner Tenant | **Added** — soft cancel + WhatsApp |
| `GET` | `/api/bookings/:ref` | Public | **Unchanged contract** — driver pass lookup |

Error codes: `400` invalid/missing fields & bad status, `401` no token, `403` wrong role/not owner,
`404` booking not found, `409` slot conflict (when a time window is supplied), `500` safe generic.

---

## H. Tests added / changed

- **Backend** `server/tests/Tan Xiu Li, Felicia/logistics.test.js` (14): create validation (400),
  create success (201), list 401/200, tenant scoping, status update by Staff (+simulated WhatsApp),
  Completed → next-in-line, Tenant status 403, 404 missing, invalid status 400, cancel; WhatsApp
  disabled-mode returns simulated success + key masking.
- **Frontend** `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` (4): page renders, FM sees the
  create form, API called + empty state shown, Staff does not see the create form.
- No existing tests modified or removed; all still pass.

---

## I. Commands run and results

```
cd server && npm test            → Test Suites: 5 passed · Tests: 36 passed ✅
cd client && npm test -- --run   → Test Files: 5 passed · Tests: 28 passed ✅
cd client && npm run build       → ✓ built ✅
```

---

## J. Remaining risks / Phase 2 items

1. **Tenant isolation is partial.** Tenant-*created* bookings carry `tenantId`, so tenants see/cancel
   only their own. But an **FM-created** booking only links to a tenant if `tenantId` is passed in the
   body — otherwise it won't appear in that tenant's list. There is no `Booking ↔ User` FK association
   yet. *(Phase 2: add the association + a tenant picker for FM.)*
2. **Slot-conflict (409)** only fires when both `slot_start` and `slot_end` are supplied; bookings
   without times are not de-conflicted.
3. **Real WhatsApp sending is untested** (no live credentials in CI). The mock path is fully tested;
   live delivery should be verified manually once enabled.
4. **`booking_ref` is the QR token** but is a short random code, not a signed token. Fine for a demo;
   Phase 2 should sign/expire it for real gate authentication.
5. **DriverPortal** time-slot page is still a mock (hardcoded ref) — not wired to the new API yet.
6. **No pagination/filtering** (list capped at 100, newest first).
7. License-plate / ANPR delivery tracking is **future scope** (Phase 2+).

**Phase 2 candidates:** QR-scan gate authentication (validate ref → auto-mark Arrived),
`Booking↔User` association for full tenant isolation, live WhatsApp + delivery receipts,
auto slot suggestions, license-plate tracking, list pagination/filters.

---

## K. Suggested git commit message

```
feat(logistics): Phase 1 loading-bay booking CRUD + mock-safe WhatsApp

- Booking model: add tenant_name, tenantId, driver_name, slot_start/end, notes (additive)
- booking route: RBAC CRUD — create (FM/Tenant), list (role-scoped), status (FM/Staff),
  soft cancel (FM/owner); auto next-in-line alert on Completed; public /:ref kept
- whatsappService: env-only, mock-safe (simulates when WHATSAPP_ENABLED!=true), key masked
- frontend Logistics: queue table, create form, role-aware actions, WhatsApp status, states
- RBAC: /logistics now FM+Staff+Tenant (Staff operational view); sidebar updated
- .env.example: WHATSAPP_ENABLED/API_URL/API_KEY/PHONE_NUMBER_ID
- tests: 14 backend + 4 frontend; docs/smart-logistics-whatsapp-phase1-report.md

No secrets committed. Facial recognition / RBAC core / teammate modules untouched.
```
