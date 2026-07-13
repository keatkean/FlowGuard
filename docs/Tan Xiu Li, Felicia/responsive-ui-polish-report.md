# Responsive UI Polish Report — FlowGuard

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Safe responsive CSS only. No backend, no API routes, no React logic, no theme/branding
changes, no features removed.
**Date:** 2026-06-21

---

## A. Summary of responsive changes

The Logistics two-column layout was cramped on tablets/small laptops and the bookings table could be
clipped on narrow widths. Fixed with **scoped CSS** plus presentational `data-label` attributes:

1. Grid children may now shrink (`min-width: 0`) instead of forcing overflow on smaller laptops.
2. The bookings table scrolls **horizontally** (scoped to Logistics) instead of being clipped.
3. The form/table **stack** (form above table) from `≤1024px` (tablet) downward.
4. On phones (`≤768px`) the table uses the app's existing **labelled card layout** — now readable
   because the cells carry `data-label`.
5. Tighter card padding on phones.

The desktop/laptop sidebar, the mobile off-canvas sidebar drawer, and all dashboard grids were
**already responsive** and were left unchanged.

---

## B. Files changed

| File | Change |
|------|--------|
| `client/src/css/Booking.css` | Added a scoped "Logistics Responsive" block: `min-width:0` on grid children, `overflow-x:auto` + `min-width` on the bookings table, a new `≤1024px` stack breakpoint, and an enhanced `≤768px` block (gap, padding, drop min-width). |
| `client/src/pages/TenantLogistics.jsx` | Added `data-label` attributes to the 7 table `<td>` cells (presentational only — enables the existing mobile card layout's labels). |

No other files touched.

---

## C. What changed for the Logistics page

- **Large screens (>1024px):** unchanged two-column grid (`1.5fr 1fr`). Grid children got
  `min-width: 0` so a narrow column shrinks gracefully instead of pushing the page wider.
- **Bookings table:** `.active-bookings .table-container { overflow-x: auto }` + a `min-width: 640px`
  on the table → it scrolls horizontally within its card on narrow widths instead of being clipped by
  the global `.table-container { overflow: hidden }`. Scoped to `.active-bookings` so **no other
  management table is affected**.
- **≤1024px (tablet/small laptop):** `.booking-grid` collapses to a single column — the **form
  stacks above** the bookings table (form is first in the DOM).
- **≤768px (phone):** single column, `gap` and card `padding` reduced; the table's `min-width` is
  dropped because the global stylesheet converts the table into labelled stacked cards.

---

## D. What changed for Sidebar / layout

**No changes were needed** — the existing CSS already handles it:
- Desktop/laptop: fixed 240px sticky sidebar (`Dashboard.css`).
- `≤768px`: sidebar becomes a fixed off-canvas drawer (`left:-100%` → `.open { left:0 }`) with a
  hamburger button, dimmed overlay, and an in-drawer close button. `Sidebar.jsx` already wires the
  open/close state. The main content shifts its top padding to clear the hamburger.

This was verified by reading `Dashboard.css` (lines ~510–606) and `Sidebar.jsx`; left untouched to
avoid risk.

---

## E. Desktop / laptop behavior (preserved)

- **1536 / 1440 / 1366px:** identical two-column Logistics layout as before; the only visible change
  is the bookings table gains an internal horizontal scrollbar **only if** its columns exceed the
  available width (otherwise unchanged). Sidebar, header, and cards look the same.
- **Larger desktops:** layout remains fluid (`fr` units + `flex:1` main), so it scales without empty
  gaps; no fixed max-width was imposed that could alter the current look.

---

## F. Tablet / mobile behavior (improved)

- **1024px:** Logistics now stacks (form above table) instead of squeezing two columns; dashboard
  grids already collapse here.
- **768px:** off-canvas sidebar + hamburger; Logistics fully single-column; table renders as labelled
  cards (Ref/Plate/Company/Bay/Slot/Status/Actions) thanks to the new `data-label`s.
- **430 / 390px:** single column, reduced padding, full-width inputs/buttons; `dashboard-main` keeps
  `overflow-x: hidden` so the page never scrolls sideways; table content is reachable via the card
  layout (no clipping).

---

## G. Manual viewport checklist

Open `/logistics` (logged in) and use DevTools device toolbar at each width:

- [ ] **1440 / 1366px** — two columns; no horizontal page scroll; table scrolls inside its card only if wide.
- [ ] **1024px** — form sits above the table (single column); no cramped columns.
- [ ] **768px** — hamburger appears; sidebar opens/closes via overlay; table shows labelled cards.
- [ ] **430 / 390px** — no sideways page scroll; inputs/buttons full width and tappable; cards readable.
- [ ] Sidebar nav links, Refresh button, create form, and status/cancel buttons all usable at every width.
- [ ] Spot-check another management page (e.g. `/users`) at 768px to confirm it's unchanged.

---

## H. Tests / build results

```
cd client && npm test -- --run   → Test Files: 5 passed · Tests: 28 passed ✅
cd client && npm run build       → ✓ built ✅
```

Backend was **not** affected (CSS + presentational attribute only — no server, API, or logic
changes), so `server` tests were not re-run.

---

## I. Remaining risks

1. **Phone view uses the card layout, not horizontal scroll** for the table. This is the app-wide
   pattern (matches `/users`) and is more readable on phones; the horizontal-scroll requirement is met
   for the 769px+ range where the table layout is active. If a scrollable table is preferred on phones
   too, it would need scoped overrides of the global `≤768px` table transform.
2. **`min-width: 640px`** on the table is a sensible default for 7 columns; very long company names can
   still widen rows (the container scrolls, so no clipping).
3. **Status badge colors** for Pending/Confirmed/Arrived/Completed/Cancelled are not themed (only
   `active`/`expired` exist globally). Out of scope for a responsive pass — noted as a cosmetic
   follow-up, not a layout issue.
4. Only the Logistics page was adjusted; other pages already had their own responsive rules and were
   intentionally left alone.

---

## J. Suggested git commit message

```
style(logistics): responsive polish for Logistics page

- Booking.css: scoped responsive block — grid children min-width:0, table
  overflow-x:auto + min-width, stack form above table at <=1024px, tighter
  padding + card layout at <=768px
- TenantLogistics.jsx: add data-label attrs so the mobile card table is labelled
- no backend/API/logic/theme changes; sidebar + dashboard grids already responsive

Laptop layout preserved; tablet/mobile no longer cramped or clipped.
```

---

# Settings and Security Review UI polish

**Date:** 2026-06-21 · CSS + small scoped JSX only. No backend/API/RBAC/logic changes.

## What was fixed
- **Settings — Camera Feed Quality dropdown:** `.dark-select` had no CSS, so the browser rendered
  a white dropdown that clashed with the dark theme. Added a scoped dark style (dark `#0b0f1a`
  background, light text, `#334155` border, 8px radius, blue focus ring, styled `<option>`s).
  Kept it a sensible width on laptop (`min-width:220px; max-width:280px`); full-width on mobile.
- **Security Review — cramped table:** the 6-column review table squeezed the Review Status and
  Resolution columns and "Pending Review" wrapped. Fixes (all scoped to the review table):
  - Status badge `white-space: nowrap` → "Pending Review" stays on one line.
  - Review Status / Resolution columns get `min-width` so they no longer collapse.
  - The select and textarea now use scoped dark classes (`.review-select`, `.review-textarea`)
    with a focus ring, replacing ad-hoc inline styles.
  - Resolution cell uses a flex column (`.review-resolution`) so the textarea, **Save Review**
    button, and reviewer line align neatly and left-justified.
  - Table `min-width:900px` + container `overflow-x:auto` → a 1366px laptop shows the full table
    with no scroll (no need to zoom out); only a genuinely narrow window scrolls.
  - Added `data-label` to all 6 cells so the existing ≤768px card layout is labelled; on phones
    the Status/Resolution cells stack so controls don't overflow.
  - **Review logic untouched** — only markup classes/`data-label` and CSS changed.

## Files changed
- `client/src/css/Settings.css` — `.dark-select` styling + mobile full-width.
- `client/src/pages/SecurityReview.jsx` — scoped classes + `data-label`s (no logic change).
- `client/src/css/Management.css` — appended a scoped "Security Review table polish" block
  (`.security-review-table`, `.review-*`); does not affect Users/Staff/Tenant tables.

## Laptop layout improved
Yes — the Settings dropdown matches the theme, and the Security Review columns have room with
non-wrapping status badges and a tidy Resolution cell. Other management tables are unaffected
(changes are scoped to `.security-review-table` / `.review-*` / `.dark-select`).

## Backend / API
No backend or API files were touched; no `server/` changes.

## Test / build results
```
cd client && npm test -- --run   → Test Files: 5 passed · Tests: 28 passed
cd client && npm run build       → built successfully
```

## Suggested commit message
```
style(settings,security-review): dark dropdown + roomier review table

- Settings: add .dark-select dark theme styling (white dropdown -> dark), full-width on mobile
- SecurityReview: scoped review table polish — nowrap status badge, min-width on Status/
  Resolution columns, dark .review-select/.review-textarea, flex-aligned Save button,
  data-label on all cells, overflow-x:auto fallback; review logic unchanged
- Management.css: scoped .security-review-table/.review-* block (no impact on other tables)

CSS + small scoped JSX only; no backend/API/RBAC/theme changes.
```
