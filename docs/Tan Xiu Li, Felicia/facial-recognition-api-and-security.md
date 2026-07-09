# Facial Recognition & Access Management — API, Security & Deployment (Felicia)

Updated after the facial-recognition security audit. Covers the hardened request
flow, API contracts, privacy lifecycle, and local vs deployed setup.

## Architecture — the database is the source of truth

The FastAPI service matches faces; **PostgreSQL decides everything else**.
FastAPI returns only a matched **User ID** plus biometric telemetry (confidence,
box, liveness ratio). The Node backend then loads the authoritative User record
by that unique ID and derives name, role, account status, manager/tenant
relationship, and the access decision from the database — never from AI cache
metadata (which can go stale).

### Live recognition flow

```
Pi Camera (primary)  ─┐
                      ├─ temporary JPEG frame (base64)
Laptop webcam (fallback) ─┘
        │
        ▼
POST /api/facial-recognition/recognize          (Node, FM JWT or x-edge-token)
        │  forwards frame + X-AI-Service-Key
        ▼
POST {FACE_AI_URL}/user/recognize               (FastAPI, service-key protected)
        │  { matchedUserId, confidence, box, liveness_ratio, faceDetected }
        ▼
Node: User.findByPk(matchedUserId) → checks isEnrolled, isActive
        │  writes deduplicated SecurityLog for unknown/suspended
        ▼
Frontend receives SAFE fields only:
  { user: { id, name, role, status, confidence }, box, liveness_ratio }
        │  on liveness pass (Gate Scanner)
        ▼
POST /api/attendance/scan { userId }            (Node, FM JWT or service key)
```

### Manual enrolment flow

```
Existing User account → authenticated Face Enrolment page (3 temporary images)
  → POST /user/enroll-face (Node, JWT; self or FM re-enrolment)
  → POST {FACE_AI_URL}/api/encode-faces (X-AI-Service-Key)
  → protected biometric template returned
  → template saved against that User ID (users.faceVector, isEnrolled=true)
  → GET {FACE_AI_URL}/refresh reloads the AI cache
  → the three photographs are DISCARDED (request memory only)
```

## API contracts

### FastAPI `POST /user/recognize` (service-only)

Headers: `X-AI-Service-Key: <AI_SERVICE_KEY>` (required when configured).

```json
// match
{ "matchedUserId": 25, "confidence": 0.92, "box": [x, y, w, h], "liveness_ratio": 0.31, "faceDetected": true }
// unknown person
{ "matchedUserId": null, "confidence": 0.34, "box": [x, y, w, h], "liveness_ratio": 0.50, "faceDetected": true }
// no face in frame
{ "matchedUserId": null, "confidence": 0.0, "box": null, "liveness_ratio": 0.5, "faceDetected": false }
```

FastAPI never returns names, roles, or access decisions. The known-face cache
loads `id`, the protected template, and (for developer console logs only) the
name.

### Node `POST /api/facial-recognition/recognize`

Auth: FM JWT (Gate Scanner / V-Patrol kiosk sessions) **or** `x-edge-token`
matching `EDGE_SERVICE_TOKEN` (trusted Pi edge node). Payload:
`{ image: "data:image/jpeg;base64,...", cameraLocation?: string }` (max 8 MB).

```json
// recognised + active
{ "user": { "id": 25, "name": "Tan Xiu Li, Felicia", "role": "FM", "status": "AUTHORIZED", "confidence": 0.92 }, "box": [..], "liveness_ratio": 0.31 }
// recognised + suspended (SecurityLog written server-side)
{ "user": { "id": 25, "name": "Tan Xiu Li, Felicia", "role": "FM", "status": "SUSPENDED", "confidence": 0.92 }, "box": [..], "liveness_ratio": 0.4 }
// unknown person (SecurityLog written server-side)
{ "user": { "id": null, "name": "Unknown Person", "role": null, "status": "DENIED", "confidence": 0.34 }, "box": [..], "liveness_ratio": 0.5 }
// no face detected (NO suspicious-person log)
{ "user": null, "box": null, "liveness_ratio": 0.5 }
```

Errors: `400` invalid image, `413` oversized, `503` AI offline, `502` AI error.
Never returned: faceVector, embeddings, template data, or enrolment photos.

### Node `POST /api/attendance/scan`

Auth: FM JWT or `x-service-key` = `AI_SERVICE_KEY`. Payload: `{ userId }` —
**a submitted name is no longer accepted** (duplicate names cannot select the
wrong account; identity comes from `User.findByPk`). The route verifies
`isEnrolled` and `isActive` before creating/updating attendance, preserving the
existing clock-in → clock-out → out-timestamp-update behaviour. Response:
`{ status, action, worker, role, timestamp, openTurnstile }`.

