# Deployment

FlowGuard runs fully **locally for the Week 13 demo**; cloud deployment is planned. Replace all
placeholder URLs with your live ones before submission. **Do not put real secret values here** —
use placeholder names only.

## Current status (local demo)
| Tier | Local |
|------|-------|
| Frontend (React/Vite) | http://localhost:5173 |
| Backend (Node/Express) | http://localhost:5001 |
| AI service (FastAPI: InsightFace + YOLO) | http://127.0.0.1:8501 |
| Database | local or managed PostgreSQL |
| WhatsApp | simulated (`WHATSAPP_ENABLED=false`) |

## Planned cloud deployment
| Tier | Service | Public URL (placeholder) |
|------|---------|--------------------------|
| Frontend | **Vercel** | https://your-app.vercel.app |
| Backend API | **Render** | https://your-backend.onrender.com |
| Database | **Neon / Supabase PostgreSQL** | (internal connection string) |
| AI service | **local / demo now**, future cloud (heavy: InsightFace + YOLO) | https://your-ai-service.example.com |

## Environment variables (placeholder names only — never real values)

**Backend (Render)**
`APP_PORT`, `APP_SECRET`, `CLIENT_URL` + `ALLOWED_ORIGINS` (CORS allowlist — set the Vercel URL;
unset = dev allow-all fallback), `FRONTEND_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PWD`, `FACE_AI_URL`, `PYTHON_AI_URL`, `AI_SERVICE_KEY`, `EDGE_SERVICE_TOKEN` (optional),
`RECAPTCHA_SECRET_KEY`, `WHATSAPP_ENABLED`, `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`

**AI service (e.g. Cloud Run)**
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PWD`, `AI_SERVICE_KEY` (required in production —
protects the face endpoints), `ALLOWED_ORIGINS`

**Frontend (Vercel)**
`VITE_API_BASE_URL` (the ONE canonical Node-backend URL — facial recognition, attendance,
security logs, Smart Logistics and the public Driver Pass all call Node through it; leave blank
locally so the Vite proxy handles `/api`; the Vite dev proxies do not exist in production),
`VITE_RECAPTCHA_SITE_KEY`, `VITE_PI_CAMERA_STREAM_URL`, `VITE_PI_CAMERA_SNAPSHOT_URL`
(demo-network Pi camera). No secret values in any `VITE_` variable — they are public in the
built bundle.

## Notes
- **Deploy order:** database → backend → frontend (the frontend needs the backend URL; the backend
  needs the DB).
- **CORS:** the backend uses an environment allowlist (`CLIENT_URL` + optional comma-separated
  `ALLOWED_ORIGINS`, e.g. LAN dev origins). If both are unset it falls back to allow-all for
  local development — always set `CLIENT_URL` to the Vercel URL when deploying. Wildcard and
  credentials are never combined.
- **WhatsApp after deployment:** update `FRONTEND_URL` to the live frontend so driver-pass links in
  WhatsApp point to the deployed `/driver-pass/:ref` page. Set `WHATSAPP_ENABLED=true` with real
  Meta credentials only when going live; keep it `false` (simulated) for demos.
- **AI service:** InsightFace + YOLO are memory/CPU-heavy, so the AI service runs locally for the
  demo. Cloud hosting (a GPU/většího-memory host) is future work; the backend reaches it via
  `FACE_AI_URL`.
- **Database:** protected biometric templates use a native `FLOAT[]` column — **pgvector is not
  required**. Raw enrolment photos and live snapshots are never stored (no PostgreSQL, no Google
  Cloud Storage, no disk).
- **Facial recognition path:** browser → Node (`/api/facial-recognition/recognize`, FM JWT or
  edge token) → FastAPI (`X-AI-Service-Key`) → Node resolves the User by ID in PostgreSQL. The
  frontend never calls FastAPI directly. Full details:
  `docs/Tan Xiu Li, Felicia/facial-recognition-api-and-security.md`.
- **Render free tier** sleeps after ~15 min idle (~30s cold start) — warn the tutor before a demo.
- **Secrets:** all credentials come from environment variables; nothing real is committed. See each
  tier's `.env.example` for placeholder names.
