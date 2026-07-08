# Settings & Logistics Final Polish — Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Two small frontend UX/RBAC polish changes. One route's access widened (Settings);
no backend/API, auth/login, facial-recognition, or logistics booking logic changed.
**Date:** 2026-06-21

## Issue 1 — Logistics table now follows the Attendance style

The "Today's Bay Queue" list was wrapped in a bulky `.booking-card` with a large `<h2>` heading,
making it look heavier than the Workforce Attendance table (which is a plain `.table-container` +
`.management-table`).

**Change (`TenantLogistics.jsx`):** removed the `.booking-card` wrapper and the big `<h2>` heading;
the bookings table now renders directly inside its `.table-container`, exactly like Attendance. The
`active-bookings` class was kept on the wrapper so the existing scoped rules still apply
(`.active-bookings .table-container { overflow-x: auto }` and `.management-table { min-width: 820px }`),
preserving horizontal scroll and column widths. No CSS file change was required.

Kept unchanged: header, summary cards, search, status filter, bay filter, Refresh, + New Booking, the
table fields (Ref, Plate, Company, Driver, Bay, Slot, Status, Actions), and all booking logic
(create modal, filters, status update, cancel).

## Issue 2 — Settings accessible to all, admin sections role-gated

### A. Access
- `App.jsx`: `/settings` changed from `allowedRoles={ACCESS.FM_ONLY}` → `<ProtectedRoute>` (any
  authenticated user). Still blocked for unauthenticated/public users.
- `Sidebar.jsx`: the **Settings** link was moved out of the FM-only block so it renders for **FM,
  Tenant, and Staff** (the sidebar only shows for authenticated users).

### B. Role-based content (`Settings.jsx`)
- **All authenticated users** see the **Biometric Profile** card with the **Re-enroll My Face ID**
  button (re-enroll route/logic unchanged). Non-FM header reads *"Settings — Manage your personal
  biometric profile and access settings."* so the page looks intentional.
- **FM only** still sees: FlowGuard AI Engine, Network & Notifications, Camera Feed Quality, Danger
  Zone (Reboot Network Nodes), and the system Save Changes button. These are wrapped in `{isFM && …}`.

### C. Safety
- Admin controls (AI thresholds, network config, Danger Zone/Reboot, system Save) are **not rendered**
  for Tenant/Staff — they're removed from the DOM, not just hidden.
- The re-enroll route/logic is unchanged; FM Settings re-enrollment still works.
- The Re-enroll button was **not** brought back to User Management.

## Confirmation: admin controls hidden from Tenant/Staff
Verified by tests — Tenant and Staff Settings render the Face ID re-enrollment button but **not**
"FlowGuard AI Engine", "Camera Feed Quality", "Danger Zone", or "Reboot Network Nodes". FM still sees
all of them.

## Files changed

| File | Change |
|------|--------|
| `client/src/pages/TenantLogistics.jsx` | Drop bulky card + big heading; plain Attendance-style table |
| `client/src/App.jsx` | `/settings` → any authenticated user |
| `client/src/components/Sidebar.jsx` | Settings link visible to FM/Tenant/Staff |
| `client/src/pages/Settings.jsx` | Role-gated content (admin sections FM-only; Biometric for all) |
| `client/tests/Tan Xiu Li, Felicia/RBAC.test.jsx` | Settings now expected visible to Tenant/Staff |
| `client/tests/Tan Xiu Li, Felicia/Settings.test.jsx` | **NEW** — role-based Settings content |
| `client/tests/Tan Xiu Li, Felicia/UserManagement.test.jsx` | +assert no Re-enroll button on User Management |
| `docs/Tan Xiu Li, Felicia/settings-and-logistics-final-polish-report.md` | This report |

No `server/` files touched. No CSS changes needed for either issue (reused existing styles).

## Tests / build results
```
cd client && npm test -- --run   → Test Files: 8 passed · Tests: 45 passed ✅
cd client && npm run build       → built successfully ✅
```
Backend not touched → `server` tests not run.

