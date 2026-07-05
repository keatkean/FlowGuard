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
`APP_PORT`, `APP_SECRET`, `CLIENT_URL`, `FRONTEND_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PWD`, `FACE_AI_URL`, `PYTHON_AI_URL`, `RECAPTCHA_SECRET_KEY`, `WHATSAPP_ENABLED`,
`WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`

**AI service**
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PWD`

**Frontend (Vercel)**
`VITE_API_URL`, `VITE_RECAPTCHA_SITE_KEY`

## Notes
- **Deploy order:** database → backend → frontend (the frontend needs the backend URL; the backend
  needs the DB).
- **CORS:** set the backend `CLIENT_URL` to the Vercel URL.
- **WhatsApp after deployment:** update `FRONTEND_URL` to the live frontend so driver-pass links in
  WhatsApp point to the deployed `/driver-pass/:ref` page. Set `WHATSAPP_ENABLED=true` with real
  Meta credentials only when going live; keep it `false` (simulated) for demos.
- **AI service:** InsightFace + YOLO are memory/CPU-heavy, so the AI service runs locally for the
  demo. Cloud hosting (a GPU/většího-memory host) is future work; the backend reaches it via
  `FACE_AI_URL`.
- **Database:** face embeddings use a native `FLOAT[]` column — **pgvector is not required**.
- **Render free tier** sleeps after ~15 min idle (~30s cold start) — warn the tutor before a demo.
- **Secrets:** all credentials come from environment variables; nothing real is committed. See each
  tier's `.env.example` for placeholder names.
```