## Automatic security logging

| Outcome | Behaviour |
|---|---|
| Active + recognised | Attendance flow proceeds; no security log from the recognize route |
| Suspended + recognised | Denied; `Suspended Access Attempt` log (name, matched user ID, confidence, location) |
| Unknown person | Denied; `Intrusion Alert` log (confidence, location) |
| No face detected | No recognition attempt, **no suspicious-person log** |
| Repeated unknown/suspended | Deduplicated: one log per (event, identity, location) per 30 s |

New nullable audit columns on `security_logs`: `matchedUserId`, `confidence`,
`cameraLocation`. Logs never store snapshots or biometric template data.

## Privacy — biometric data lifecycle

- **Enrolment photos:** browser memory → Node request memory → FastAPI request
  memory → protected biometric template generated → template stored against the
  User ID → photographs discarded. Never written to PostgreSQL, Google Cloud
  Storage, local disk, or logs.
- **Live frames:** processed temporarily for matching, then discarded.
- **Stored:** protected biometric template (server-side only), recognition
  result, confidence, attendance/security logs.
- **Never exposed to the frontend:** raw biometric vectors, embeddings, or
  template data.
- **Off-boarding:** `DELETE /user/:id` wipes the template, deletes the
  attendance trail, and anonymises security logs (audit events kept, PII nulled).

## Service-to-service security

- Node → FastAPI: `X-AI-Service-Key` header on `/api/encode-faces`,
  `/user/recognize`, `/refresh`. FastAPI validates it against `AI_SERVICE_KEY`;
  if unset it warns and skips the check (**local dev only** — never deploy
  without it).
- FastAPI → Node (detection alerts): existing `x-service-key` header, same key.
- Edge device → Node: optional `x-edge-token` = `EDGE_SERVICE_TOKEN`.
- FastAPI CORS: env allowlist (`ALLOWED_ORIGINS`, default localhost:5173) — the
  wildcard-with-credentials configuration was removed. The browser no longer
  needs FastAPI CORS for face endpoints at all (they are service-to-service).

## Local development setup

1. `server/.env`: `FACE_AI_URL=http://127.0.0.1:8501`, `AI_SERVICE_KEY=dev-local-ai-key` (example), `APP_SECRET`, DB creds.
2. `ai-service/.env`: same DB creds, `AI_SERVICE_KEY=dev-local-ai-key`.
3. `client/.env`: leave `VITE_API_BASE_URL` unset — relative `/api` and `/user`
   URLs use the Vite dev proxy to the local Node server. Pi camera URLs via
   `VITE_PI_CAMERA_STREAM_URL` / `VITE_PI_CAMERA_SNAPSHOT_URL`.
4. Start: `server → node index.js`, `ai-service → uvicorn main:app --port 8501`,
   `client → npm run dev`.
5. Pi Camera remains primary on Gate Scanner / V-Patrol; laptop webcam is the
   automatic fallback.

## Vercel / cloud deployment

- **Vercel frontend:** set `VITE_API_BASE_URL` to the deployed Node backend URL.
  The Vite `/ai` proxy does not exist in production and is no longer used by the
  facial-recognition pages — the frontend never calls FastAPI directly.
- **Node backend (e.g. Render):** set `FACE_AI_URL` to the deployed FastAPI URL
  (e.g. Cloud Run), plus `AI_SERVICE_KEY`, `APP_SECRET`, PostgreSQL creds, and
  optionally `EDGE_SERVICE_TOKEN`.
- **FastAPI (e.g. Cloud Run):** set `AI_SERVICE_KEY` (required in production)
  and `ALLOWED_ORIGINS` (or leave the face service unexposed to browsers
  entirely). PostgreSQL (Neon) remains the system database.
- **Storage:** Google Cloud Storage is NOT used for raw enrolment photos or live
  snapshots — no raw facial imagery is persisted anywhere.
- **Production direction:** the Pi edge node sends temporary frames (or
  recognition requests) to the Node backend over the authenticated
  `x-edge-token` path; raw camera feeds and biometric templates are never
  publicly exposed.

## Local PoC vs deployment (summary)

| | Local PoC | Deployment |
|---|---|---|
| Frontend | Vite dev server + proxy | Vercel, `VITE_API_BASE_URL` → Node |
| Recognition path | Browser → Node → FastAPI (all local) | Vercel → cloud Node → secured FastAPI |
| Pi camera | LAN MJPEG preview + `/snapshot` capture | Edge node posts frames via `x-edge-token` |
| Webcam | Automatic fallback for demo reliability | Same (kiosk fallback) |
| Secrets | Dev placeholder keys via `.env` | Real keys in platform env vars only |
