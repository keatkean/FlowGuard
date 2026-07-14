# AI Reflection — Incident Tracking & Resolution (Gladwin)

This module was built with the help of Claude Code. The raw session transcripts are in the `ai-logs` folder.

## What AI helped with
- Exploring the existing codebase (models, routes, design system, routing/sidebar
  structure) before any code was written, and producing implementation plans that I
  reviewed and approved in plan mode before each build phase.
- Scaffolding the Incident Dashboard page (`IncidentDashboard.jsx` + `IncidentDashboard.css`,
  the FM-only `/incidents` route, and the sidebar link) — first as a static-data shell with
  stat cards, filters, table, and detail modal.
- Implementing the full CRUD backend and wiring: extending the Sequelize `IncidentLog`
  model with `severity`, `source`, `resolutionStatus`, and `notes` columns; adding
  `POST /api/incident` (FM manual creation), `PATCH /api/incident/:id` (status pipeline
  Active → Investigating → Escalated to Security → Cleared, plus resolution notes and
  severity), and JWT-protecting `DELETE /api/incident/:id`.
- Building the live AI seeding bridge in `server/routes/detectionAlerts.js` — when the AI
  service posts an unattended-object alert, a matching `IncidentLog` row is created
  (severity inferred from `duration_seconds`), and the dashboard picks it up via a 10-second
  poll with a slide-in animation and an "AI Detected vs Manually Logged" counter.
- UI/UX polish across several feedback rounds: row insert/delete animations, a stacked
  in-flow toast system, a back-to-top button, 30-char table truncation, and modal
  text-overflow fixes.
- Debugging: the severity-edit "not updating" issue, the reCAPTCHA badge being hidden
  behind the sticky Actions column, and Actions-button alignment.
- Drafting session handoff summaries so context carried cleanly across sessions.

## What I manually reviewed
- **Security boundaries** — I checked that `/incidents` is wrapped in `ProtectedRoute`
  with `ACCESS.FM_ONLY` (non-FM users are redirected to `/error/403`), that the sidebar
  link only renders inside the `isFM` block, and that the mutating routes
  (`POST /api/incident`, `PATCH /api/incident/:id`, `DELETE /api/incident/:id`) all require
  a valid JWT via `verifyToken`. I also had the previously-unauthenticated DELETE route
  brought under `verifyToken`.
- **Input validation** — I confirmed the server validates `resolutionStatus` and `severity`
  against explicit allowlists rather than trusting client input, and that `source` is
  hardcoded to `'Manual'` (server and client) for manual entries so they can never
  masquerade as AI detections.
- **Data safety** — during the static-data phase I required that deletes only touch local
  component state so testing could never corrupt the shared database; once wired up, deletes
  use Sequelize soft delete (`paranoid: true`). The new model columns are all
  defaulted/nullable so the pre-existing AI `scan-frame` route kept working unchanged.
- **Bridge reliability** — I reviewed the alert→incident bridge design: the `IncidentLog`
  create is fire-and-forget *after* the alert's 201 response, so a bridge failure can never
  block or fail the AI service's own alert flow.

## What code I accepted / rejected
- **Accepted:** the model extension, the CRUD route surface, the reuse of existing CSS/design
  patterns (Management/Users/SecurityReview styles), the 10-second polling approach with a
  functional state updater to avoid stale closures, and the fire-and-forget bridge.
- **Adjusted:** I put the AI through four rounds of manual-test feedback — renaming
  "AI Source" to "Source", locking the source field in the create modal, tinting
  manually-created rows, moving toasts from the top-right (they were blocking the add-log
  button) into the document flow between the filter bar and table with stacking and
  red delete variants, adding delete slide-out animations, and truncating long names that
  pushed the Actions column off-screen (full text kept in the detail modal).
- **Rejected / corrected:** when severity edits appeared not to persist, the AI's first
  diagnosis (a Sequelize `reload()` "quirk") was wrong. I pushed back and pointed it at the
  working `resolutionStatus` path as a comparison, which led to the real root cause — the
  running Node server was a stale process that had never loaded the new route code. No code
  fix was needed; we added a nodemon `dev` script to prevent it recurring. The AI also
  initially rendered manual incidents with an "Object Detection" badge — I caught this in
  testing and had the badge logic fixed.

## How I verified correctness
- Manual browser testing after every delivery round: all five CRUD flows (manual create,
  read/filter/search, status + notes + severity update, delete) persist correctly across
  page refreshes, and logging in as a non-FM user is blocked from `/incidents`.
- Deliberate stress tests: excessively long person names (table and modal overflow),
  mass-creating incidents (scroll/back-to-top behaviour), and rapid successive actions
  (toast stacking). One fix round was driven by a screenshot I supplied of the modal
  overflow bug.
- Live-seeding verification: POSTing a simulated alert to `/api/detection-alerts`
  (e.g. `{ zone_name, camera_location, object_class, duration_seconds }`) and confirming the
  new row slides into the dashboard within 10 seconds and the "AI Detected" counter
  increments; creating a manual incident and confirming "Manually Logged" increments.
- Regression checks after fixes — e.g. after the severity-edit fix I re-verified that
  resolution-status updates still reflected immediately in the table.

## Limitations / risks
- Only Object Detection (unattended-object) alerts are bridged into the incident table;
  Facial Recognition incidents still flow through the separate security-log pipeline, and
  the `POST /api/incident/scan-frame` route points at a teammate-owned Python AI service.
- The dashboard uses simple 10-second polling rather than websockets, and severity for AI
  incidents is inferred purely from duration thresholds — acceptable for a PoC demo.
- `GET /api/incident` is unauthenticated (pre-existing behaviour, left as-is); only the
  mutating routes require a JWT.
- Filtering/search runs client-side on the fetched dataset even though the backend supports
  a search query param.
- The monthly archival of resolved incidents from the original module plan was not
  implemented, and leftover seeded test rows had to be removed manually via the dashboard's
  Delete button.

---
