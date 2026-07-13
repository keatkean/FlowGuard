# RBAC Final Polish — Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Additive/safe RBAC + wording polish. No AI logic, WhatsApp, Driver Pass QR, or booking
CRUD changed; no tables dropped.
**Date:** 2026-06-21

## Final role access matrix

| Capability | FM | Tenant | Staff | Public |
|------------|:--:|:--:|:--:|:--:|
| Landing / Login / Register / Driver Pass | ✅ | ✅ | ✅ | ✅ |
| Dashboard / Portal | ✅ | ✅ (tenant view) | ✅ | ❌ |
| Logistics (view) | ✅ | ✅ | ✅ | ❌ |
| Create booking | ✅ | ✅ (own) | ❌ | ❌ |
| Cancel booking | ✅ | ✅ (own) | ❌ | ❌ |
| Update booking status | ✅ | ❌ | ✅ | ❌ |
| **Gate Scan (entry/exit)** | ✅ | ❌ | ❌ | ❌ |
| My Staff (add Staff) | ❌ | ✅ | ❌ | ❌ |
| View user logs | ✅ (all) | ✅ (own staff only) | ❌ | ❌ |
| User Management (add Tenant, suspend/delete) | ✅ | ❌ | ❌ | ❌ |
| Security Review | ✅ | ❌ | ❌ | ❌ |
| Tenant Onboarding (invites) | ✅ | ❌ | ❌ | ❌ |
| Settings — own Face ID re-enrol | ✅ | ✅ | ✅ | ❌ |
| Settings — admin sections (AI/network/danger) | ✅ | ❌ | ❌ | ❌ |
| Create FM account | ❌ (seed/setup only) | ❌ | ❌ | ❌ |

## Why FM creation is seed/setup only
FM is the highest-privilege role; allowing it to be created from the UI/manual flow would be a
privilege-escalation risk. `POST /user/manual-create` only maps **FM → Tenant** and **Tenant →
Staff**, and rejects any request whose explicit `role` doesn't match that mapping — so an FM can
never be created through the app (verified by test). There is no "Add FM" button anywhere. FM
accounts are provisioned via the seed/setup script only.

## Tenant own-staff logs rule
Previously the **Logs** button on *My Staff* navigated to `/user-logs/:id`, which was FM-only →
Tenants hit a 403. Fixed:
- Route `/user-logs/:id` now allows **FM + Tenant**.
- Backend `GET /api/security/logs/user/:id` enforces ownership: **FM** sees anyone; a **Tenant** may
  only view logs where the target user's `managerId === tenant.id`; everyone else (incl. Staff) gets
  **403**. Since *My Staff* lists only the Tenant's own staff (`/user/my-staff`, `managerId = tenant`),
  the Logs button now works for Tenants without a 403, and the button is safe to keep.

## Gate Scan role decision
"Staff" now means a tenant/factory worker, not a security guard, so **Gate Scan is FM-only**:
- Backend: `PATCH /api/bookings/:ref/gate-scan` is `requireRole('FM')` (Tenant/Staff → 403, public → 401).
- Frontend: the Gate Scan button/modal renders only for FM (`canGateScan = role === 'FM'`).
- Booking status updates remain available to FM + Staff (operational), unchanged.

## Staff wording change
`roleLabel('Staff')` now returns **"Staff"** (was "Security Staff") — this is the label shown in the
sidebar user chip. Two stale code comments ("FM + Security Staff") were updated to "FM + Staff". The
backend role enum value remains `Staff` (unchanged — no migration).

## Files changed
| File | Change |
|------|--------|
| `server/routes/security.js` | `GET /logs/user/:id` ownership enforcement (FM all; Tenant own-staff; else 403) |
| `server/routes/booking.js` | Gate scan → `requireRole('FM')` only (+ comment) |
| `client/src/App.jsx` | `/user-logs/:id` → FM + Tenant; comment wording |
| `client/src/constants/roles.js` | `roleLabel` Staff → "Staff" |
| `client/src/components/Sidebar.jsx` | comment wording |
| `client/src/pages/TenantLogistics.jsx` | Gate Scan gated to FM (`canGateScan`) |
| `server/tests/Tan Xiu Li, Felicia/security.test.js` | +5 ownership tests |
| `server/tests/Tan Xiu Li, Felicia/logistics.test.js` | Gate scan Staff→403; exit uses FM |
| `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` | +Staff-no-Gate-Scan |
| `client/tests/Tan Xiu Li, Felicia/RBAC.test.jsx` | +roleLabel wording test |
| `client/tests/Tan Xiu Li, Felicia/UserManagement.test.jsx` | +FM-no-Add-FM test |
| `docs/Tan Xiu Li, Felicia/rbac-final-polish-report.md` | This report |

