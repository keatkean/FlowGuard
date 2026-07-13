# Logistics Dashboard & Settings Button — UX Polish Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Two frontend-only UI/UX fixes. No backend/API/RBAC/auth/theme changes.
**Date:** 2026-06-21

---

## A. What was wrong

1. **Settings — "Re-enroll My Face ID" button** used `className="save-btn"`, but `.save-btn` was
   **never defined in CSS** → it rendered as a default white browser button (also affected
   "Save Changes").
2. **Logistics page** showed the full "Schedule New Delivery" form in a column *beside* the bookings
   table by default, leaving the table cramped on laptop and the page form-heavy rather than
   list-first.

## B. What changed for the Settings button

Added a themed `.save-btn` in `Settings.css` (blue `#3b82f6` primary, white text, 8px radius,
`12px 22px` padding, weight 600, hover `#2563eb`, blue focus ring) — consistent with the other
dashboard primary buttons (`.submit-booking-btn`). It sits neatly right-aligned in the Biometric
Profile row on laptop and goes **full-width on mobile** (`≤768px`). The re-enroll logic
(`handleSelfReEnroll`) was **not** touched.

## C. What changed for the Logistics layout

Reworked `TenantLogistics.jsx` into a **list-first dashboard** (all existing handlers reused):
- **Header:** title + subtitle, with **Refresh** and **+ New Booking** buttons on the right
  (`+ New Booking` only renders for roles that can create).
- **Summary cards:** Today's Bookings, Pending, Bay A Active, Bay B Active (computed from the loaded
  bookings; "Active" = not Completed/Cancelled).
- **Filters (frontend-only):** search by ref/plate/company/driver, filter by status, filter by bay.
  (The backend has no booking-filter endpoint, so filtering is client-side over the fetched list.)
- **Full-width booking table** with the requested columns: **Ref, Plate, Company, Driver, Bay, Slot,
  Status, Actions** (added the Driver column + `data-label`).
- **Create form moved into a modal** (reuses the global `.modal-overlay` / `.modal-content`) that
  opens only on **+ New Booking**. Closes on overlay click, ✕, Cancel, or **after a successful
  create** (then the list refreshes). Create errors now show inside the modal.
- Empty states: "No bookings scheduled yet." vs "No bookings match your filters."

No booking creation/validation, WhatsApp simulation, status-update, or cancel logic changed — those
handlers (`createBooking`, `updateStatus`, `cancelBooking`) are the originals.

## D. Files changed

| File | Change |
|------|--------|
| `client/src/css/Settings.css` | Added `.save-btn` styling + mobile full-width |
| `client/src/pages/TenantLogistics.jsx` | List-first dashboard: header actions, summary cards, filters, Driver column, create form moved into a modal (`isFormOpen` state) |
| `client/src/css/Booking.css` | Scoped CSS for `.header-actions`, `.new-booking-btn`, `.logistics-stats`, `.logistics-toolbar` filters, `.booking-modal`; bumped table `min-width` to 820px (8 cols); responsive breakpoints |
| `client/tests/Tan Xiu Li, Felicia/Logistics.test.jsx` | Updated to the modal UX (button present + form hidden by default, opens on click, hidden from Staff) |
| `docs/Tan Xiu Li, Felicia/logistics-dashboard-ux-polish-report.md` | This report |

No `server/` files touched. The public driver-pass route (`GET /api/bookings/:ref`) is unaffected.

## E. Role behavior preserved

| Role | Create (+ New Booking) | View | Status update | Cancel |
|------|:--:|:--:|:--:|:--:|
| **FM** | ✅ | all | ✅ | ✅ |
| **Staff** | ❌ (no button) | all | ✅ | ❌ |
| **Tenant** | ✅ (own) | own only | ❌ | ✅ (own) |

Gating uses the same `canCreate` / `canManage` flags as before; the modal is also guarded by
`canCreate`. Server-side RBAC is unchanged and still authoritative.

## F. Responsive behavior

- **Laptop/desktop:** full-width table reads comfortably (8 columns fit a 1366px+ window without
  scroll thanks to `min-width:820px` + the card being full-width); summary cards in a 4-up row.
- **Tablet (≤1024px):** summary cards become 2-up; table scrolls horizontally if needed.
- **Mobile (≤768px):** cards 1-up; header buttons go full-width; filters wrap; the table uses the
  existing labelled card layout (`data-label`); the modal is `width:92%` and scrolls (`max-height:88vh`).

## G. Tests / build results

```
cd client && npm test -- --run   → Test Files: 5 passed · Tests: 29 passed ✅
cd client && npm run build       → built successfully ✅
```
Backend not touched → `server` tests not run.

## H. Remaining risks

1. **Filtering is client-side** over the fetched list (capped at 100 by the backend). Fine for demo
   scale; large datasets would need a backend filter/pagination endpoint (Phase 2).
2. **Summary cards count the loaded list** (labelled "Today's Bookings"), not a true date-bounded
   "today" query — consistent with the existing list but not date-filtered.
3. Modal uses a simple overlay (no focus-trap); acceptable for this scope, could be enhanced later.

## I. Suggested commit message

```
style/ux(settings,logistics): themed re-enroll button + list-first logistics dashboard

- Settings: define .save-btn (blue primary) so Re-enroll/Save Changes match the dark theme;
  full-width on mobile (re-enroll logic unchanged)
- Logistics: list-first dashboard — header Refresh/+New Booking, summary cards (Today/Pending/
  Bay A/Bay B), search + status + bay filters (frontend), full-width table with Driver column;
  move create form into a modal (opens on +New Booking, closes + refreshes on success)
- Booking.css: scoped styles for header actions, stats, toolbar, and booking modal
- tests: update Logistics test for the modal UX (29 passing)

Frontend-only; no backend/API/RBAC/auth/theme changes; public driver-pass route unaffected.
```
