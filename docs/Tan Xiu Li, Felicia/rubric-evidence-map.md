# FlowGuard — Rubric Evidence Map (Felicia)

Maps Week 13 rubric criteria to concrete evidence in the repo. Verified status:
**Backend 79/79 passed · Frontend 70/70 passed · Frontend build success.**
Object Detection and Incident Tracking were merged into this branch. **No real secrets are committed.**

| Rubric area | Evidence |
|-------------|----------|
| **Working prototype** | Runnable full-stack app: `client/` (React/Vite), `server/` (Node/Express), `ai-service/` (FastAPI). Demo steps in `docs/Tan Xiu Li, Felicia/demo-script-week13.md`. |
| **Problem statement** | `design/problem-statement.md` — 40+ units, two loading bays, manual monitoring pain. |
| **System design & architecture** | `design/architecture.md`, `design/architecture-diagram.md`, `design/er-diagram.md`, `design/*-flow.md` (Mermaid). |
| **Full-stack integration** | React → Express (JWT) → PostgreSQL/Sequelize → FastAPI AI → WhatsApp API. Face enrol calls AI; bookings trigger WhatsApp; Driver Pass reads a public API. |
| **CRUD coverage** | See table below. |
| **Enhanced capabilities** | Face enrol (camera + upload), live recognition + liveness, PDPA off-board, FM security-review workflow, WhatsApp notifications, Driver Pass QR, Gate Scan entry/exit, next-in-line alert, slot-conflict guard, date/status/bay filters. |
| **Security / RBAC** | JWT + `requireRole` middleware + React `ProtectedRoute`; FM/Tenant/Staff/Public matrix in `design/rbac-flow.md`. bcrypt hashing, reCAPTCHA, PDPA delete, ownership checks (Tenant own-staff logs), gate scan FM-only. |
| **Usability** | Role-aware dashboards/wording, dark theme, loading/empty/error states, password show/hide, responsive Logistics + mobile Driver Pass, friendly 401/403/404/500 pages, error boundary. |
| **Testing** | `server` Jest 79/79, `client` Vitest 70/70; see `docs/Tan Xiu Li, Felicia/test-results-summary.md`. |
| **Deployment readiness** | `deployment.md` (Vercel/Render/Neon plan), `.env.example` placeholders only, build succeeds. |
| **AI usage** | `flowguard-ai/Tan Xiu Li, Felicia/ai-logs/` + `ai-reflection.md`; summary in `docs/Tan Xiu Li, Felicia/ai-usage-summary.md`. |
| **Git evidence** | Meaningful, scoped commits per feature/fix on `feature/smart-logistics-whatsapp` (see `git log`). |
| **Mermaid / system design** | `architecture-diagram.md`, `er-diagram.md`, `facial-recognition-flow.md`, `logistics-flow.md`, `rbac-flow.md`. |

## CRUD coverage (Felicia's features)

| Entity | Create | Read | Update | Delete |
|--------|--------|------|--------|--------|
| **User / Face** | register, manual-create, enroll-face | list users, my-staff, logs | suspend, re-enroll, generate-code | PDPA `DELETE /user/:id` (wipe vector + anonymise) |
| **Booking** | `POST /create` (FM/Tenant/Staff) | role-scoped `GET /`, public `GET /:ref` | `PATCH /:id/status`, `/:ref/gate-scan` | soft cancel `PATCH /:id/cancel` |
| **SecurityLog** | `POST /security/logs` | `GET /security/logs`, `/user/:id` | `PATCH /:id/review` | retained (audit); anonymised on off-board |
| **Attendance** | `/attendance/scan` | `/attendance/logs` (role-scoped) | — | cascade on user delete |

## Notes
- **Backend 79/79 passed**, **Frontend 70/70 passed**, **build success** (commands in the
  test-results summary).
- **Object Detection** and **Incident Tracking** teammate modules are merged into this branch and
  present in the shared DB/models (`detection_alerts`, `incident_logs`, `monitoring_zones`).
- **No real secrets committed** — all credentials are placeholders in `.env.example`.
- Mermaid `.md` diagrams render in VS Code preview; PNG exports must be generated manually.
```