## Tests / build results
```
cd server && npm test            → Test Suites: 6 passed · Tests: 74 passed ✅
cd client && npm test -- --run   → Test Files: 10 passed · Tests: 64 passed ✅
cd client && npm run build       → built successfully ✅
```
Backend coverage added: FM views all logs; Tenant views own staff; Tenant blocked from other
tenants' staff; Staff blocked; gate-scan Staff 403 / FM allowed; manual-create FM creation blocked
(existing). No "Security Staff" wording remains in `client/src`.

## Suggested commit message
```
rbac(final): tenant own-staff logs, FM-only gate scan, "Staff" wording

- security: GET /logs/user/:id enforces ownership (FM all; Tenant own staff only; else 403)
- App: /user-logs/:id now FM+Tenant (server enforces ownership) — fixes Tenant 403 UX
- gate scan: FM only (backend requireRole('FM') + frontend canGateScan); Tenant/Staff blocked
- wording: roleLabel Staff -> "Staff" (was "Security Staff"); comments updated
- manual-create still blocks FM creation (seed/setup only); no "Add FM" UI
- tests: +ownership, gate-scan FM-only, roleLabel, no-Add-FM

Additive/safe; no AI/WhatsApp/QR/booking-CRUD changes; role enum value unchanged.
```

---

## Follow-up: final Staff sidebar/route visibility (2026-06-21)

"Staff" = tenant/factory worker, so Staff no longer has access to AI/security monitoring pages.

**Final sidebars**
- **FM:** Dashboard, Cameras, V-Patrol, Object Detection, Gate Scanner, Daily Attendance,
  Logistics & Bays, User Management, Security Review, Tenant Onboarding, Settings.
- **Tenant:** Dashboard, Daily Attendance, Logistics & Bays, My Staff, Settings. *(unchanged)*
- **Staff:** Dashboard, Daily Attendance, Logistics & Bays, Settings. *(only these four)*

**What changed**
- Sidebar: Cameras / V-Patrol / Object Detection / Gate Scanner now render for **FM only**
  (previously FM+Staff). Daily Attendance now also shows for Staff.
- Routes (`App.jsx`): `/cameras`, `/object-detection`, `/vpatrol`, `/gate-scanner` changed from
  `FM_STAFF` → **`FM_ONLY`**, so Staff direct-URL access is blocked (403). `/attendance` widened to
  all authenticated roles.
- Backend (`attendance.js`): Staff `GET /api/attendance/logs` no longer returns 403 — it returns the
  **Staff member's own records only** (`where userId = self`), never the aggregate roster (PDPA-safe).
  This is the only backend change and it does not expose restricted data.
- Logistics: Staff still cannot see **+ New Booking** (`canCreate` = FM/Tenant) or **Gate Scan**
  (`canGateScan` = FM); Staff retains the operational status-update buttons.
- Role label remains **"Staff"**.

**Why a backend change here:** the required Staff "Daily Attendance" item would otherwise hit the
existing Staff-403 on the attendance route. Rather than show a dead link, Staff now sees only their
own attendance — a controlled, PDPA-preserving scope (no roster leakage).

**Tests/build (follow-up):** `cd server && npm test` → 6 suites, **74 passed** ✅ ·
`cd client && npm test -- --run` → 10 files, **65 passed** ✅ · `npm run build` → built ✅.
Updated the Staff sidebar test, the Staff route-block test (FM-only monitoring → 403), and added a
Staff-allowed-on-all-roles route test. FM and Tenant tests unchanged and passing.

---

