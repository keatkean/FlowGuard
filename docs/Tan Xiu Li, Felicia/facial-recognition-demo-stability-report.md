# Facial Recognition — Demo Stability Report

**Branch:** `feature/facial-recognition-access`
**Owner:** Felicia Tan — Facial Recognition & Access Management
**Scope:** Targeted demo-stability fixes only. RBAC + error handling preserved; no teammate
module logic changed.
**Date:** 2026-06-21

---

## A. Summary of fixes

1. **Live cache refresh after enrolment.** The backend now calls the AI service's existing
   `GET /refresh` endpoint right after a successful enrolment, so V-Patrol / Gate Scanner
   recognise a newly enrolled face **without restarting** the AI service. If refresh fails the
   enrolment still succeeds (returns *"Face enrolled, AI cache refresh pending."*).
2. **AI `400` vs `500` fixed.** `ai-service/main.py` `encode-faces` now `except HTTPException: raise`
   **before** the broad handler, so "No face detected" stays a **400**; unexpected failures return
   **500** with a safe generic message (no stack trace / raw exception leaked).
3. **`faceVector` is no longer dropped on startup.** Removed the `server/index.js` pgvector-fallback
   block that ran `ALTER TABLE "users" DROP COLUMN IF EXISTS "faceVector"` — it was wiping every
   enrolled face on each restart. The column is plain `FLOAT[]`; Sequelize sync manages it safely.
4. **Port alignment to 8501.** The Vite `/ai` proxy, `FACE_AI_URL`, the AI service's own default
   run port, and the README now all agree on **8501**. `PYTHON_AI_URL` (a *different*, teammate-owned
   recognition endpoint) was left as a full `…:8000/recognize` URL.
5. **Folder typo** `flowguard-ai/Tan XIu Li, Felicia/` — already corrected to `Tan Xiu Li, Felicia`
   (verified on disk and in git; AI logs intact). No action needed.
6. **Removed the noisy duplicate** `client/src/pages/__tests__/FaceEnrollment.test.jsx`; the
   comprehensive suite under `client/tests/Tan Xiu Li, Felicia/` already covers (and exceeds) it.

---

## B. Files changed

| Area | File | Change |
|------|------|--------|
| Backend | `server/index.js` | Removed pgvector `CREATE EXTENSION` + `DROP COLUMN faceVector` startup block |
| Backend | `server/routes/user.js` | Call `GET {FACE_AI_URL}/refresh` after enrol; safe "refresh pending" fallback; default base URL → 8501 |
| Backend | `server/.env.example` | `FACE_AI_URL=…:8501` + comments distinguishing base-URL vs full-endpoint |
| AI service | `ai-service/main.py` | `except HTTPException: raise`; safe 500 message; `__main__` default port → 8501 |
| Frontend | `client/vite.config.js` | `/ai` proxy target `8500 → 8501` |
| Docs | `README.md` | AI-service run command + warning updated to 8501; clarified one combined service |
| Tests | `server/tests/user.test.js` | Mock `axios.get`; assert refresh fires; add "refresh pending" case |
| Tests | _(removed)_ `client/src/pages/__tests__/FaceEnrollment.test.jsx` | Redundant/noisy duplicate |

---

## C. `FACE_AI_URL` vs `PYTHON_AI_URL`

| Var | Value | Shape | Used by | Rule |
|-----|-------|-------|---------|------|
| `FACE_AI_URL` | `http://127.0.0.1:8501` | **Base URL** | `server/routes/user.js` (`/api/encode-faces`, `/refresh`) — facial recognition (mine) | Backend appends paths; do **not** store a full `/endpoint` here |
| `PYTHON_AI_URL` | `http://127.0.0.1:8000/recognize` | **Full endpoint** | `server/routes/incident.js` (teammate incident scan) | Already includes `/recognize`; do **not** append another path |

These are **two different services** and must not be swapped. The code uses each correctly, so
no double-paths (e.g. `/recognize/recognize`, `/api/encode-faces/api/encode-faces`) are produced.

---

## D. AI service ports & local run commands

| Service | Port | Start command |
|---------|------|---------------|
| Frontend (Vite/React) | 5173 | `cd client && npm run dev -- --host` |
| Backend (Node/Express) | `APP_PORT` (see note) | `cd server && node index.js` |
| **Face + YOLO AI service** (`ai-service/main.py`) | **8501** | `cd ai-service && uvicorn main:app --host 0.0.0.0 --port 8501 --reload` |
| Recognition service for incident scan (teammate, optional) | 8000 | per teammate's docs (`PYTHON_AI_URL`) |

The browser reaches the AI service only through the Vite `/ai` proxy → `http://localhost:8501`
(used by V-Patrol, Gate Scanner **and** Object Detection). The backend reaches it via `FACE_AI_URL`.

> **Note (pre-existing):** the Vite `/user` and `/api` proxies point at `127.0.0.1:5001`/`5000`,
> while `.env.example` shows `APP_PORT=3000`. Your real `.env` `APP_PORT` must match the proxy
> target (left unchanged — environment-specific).

