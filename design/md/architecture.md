# FlowGuard — System Design

FlowGuard is a three-tier app: a React/Vite frontend, a Node.js/Express backend, and a Python
FastAPI AI microservice, all backed by a shared PostgreSQL database, with WhatsApp Cloud API as an
external notification service. See `architecture-diagram.md` for the visual, `er-diagram.md` for the
data model, and the `*-flow.md` files for feature flows.

## 1. Frontend — React + Vite
- `client/src/pages/` — route screens: public site, Login/Register, role Dashboard, V-Patrol,
  Cameras, Object Detection, Gate Scanner, Face Enrollment, Attendance, Logistics, Users,
  Security Review, Tenant Onboarding, Settings, and the public **Driver Pass** QR page.
- `client/src/components/` — reusable UI incl. `ProtectedRoute` (role allow-lists), `Sidebar`
  (role-aware links), and `PasswordInput`.
- `client/src/constants/roles.js` — canonical role constants + access groups shared by routes/UI.
- Vite dev proxy forwards `/user`, `/api` to the backend and `/ai` to the AI service.

## 2. Backend — Node.js + Express
- `server/routes/` — domain routers: `user` (auth, face enrol, manual create, logs),
  `security`, `attendance`, `booking` (logistics + gate scan), `incident`, `zones`,
  `detectionAlerts`.
- `server/middlewares/auth.js` — `verifyToken` (JWT) + `requireRole(...)` RBAC; plus
  `errorHandlers.js` (404 + safe global 500).
- `server/services/whatsappService.js` — env-gated, mock-safe WhatsApp Cloud API client.
- `server/models/` — Sequelize models + associations; `index.js` wires them; `seed.js` seeds FM.

## 3. Database — PostgreSQL + Sequelize
- Single shared instance. Tables: users, bookings, attendance, security_logs, detection_alerts,
  incident_logs, monitoring_zones, invites.
- Face embeddings stored as a native `FLOAT[]` array column (`faceVector`); **pgvector is not
  required** for local development.

## 4. AI service — Python + FastAPI (port 8501)
- `ai-service/main.py` — one service exposing face endpoints (`/api/encode-faces`,
  `/user/recognize`, `/refresh`) and YOLO endpoints (`/api/yolo/*`).
- **InsightFace** encodes 512-d embeddings and matches by cosine similarity (NumPy).
- **Ultralytics YOLO** performs object/person detection.
- Loads/refreshes enrolled embeddings from the same PostgreSQL database.

## 5. External services
- **WhatsApp Cloud API** — driver notifications (booking created/confirmed/arrived/completed,
  next-in-line, cancelled). Disabled by default; simulated in local/demo mode; credentials come
  from environment variables only.
- **Google reCAPTCHA** — bot protection on register/login.

## 6. Role-based access & public surface
- RBAC enforced on both tiers (React `ProtectedRoute` + Express `requireRole`). Roles: FM, Tenant,
  Staff, Public. See `rbac-flow.md` for the full matrix.
- The **Driver Pass** page is intentionally public (drivers have no login) and is read-only via the
  public `GET /api/bookings/:ref` lookup.

## 7. Deployment posture
- **Local demo (current):** frontend `:5173`, backend `:5001`, AI service `:8501`, local/managed
  PostgreSQL. WhatsApp can run in simulated mode locally, or real mode when valid WhatsApp Cloud API
  environment variables are enabled.
- **Planned cloud:** Vercel (frontend), Render (backend), Neon/Supabase (PostgreSQL). The AI service
  (InsightFace/YOLO) is heavy and stays local for the demo, with cloud hosting as future work. After
  deployment, set `FRONTEND_URL` so WhatsApp driver-pass links point to the live site.
- All secrets are supplied via environment variables; see each tier's `.env.example`. No real
  secrets are committed.
