# FlowGuard — Group Rubric Evidence Map (merged system)

Branch: `feature/smart-logistics-whatsapp`. Merged modules: Facial Recognition, Smart Logistics,
Object Detection, AI Helpdesk, Incident Tracking. Each member owns at least one full-stack feature
with CRUD (basic functions) + enhanced capabilities. **No real secrets are committed.**

Backend routes: `user`, `security`, `attendance`, `booking`, `cameras`, `zones`, `detectionAlerts`,
`incident`, `support`. Tables: `users`, `bookings`, `attendance`, `security_logs`, `invites`,
`cameras`, `monitoring_zones`, `detection_alerts`, `incident_logs`, `chat_transcripts`,
`support_tickets`, `knowledge_base`.

---

## Felicia — Facial Recognition & Access Management (primary)
Biometric access + security/attendance logging (not just user-account management).

- **Manual CRUD:** face enrolment / re-enrolment (`POST /user/enroll-face`), user & security/attendance
  log reads (`GET /api/security/logs`, `/api/attendance/logs`, `GET /user/`), security-review updates
  (`PATCH /api/security/logs/:id/review`), suspend/reactivate (`PUT /user/suspend/:id`), PDPA
  off-boarding (`DELETE /user/:id` — wipe `faceVector`, delete attendance, anonymise security logs).
- **Auto:** face recognition creates Attendance (IN/OUT) and SecurityLog (access / intrusion) records.
- **Secondary supporting feature — Smart Logistics:** Booking CRUD (`POST /api/bookings/create`,
  `GET /api/bookings/`, `GET /api/bookings/:ref`, `PATCH /api/bookings/:id/status`,
  `PATCH /api/bookings/:ref/gate-scan`, `PATCH /api/bookings/:id/cancel`) + Driver Pass QR + WhatsApp
  notifications + FM gate scan + next-in-line.

## Charlisa — Object Detection & Space Management
- **Manual CRUD:** Camera CRUD (`/api/cameras`), MonitoringZone CRUD (`/api/zones`), DetectionAlert
  read/update/manual-create (`/api/detection-alerts`).
- **Auto:** YOLO creates DetectionAlert records and can seed IncidentLog; stale detection alerts are
  purged on a 30-day schedule.
- **Note (optional improvement):** a DetectionAlert manual delete/archive endpoint is a nice-to-have
  if not already implemented (soft-delete `paranoid` is enabled on the model).

## Lucas — AI Helpdesk & Facility Support
- **Manual CRUD:** SupportTicket read/update/delete, KnowledgeBase CRUD (`/api/support`).
- **Auto:** ChatTranscript is created from the chatbot; an unresolved/escalated chat auto-creates a
  SupportTicket; transcripts are cleaned up on a 90-day schedule.
- **Note (optional improvement):** a manual FM-created ticket endpoint is a nice-to-have if not
  already implemented.

## Gladwin — Incident Tracking & Resolution
- **Manual CRUD:** IncidentLog create / read / update / delete (`/api/incident`).
- **Auto:** AI / object detection / facial recognition can create incident records; resolution
  lifecycle (`resolutionStatus`) is tracked; soft-delete (`paranoid`) retained for audit.

---

## Shared rubric evidence
- **Testing:** `cd server && npm test`, `cd client && npm test -- --run`, `cd client && npm run build`
  (see `docs/Tan Xiu Li, Felicia/test-results-summary.md` for Felicia's verified counts).
- **Security / RBAC:** JWT + `requireRole` + React `ProtectedRoute`; FM/Tenant/Staff/Public matrix in
  `design/md/rbac-flow.md`.
- **System design:** `design/md/architecture.md`, `design/md/architecture-diagram.md`,
  `design/md/er-diagram.md`, `design/md/*-flow.md`; PNGs in `design/png/`.
- **No secrets committed** — all credentials are placeholders in `.env.example`.
- After Mermaid edits, regenerate `design/png/er-diagram.png`, `design/png/architecture-diagram.png`,
  and optionally `design/png/planned-deployment.png`.

> This is a group-level summary. Individual per-feature evidence for Felicia is in
> `docs/Tan Xiu Li, Felicia/rubric-evidence-map.md`. Charlisa / Lucas / Gladwin CRUD claims are
> documented from the merged models/routes; each owner should confirm their optional-improvement notes.
```
