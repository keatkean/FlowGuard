# API Documentation — Felicia (Facial Recognition + Smart Logistics)

Base: Node backend (`/user`, `/api/security`, `/api/attendance`, `/api/bookings`); Python AI service
on **port 8501**. Protected routes need `Authorization: Bearer <JWT>`.
Errors: `400` bad request · `401` no/invalid token · `403` wrong role · `404` not found ·
`409` conflict · `500` server error · `503` AI service offline.
🔒 = requires JWT.

---

## Authentication

### POST `/user/login`
- Body: `{ "email", "password", "recaptchaToken" }`
- 200: `{ token, user: { id, name, role, isEnrolled } }` · 400 invalid credentials · 403 suspended

### POST `/user/register`
Public self-registration (reCAPTCHA + invite/unit code). 200 `{ message, id }` · 400 validation ·
401 bad/expired code · 403 FM self-register blocked.

### POST `/user/manual-create` 🔒
Manual account creation. **FM → Tenant**, **Tenant → Staff**; no FM creation; Staff/Public blocked.
- Body: `{ "name", "email", "password", "role?" }`
- 201: `{ message, user: { id, name, email, role, isActive } }` (no password hash) ·
  400 validation/duplicate email · 403 wrong role.

---

## Biometric Enrolment & Recognition

### POST `/user/enroll-face` 🔒
Self, or FM for another user (`targetUserId`). Forwards images to the AI service, stores the vector,
refreshes the AI cache.
- Body: `{ "images": { "front", "left", "right" }, "targetUserId?" }`
- 200: `{ message: "Biometric enrollment successful" }` (or "…refresh pending") ·
  400 missing images / no face · 502 unexpected AI response · 503 AI offline.

### POST `/api/encode-faces` (AI, 8501)
Encodes/averages face embeddings. → `{ status, vector: number[512] }` · 400 no/multiple faces.

### POST `/user/recognize` (AI, 8501)
Matches a live frame. → `{ user: { name, status, confidence }, box, liveness_ratio }`.

### GET `/refresh` (AI, 8501)
Reloads enrolled embeddings from the DB. → `{ message }`.

---

## Security & Attendance logs

### `* /api/security/*` 🔒 (JWT on all)

- **POST `/api/security/logs`** — create an access/intrusion event (safe → Resolved, else Pending
  Review). → 201 `{ log }`.
- **GET `/api/security/logs`** — list; `?status=` and `?limit=` (≤200). → 200 array · 400 bad filter.
- **GET `/api/security/logs/user/:id`** — a person's access logs. **Ownership:** FM any; Tenant only
  their own staff (`managerId`); else 403. → 200 `{ personnelName, logs }` · 403 · 404.
- **PATCH `/api/security/logs/:id/review`** 🔒 **FM only** — `{ reviewStatus, reviewNotes }`.
  → 200 `{ log }` · 400 invalid status · 403 · 404.

### GET `/api/attendance/logs` 🔒
Role-scoped: **FM** all · **Tenant** own unit staff · **Staff** own records only. → 200 array · 401.

### POST `/api/attendance/scan`
Public kiosk — records IN/OUT for a recognised name. → 200 `{ action, worker, timestamp }` ·
400 missing name · 404 name not registered.

---

## Access & User Management 🔒

- **GET `/user/`** (FM) — list users. · **PUT `/user/suspend/:id`** (FM) — toggle active.
- **GET `/user/logs/:id`** (FM) — a user's attendance history.
- **DELETE `/user/:id`** (FM, or Tenant for own staff) — PDPA off-board: wipes `faceVector`, deletes
  attendance, anonymises security logs, removes user.
- **POST `/user/invite-tenant`** (FM) · **PUT `/user/generate-code`** (Tenant) ·
  **GET `/user/my-code`**, **GET `/user/my-staff`**.

---

## Smart Logistics — Bookings

### POST `/api/bookings/create` 🔒 (FM / Tenant / Staff)
Create a loading-bay booking. Staff bookings link to their unit via `managerId`.
- Body: `{ "transport_company", "license_plate", "driver_phone", "loading_bay",
  "driver_name?", "slot_start?", "slot_end?", "notes?" }`
- 201: `{ message, booking, whatsapp: { success, simulated } }` · 400 missing/invalid ·
  409 slot clash.
- **Side effect:** WhatsApp driver-pass link (simulated if disabled; never fails the booking).

### GET `/api/bookings/` 🔒
Role-scoped list: **FM** all · **Tenant** own (`tenantId`) · **Staff** own unit. → 200 array.

### PATCH `/api/bookings/:id/status` 🔒 **FM only**
`{ "status": "Confirmed|Arrived|Completed|Cancelled" }`. Confirmed → WhatsApp; Completed →
next-in-line WhatsApp. → 200 `{ booking, whatsapp, nextInLine }` · 400 bad status · 404.

### PATCH `/api/bookings/:id/cancel` 🔒 (FM or owning Tenant)
Soft-cancel (status Cancelled). → 200 `{ booking, whatsapp }` · 403 · 404.

### PATCH `/api/bookings/:ref/gate-scan` 🔒 **FM only**
- Body: `{ "action": "entry|exit", "observedPlate?" }`
- entry: Pending/Confirmed → Arrived; exit: Arrived/Confirmed → Completed (+ next-in-line).
- 200 `{ booking, action, plateMatched, whatsappStatus, nextInLine }` · 400 bad action ·
  403 Tenant/Staff · 404 · 409 (entry on Cancelled/Completed; exit on Cancelled).

### GET `/api/bookings/:ref`  (public — driver pass)
Look up a booking by reference for the QR pass. → 200 booking · 404.

---

## WhatsApp behaviour (side-effect, no secrets)
All driver messages go through `server/services/whatsappService.js`. It sends only when
`WHATSAPP_ENABLED=true` **and** `WHATSAPP_API_URL` + a token (`WHATSAPP_ACCESS_TOKEN` or
`WHATSAPP_API_KEY`) + `WHATSAPP_PHONE_NUMBER_ID` are present; otherwise it returns a simulated
success. It never throws (booking flows can't fail on it), masks token/phone in logs, and reads all
credentials from environment variables only — none are committed.
