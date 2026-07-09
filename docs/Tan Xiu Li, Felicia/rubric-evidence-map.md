# FlowGuard — Rubric Evidence Map (Felicia)

Maps Week 13 rubric criteria to concrete evidence in the repo. Verified status:
**Backend 79/79 passed · Frontend 70/70 passed · Frontend build success.**
Object Detection and Incident Tracking were merged into this branch. **No real secrets are committed.**

- **Primary feature:** Facial Recognition & Access Management — biometric access + security/attendance
  logging (not just user-account management).
- **Secondary supporting feature:** Smart Logistics & Loading Bay Management — additional CRUD
  evidence via Bookings.

| Rubric area | Evidence |
|-------------|----------|
| **Working prototype** | Runnable full-stack app: `client/` (React/Vite), `server/` (Node/Express), `ai-service/` (FastAPI). Demo steps in `docs/Tan Xiu Li, Felicia/demo-script-week13.md`. |
| **Problem statement** | `design/md/problem-statement.md` — 40+ units, two loading bays, manual monitoring pain. |
| **System design & architecture** | `design/md/architecture.md`, `design/md/architecture-diagram.md`, `design/md/er-diagram.md`, `design/md/*-flow.md` (Mermaid); PNGs in `design/png/`. |
| **Full-stack integration** | React → Express (JWT) → PostgreSQL/Sequelize → FastAPI AI → WhatsApp API. Face enrol calls AI; bookings trigger WhatsApp; Driver Pass reads a public API. |
| **CRUD coverage** | See table below. |
| **Enhanced capabilities** | Face enrol (camera + upload), live recognition + liveness, PDPA off-board, FM security-review workflow, WhatsApp notifications, Driver Pass QR, Gate Scan entry/exit, next-in-line alert, slot-conflict guard, date/status/bay filters. |
| **Security / RBAC** | JWT + `requireRole` middleware + React `ProtectedRoute`; FM/Tenant/Staff/Public matrix in `design/md/rbac-flow.md`. bcrypt hashing, reCAPTCHA, PDPA delete, ownership checks (Tenant own-staff logs), gate scan FM-only. |
| **Usability** | Role-aware dashboards/wording, dark theme, loading/empty/error states, password show/hide, responsive Logistics + mobile Driver Pass, friendly 401/403/404/500 pages, error boundary. |
| **Testing** | `server` Jest 79/79, `client` Vitest 70/70; see `docs/Tan Xiu Li, Felicia/test-results-summary.md`. |
| **Deployment readiness** | `deployment.md` (Vercel/Render/Neon plan), `.env.example` placeholders only, build succeeds. |
| **AI usage** | `flowguard-ai/Tan Xiu Li, Felicia/ai-logs/` + `ai-reflection.md`; summary in `docs/Tan Xiu Li, Felicia/ai-usage-summary.md`. |
| **Git evidence** | Meaningful, scoped commits per feature/fix on `feature/smart-logistics-whatsapp` (see `git log`). |
| **Mermaid / system design** | `design/md/architecture-diagram.md`, `design/md/er-diagram.md`, `design/md/facial-recognition-flow.md`, `design/md/logistics-flow.md`, `design/md/rbac-flow.md`; PNGs in `design/png/`. |

## CRUD coverage

### Primary feature — Facial Recognition & Access Management
Entity group: **Biometric Access Profile** (`users.faceVector` + `isEnrolled`) + **SecurityLog** +
**Attendance**. This is biometric access plus security/attendance logging — supporting user/account
operations are part of access management, not the whole feature.

| CRUD | Evidence |
|------|----------|
| **Create** | Manual create Tenant/Staff where allowed (`POST /user/manual-create`); face enrolment `POST /user/enroll-face` (self, or FM via `targetUserId`); **automatic** attendance created by ID-verified recognition (`POST /api/facial-recognition/recognize` → `POST /api/attendance/scan { userId }`); **automatic** SecurityLogs for unknown/suspended detections (server-side, deduplicated). |
| **Read** | V-Patrol, Gate Scanner, Security Review, User Logs, Attendance logs — `GET /api/security/logs`, `GET /api/security/logs/user/:id`, `GET /api/attendance/logs`, `GET /user/`. |
| **Update** | Face re-enrolment (`POST /user/enroll-face`, overwrites the protected template — FM can re-enrol any user via the "Re-enrol Face ID" action → `/enrollment?userId=<id>`); suspend/reactivate user (`PUT /user/suspend/:id`); update security-review status/notes (`PATCH /api/security/logs/:id/review`). Face ID enrolment status badge on User/Staff Management. |
| **Delete** | PDPA off-boarding `DELETE /user/:id` — wipe `faceVector`, delete the attendance trail, and **anonymise** security logs (kept for audit, `personnelName` nulled). |

### Secondary supporting feature — Smart Logistics & Loading Bay Management
Additional CRUD evidence via **Booking**; includes WhatsApp notifications, Driver Pass QR, FM Gate
Scan, and next-in-line alerts.

| CRUD | Evidence |
|------|----------|
| **Create** | `POST /api/bookings/create` (FM / Tenant / Staff) |
| **Read** | `GET /api/bookings/` (role-scoped) and public `GET /api/bookings/:ref` (driver pass) |
| **Update** | Manual **Edit Booking** `PATCH /api/bookings/:id` (editable fields, tenant-ownership + FM permissions, slot-conflict validation); `PATCH /api/bookings/:id/status`; `PATCH /api/bookings/:ref/gate-scan` |
| **Delete (soft)** | `PATCH /api/bookings/:id/cancel` (status = Cancelled) |

### Automatic-process evidence (facial recognition)
- Recognised **active** user → attendance created/updated automatically via the verified unique
  User ID (never a name — duplicate names cannot select the wrong account).
- **Unknown** or **suspended** person → automatic SecurityLog (`Intrusion Alert` /
  `Suspended Access Attempt`) with matched user ID, confidence and camera location, deduplicated
  with a 30 s cooldown. No face in frame → no suspicious-person log.
- Recognition reads the matched User record by unique ID from PostgreSQL (source of truth for
  name, role, `isActive`, `isEnrolled`); FastAPI returns only `matchedUserId` + telemetry.
- Active biometric templates are never auto-deleted; deletion is the deliberate PDPA
  off-boarding flow above. See `facial-recognition-api-and-security.md`.

## Notes
- **Backend 170/170 passed**, **Frontend 150/150 passed**, **build success** (commands in the
  test-results summary).
- **Object Detection** and **Incident Tracking** teammate modules are merged into this branch and
  present in the shared DB/models (`detection_alerts`, `incident_logs`, `monitoring_zones`).
- **No real secrets committed** — all credentials are placeholders in `.env.example`.
- Mermaid `.md` diagrams render in VS Code preview; PNG exports must be generated manually.