---

## E. How new enrolment refreshes the AI known-face cache

```
FaceEnrollment (browser)
  → POST /user/enroll-face (Node, JWT)
      → POST {FACE_AI_URL}/api/encode-faces  → returns 512-d vector
      → User.update({ faceVector, isEnrolled:true })   (PostgreSQL)
      → GET  {FACE_AI_URL}/refresh            (reloads in-memory known_faces)
          • success → 200 "Biometric enrollment successful"
          • failure → 200 "Face enrolled, AI cache refresh pending."  (enrolment NOT lost)
```

The AI service already exposed `GET /refresh` (it re-runs `load_authorized_faces()` from the DB).
Previously it was only called manually / on startup, so a new face wasn't recognised until restart.
Now it's triggered automatically and **non-fatally**.

---

## F. Error handling

| Case | Where | Result |
|------|-------|--------|
| **No face detected** | `main.py` raises `HTTPException(400)`, re-raised (not swallowed); backend forwards **400** | Banner shows the AI's message |
| **AI service offline** | backend `enroll-face` catch detects `ECONNREFUSED/ETIMEDOUT/…` → **503** | "Facial recognition service is offline. Please try again shortly." |
| **AI unexpected response** | empty/non-array vector → **502**; AI 500 forwarded as 502; AI internal error → safe **500** (generic message) | "Unexpected response from facial recognition service." |
| **No webcam / camera denied** | `getUserMedia` guarded in FaceEnrollment / VPatrol / GateScanner | FaceEnrollment → "use Upload Photos"; VPatrol → overlay + Retry; GateScanner → terminal message |
| **Refresh fails post-enrol** | inner try/catch | enrolment kept; "AI cache refresh pending." |

---

## G. Confirmation: `faceVector` is no longer dropped on startup

`server/index.js` previously ran, whenever `CREATE EXTENSION vector` failed:

```sql
ALTER TABLE "users" DROP COLUMN IF EXISTS "faceVector";
```

This wiped all enrolled embeddings on **every** restart in a non-pgvector environment. The entire
block (extension create + column drop) has been **removed**. `faceVector` remains a Sequelize
`ARRAY(FLOAT)` (PostgreSQL `FLOAT[]`); `sequelize.sync({ alter: true })` keeps it intact. Docs
(README, `database-schema.md`) continue to describe `FLOAT[]` — **pgvector is not implemented**.

---

## H. Tests added / changed

- `server/tests/user.test.js`: `axios.get` now mocked; **enrolment asserts `/refresh` is called**
  and message is "successful"; **new test** confirms a failed refresh still returns 200 with
  "refresh pending". (Existing 400 / 503 / delete-PDPA tests retained.)
- Removed redundant `client/src/pages/__tests__/FaceEnrollment.test.jsx`. Equivalent + deeper
  coverage remains in `client/tests/Tan Xiu Li, Felicia/FaceEnrollment.test.jsx` (render, upload
  validation, submit endpoint, backend-error surfacing, missing-images guard).
- All other RBAC / error-handling / security tests unchanged and still passing.

---

## I. Commands run and results

```
cd server && npm test           → Test Suites: 4 passed · Tests: 22 passed ✅
cd client && npm test -- --run  → Test Files: 4 passed · Tests: 24 passed ✅
cd client && npm run build      → ✓ built ✅
```

---

## J. Remaining risks

1. **AI service must be started on 8501.** If launched on another port, enrolment + live
   recognition fail. (Now consistent across env, proxy, README, and `main.py` default.)
2. **Teammate `ObjectDetection.jsx` help text still says "port 8500"** (line ~283). Cosmetic and
   teammate-owned — left untouched; mention during integration.
3. **Backend ↔ Vite proxy port** (`APP_PORT` vs `5001/5000`) mismatch is environment-specific and
   unchanged.
4. **`/refresh` reloads the whole table** each enrolment — fine at demo scale; could be incremental later.
5. **Teammate AI recognition (`PYTHON_AI_URL`, 8000)** is a separate service not started by the
   face-AI command; only relevant to the incident-scan module.
6. **pgvector still not implemented** — vectors are `FLOAT[]`, matched with NumPy. Documented as such.

---

## K. Suggested git commit message

```
fix(face): demo stability — live AI refresh, safe errors, stop faceVector wipe, port 8501

- enroll-face: trigger GET {FACE_AI_URL}/refresh after save so new faces recognise
  immediately; refresh failure is non-fatal ("AI cache refresh pending")
- ai-service: re-raise HTTPException so "No face detected" stays 400; safe generic 500
- server/index.js: remove pgvector CREATE/DROP COLUMN faceVector block that wiped
  enrolled faces on every restart (FLOAT[] managed by sync)
- align AI service to port 8501: vite /ai proxy, FACE_AI_URL default, main.py default, README
- .env.example: document FACE_AI_URL (base) vs PYTHON_AI_URL (full endpoint)
- tests: assert refresh fires + refresh-pending fallback; remove noisy duplicate enrol test

Preserves RBAC + error handling; no teammate module logic changed.
```