## Follow-up: Daily Attendance role-aware wording (2026-06-21)

The Daily Attendance page now states what each role can actually see, so Staff access never *implies*
workforce-wide visibility.

- **Staff Daily Attendance is own-record only** — the backend (`attendance.js`) returns
  `Attendance.findAll({ where: { userId: self } })` for Staff (no roster); confirmed by test. FM still
  sees all records; Tenant is scoped to their own staff (included-User `managerId`/own-id filter).
- **Staff UI uses "My Attendance"** to avoid implying workforce-wide access:
  - Title — FM: *Workforce Attendance Management* · Tenant: *Unit Staff Attendance* · Staff: *My Attendance*.
  - Subtitle — FM: *Global facility occupancy and labor tracking logs* · Tenant: *Attendance records for
    your registered unit staff* · Staff: *View your own check-in and attendance records*.
  - Cards (Staff) — *My On-Site Status*, *My On-Time Arrivals*, *My Late Exceptions*.
  - Empty state (Staff) — *"No attendance records found for your account."*
  - Layout/theme unchanged; no new features.

**Files:** `client/src/pages/Attendance.jsx` (role-aware copy), `server/routes/attendance.js`
(unchanged this pass — Staff own-records was set in the prior task; re-verified by new test),
`client/tests/Tan Xiu Li, Felicia/Attendance.test.jsx` (new),
`server/tests/Tan Xiu Li, Felicia/attendance.test.js` (new).

**Tests/build:** `cd server && npm test` → 7 suites, **78 passed** ✅ ·
`cd client && npm test -- --run` → 11 files, **70 passed** ✅ · `npm run build` → built ✅.

---

## Follow-up: Staff can create bookings, but not control the gate (2026-06-21)

**Staff can assist their tenant by creating delivery/loading bay bookings, while only FM can perform
gate scan entry/exit.**

**Final Logistics RBAC**
| Action | FM | Tenant | Staff |
|--------|:--:|:--:|:--:|
| View bookings | all | own unit | own unit |
| Create booking | ✅ | ✅ (own) | ✅ (for their unit) |
| Cancel booking | ✅ | ✅ (own) | ❌ (no per-creator field — Phase 2) |
| Mark Arrived / Completed (status) | ✅ | ❌ | ❌ |
| Gate Scan (entry/exit) | ✅ | ❌ | ❌ |
| Next-in-line flow | ✅ | — | — |

**What changed**
- `POST /api/bookings/create` now allows **FM, Tenant, Staff**. A Staff-created booking is linked to
  their tenant/unit via `resolveTenantId()` — **Staff → their `managerId`** (the tenant they work for),
  Tenant → self, FM → optional `body.tenantId`. WhatsApp confirmation still fires; Driver Pass QR/link
  unchanged.
- Booking list `GET /` is now scoped: FM all; Tenant own (`tenantId = self`); **Staff own unit**
  (`tenantId = managerId`, `-1` sentinel if no manager → matches nothing). `/all` alias tightened to **FM-only**.
- `PATCH /:id/status` (Mark Confirmed/Arrived/Completed) is now **FM-only** (was FM+Staff) — facility-level.
- Gate scan stays **FM-only**.
- Frontend (`TenantLogistics.jsx`): `canCreate` now includes Staff (+ New Booking shown); `canManage`
  (status buttons) is FM-only; `canGateScan` FM-only. Staff sees the list + New Booking, but no status
  buttons and no Gate Scan.

**Note on Staff cancel:** the model tracks ownership at the **unit** level (`tenantId`), not per
individual creator, so per-Staff "cancel own created" isn't cleanly supported — deferred to Phase 2.

**Files:** `server/routes/booking.js`, `client/src/pages/TenantLogistics.jsx`,
`server/tests/Tan Xiu Li, Felicia/logistics.test.js`, `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx`.
(`Booking.js` model unchanged — `tenantId` already exists; `App.jsx`/`Sidebar.jsx` unchanged — `/logistics`
is already all-roles.)

**Tests/build:** `cd server && npm test` → 7 suites, **79 passed** ✅ ·
`cd client && npm test -- --run` → 11 files, **70 passed** ✅ · `npm run build` → built ✅.