## Suggested commit message
```
ux/rbac(settings,logistics): Attendance-style table + all-roles Settings (gated)

- Logistics: remove bulky card + big heading; table now matches Workforce Attendance
  (keeps active-bookings scoped overflow/min-width; all booking logic unchanged)
- Settings: /settings open to any authenticated user; sidebar link for FM/Tenant/Staff
- Settings content role-gated: Biometric/Face-ID re-enroll for all; AI Engine, Network,
  Camera Feed Quality, Danger Zone, system Save = FM only (removed from DOM for others)
- tests: Settings role content, RBAC sidebar (Settings now shared), User Mgmt no Re-enroll

Frontend-only; no backend/auth/AI/booking-logic changes; re-enroll route unchanged.
```

---

## Follow-up: removed Face ID row action from User Management (2026-06-21)

Removed the duplicate **Face ID** row action from User Management because Face ID re-enrollment is now
available from **Settings** for all authenticated users.

- `client/src/pages/Users.jsx`: removed the per-row "Face ID" button and its now-unused
  `handleReEnroll` helper. **Logs / Suspend / Delete** row actions and the **+ Add Tenant** header
  button are unchanged.
- Settings still shows **Re-enroll My Face ID** for every authenticated role; the re-enroll
  route/logic is unchanged. No backend changes (the enrolment endpoint remains, used by Settings).
- Tests: added a guard in `UserManagement.test.jsx` asserting a user row keeps Logs/Suspend/Delete
  but has **no** Face ID button.

Result: `npm test -- --run` → 8 files, 46 passed ✅ · `npm run build` → built successfully ✅

---

## Follow-up: Logistics date filter + dark date-picker icons (2026-06-21)

**Issue 1 — Date filter added.** The Logistics toolbar now has a **slot-date** filter (`type="date"`)
beside Search / Status / Bay. It filters bookings by the local date of each booking's `slot_start`
and combines with the existing filters (AND). Empty = all dates. A small **Clear date** button appears
only when a date is selected. Bookings with no `slot_start` are excluded while a date is active.
Frontend-only — no backend routes changed.

**Issue 2 — Dark date/time picker icons.** Added scoped CSS so the native calendar icons match the
dark theme: `color-scheme: dark` + `::-webkit-calendar-picker-indicator { filter: invert(1) }` on the
booking-modal Slot Start / Slot End fields (`.dark-form input[type="datetime-local"]`) and the new
`.logistics-date` filter. Scoped to `.dark-form` / `.logistics-date`, so Login/Register are unaffected.
Inputs keep their dark background, light text, and blue focus ring (Chrome/Edge).

**Booking logic unchanged** — create/status/cancel and the WhatsApp mock are untouched; only filtering
(a derived view) and CSS were added.

**Files changed (follow-up)**
- `client/src/pages/TenantLogistics.jsx` — `filterDate` state, `slotDateKey` helper + `matchesDate`,
  date input + Clear button.
- `client/src/css/Booking.css` — dark native date/time picker styles.
- `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` — +2 tests (filter exists; filters by date).

**Result (follow-up):** `npm test -- --run` → 8 files, **48 passed** ✅ · `npm run build` → built ✅

---

## Follow-up fix: dark-theme visibility of Logistics date/datetime picker icons (2026-06-21)

Fixed dark-theme visibility of Logistics date/datetime picker icons. The earlier attempt combined
`color-scheme: dark` (which already lightens the native icon) with `filter: invert(1)`, and the
double-flip rendered the calendar icon **black** again on the dark inputs.

**Fix (`client/src/css/Booking.css`, CSS-only):** replaced the picker indicator with an explicit
**white** calendar SVG (`background-image` on `::-webkit-calendar-picker-indicator`, `filter: none`),
which is reliable on Chrome/Edge regardless of the OS light/dark setting. `color-scheme: dark` is kept
on the inputs so the popup/internal text stay dark/light; the inputs keep their dark background, light
text, and blue focus ring. Scoped to `.dark-form input[type="datetime-local"]` / `.logistics-date`,
so Login/Register auth inputs are unaffected. A subtle hover opacity was added.

Applies to: **Slot Start**, **Slot End** (booking modal) and the **Logistics date filter**.
No JSX or booking logic changed.

**Result:** `npm test -- --run` → 8 files, **48 passed** ✅ · `npm run build` → built ✅
