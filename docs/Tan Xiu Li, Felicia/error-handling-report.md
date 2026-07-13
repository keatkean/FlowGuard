# Error-Handling Report — FlowGuard

**Branch:** `feature/facial-recognition-access`
**Scope:** Safe, targeted error-handling fixes after the RBAC pass. No teammate module logic
rewritten; RBAC behaviour preserved.
**Date:** 2026-06-21

---

## A. Summary of error-handling changes

1. **Blank-screen protection (frontend):** added a top-level `ErrorBoundary` around all routes
   so a render-time crash shows a friendly "500 / Something went wrong" fallback instead of a
   white screen.
2. **Backend 404 + global error handler:** new `server/middlewares/errorHandlers.js`
   (`notFound`, `errorHandler`) mounted last in `index.js`. Unknown routes → `404` JSON;
   anything thrown/rejected → `500` JSON with **no stack/internal message leaked**.
3. **AI-service resilience:** `POST /user/enroll-face` now uses a request timeout and returns
   **`503`** when the Python AI service is offline/unreachable, **`400`** forwarded when the AI
   reports "no face", and **`502`** on an unexpected/empty AI response — instead of a vague 500.
4. **No leaked internals:** the `err.message` 500 responses across `user.js` were replaced with
   a generic `"Internal server error."` message + a developer `console.error`.
5. **Camera failure UX:** V-Patrol now shows a clear "Camera unavailable" overlay + Retry
   (previously a silent black feed); FaceEnrollment and GateScanner guard against a missing
   `getUserMedia` (no webcam / insecure context) with helpful messages.
6. **Cosmetic fix:** `SystemError` compared a string code with a number, so the 403 page never
   got its "critical" styling — now coerced with `Number(code)`.

---

## B. Frontend error route matrix

| Code | When it appears | Page / component | User message | Manual test |
|------|-----------------|------------------|--------------|-------------|
| 400 | Bad request surfaced by an API call (e.g. invalid enrolment input) | Inline on the page (error banner) + `/error/400` page exists | "Invalid Data Payload…" / specific banner text | Submit enrolment with a non-image file → banner |
| 401 | No session / not logged in | `ProtectedRoute` → `/error/401` (`SystemError`) | "Authentication Required… please authenticate" | Log out, open `/dashboard` directly |
| 403 | Logged in, wrong role | `ProtectedRoute` → `/error/403` (`SystemError`) | "Clearance Denied…" | Log in as Tenant, open `/users` |
| 404 | Unknown SPA route | `*` → `NotFound` | "Sector Not Found…" | Visit `/nonsense-url` |
| 409 | Duplicate resource (e.g. email already registered) | Inline on Register form | "This email is already registered…" | Register an existing email |
| 500 | Unexpected render crash | `ErrorBoundary` fallback | "Something went wrong… try reloading" | (dev) throw in a page → fallback shows |
| 500 | Backend failure surfaced via axios | Inline error state on each page | Generic safe message; page does not blank | Stop backend, load a data page |

---

## C. Backend API error matrix

(✔ = handled in code · — = not applicable · 🔴 = teammate-owned, **not enforced**, see §H)

| API Route | 400 | 401 | 403 | 404 | 409 | 500 | Notes |
|-----------|:--:|:--:|:--:|:--:|:--:|:--:|-------|
| `POST /user/register` | ✔ | — | ✔ | — | ✔ | ✔ | 409→"email already registered"; FM self-register blocked (403) |
| `POST /user/login` | ✔ | — | ✔ | — | — | ✔ | 403 if account suspended |
| `POST /user/enroll-face` | ✔ | ✔ | ✔ | ✔ | — | ✔ | **503** AI offline, **502** bad AI response, **400** no-face forwarded |
| `GET /user/` (list) | — | ✔ | ✔ | — | — | ✔ | FM only |
| `PUT /user/suspend/:id` | — | ✔ | ✔ | ✔ | — | ✔ | FM only; 404 if user missing |
| `GET /user/logs/:id` | — | ✔ | ✔ | — | — | ✔ | FM only (`requireRole`) |
| `DELETE /user/:id` | ✔ | ✔ | ✔ | ✔ | — | ✔ | 400 self-delete; FM/owner only |
| `* /api/security/*` | ✔ | ✔ | ✔ | ✔ | — | ✔ | JWT router-wide; review FM-only; 404 log/user missing |
| `GET /api/attendance/logs` | — | ✔ | ✔ | — | — | ✔ | Staff→403; Tenant scoped |
| `POST /api/attendance/scan` | ✔ | — | — | ✔ | — | ✔ | Public kiosk by design; 404 unknown name |
| `GET /api/bookings/:ref` | — | — | — | ✔ | — | ✔ | Public driver portal (by design) |
| `POST /api/bookings/create`, `/all` | ✔ | 🔴 | 🔴 | — | — | ✔ | Teammate; no auth |
| `* /api/incident/*` | ✔ | 🔴 | 🔴 | ✔ | — | ✔ | Teammate; no auth |
| `* /api/detection-alerts` | ✔ | 🔴 | 🔴 | ✔ | — | ✔ | Teammate; POST used by Python AI |
| `* /api/zones` | ✔ | 🔴 | 🔴 | ✔ | — | ✔ | Teammate; no auth |
| **Any unknown route** | — | — | — | ✔ | — | — | Global `notFound` → 404 JSON |
| **Any uncaught throw** | — | — | — | — | — | ✔ | Global `errorHandler` → safe 500 |

---

## D. Facial recognition error handling

| Case | Where handled | Behaviour |
|------|---------------|-----------|
| No camera permission | `FaceEnrollment`, `VPatrol`, `GateScanner` | Caught; friendly message ("Enable camera permissions…"), V-Patrol shows overlay + Retry |
| No webcam / `getUserMedia` unavailable | all three camera pages | Guarded before use; FaceEnrollment steers to manual upload; V-Patrol/GateScanner show "no camera" |
| Invalid image upload type | `FaceEnrollment.handleFileUpload` | Rejected; banner "Please upload an image file…"; state unchanged |
| Missing enrolment images | Frontend submit disabled until 3 angles; backend `POST /user/enroll-face` → **400** | Cannot submit; backend double-checks |
| No face detected | Python returns 400 → backend forwards **400** | Banner shows the AI message |
| AI service offline / connection refused | backend `enroll-face` catch → **503** | Banner: "Facial recognition service is offline. Please try again shortly." |
| Backend timeout / unexpected AI response | axios `timeout: 20000`; empty vector → **502** | Banner: "Unexpected response from facial recognition service." |
| Missing user ID | `requestedUserId` defaults to caller's own id; target lookup → **404** if absent | Safe 404 |
| User not found (re-enrol target) | backend → **404** "Target user not found." | Banner shows message |
| Duplicate enrolment | Not a conflict — re-enrol intentionally **overwrites** the vector (200) | Documented: no 409 by design |
| Live recognition AI fault (V-Patrol) | scan loop `try/catch`, logs only | No crash/blank; scanner keeps polling |

---

## E. RBAC error behaviour

- **401 = not logged in.** No `accessToken` → `ProtectedRoute` → `/error/401`; backend → `401`.
- **403 = logged in, insufficient role.** Role not in the route allow-list → `/error/403`;
  backend `requireRole`/inline checks → `403`.
- **404 = page/API not found.** SPA `*` → `NotFound`; backend `notFound` → `404` JSON.
- **500 = unexpected server/UI issue.** Backend `errorHandler` → safe `500` JSON;
  frontend `ErrorBoundary` → 500 fallback. No stack traces reach the user.

---

## F. Tests added or updated

**Frontend (Vitest) — `client/tests/Tan Xiu Li, Felicia/`**
- `error-handling.test.jsx` (**new**, 4): NotFound 404, SystemError 403 render, ErrorBoundary
  fallback on throw, ErrorBoundary passthrough.
- `RBAC.test.jsx` (existing, 10): unknown-role/logged-out → 401/403; sidebar visibility.

**Backend (Jest) — `server/tests/Tan Xiu Li, Felicia/`**
- `error-handling.test.js` (**new**, 3): unknown route → 404, thrown error → safe 500 (no leak),
  known route still 200.
- `user.test.js` (updated): added `enroll-face` → **503** when AI offline.
- `rbac.test.js` (existing, 6) + `security.test.js` (existing, 8): 401/403/400/404 paths.

Mapping to the requested cases:
- Unknown frontend route → 404 ✔ (`error-handling.test.jsx`)
- Logged-out dashboard → 401 block ✔ (`RBAC.test.jsx`)
- Wrong role → 403 ✔ (`RBAC.test.jsx`)
- Missing required backend fields → 400 ✔ (`security.test.js`, `user.test.js`)
- Missing record → 404 ✔ (`security.test.js`)
- Unauthorized API → 401 ✔ (`rbac.test.js`, `security.test.js`)
- Wrong-role API → 403 ✔ (`rbac.test.js`)
- AI failure → safe error ✔ (`user.test.js` 503)
- Server fallback route → 404 ✔ (`error-handling.test.js`)

---

## G. Commands run and results

```
cd server && npx jest      → Test Suites: 4 passed · Tests: 21 passed ✅
cd client && npx vitest run → Test Files: 5 passed · Tests: 27 passed ✅
cd client && npx vite build → ✓ built (build succeeds) ✅
```

---

## H. Remaining risks / not implemented

1. **Teammate APIs still unauthenticated** (`/api/incident/*`, `/api/zones/*`,
   `/api/detection-alerts` GET/PUT, `/api/bookings/create`+`/all`). Their input-validation 400s
   and DB 500s are fine, but they accept requests without a login (🔴 in §C). Left unchanged to
   avoid breaking those modules — needs cross-owner coordination.
2. **Some teammate routes leak `err.message`** in their 500s (e.g. `zones.js`,
   `detectionAlerts.js`). Only `user.js` was sanitised this pass; the same one-line fix should be
   applied to teammate routes when coordinated.
3. **Python AI service** returns `{"error": ...}` with HTTP 200 for a bad recognition image
   (rather than 400). The frontend handles it gracefully, but the status code is technically
   imprecise; not changed to keep the AI module stable.
4. **No global axios interceptor.** Each page handles its own API errors; behaviour is consistent
   but not centralised. A shared interceptor (e.g. auto-redirect to `/error/401` on any 401) is a
   future improvement.
5. **`POST /api/attendance/scan` remains public by design** (camera kiosk).

---

## I. Suggested git commit message

```
feat(errors): add error boundary, 404/500 fallbacks, resilient AI calls

- client: ErrorBoundary around routes (no more blank screens); fix SystemError 403 styling
- client: clear camera-failure UX in VPatrol/FaceEnrollment/GateScanner (no webcam / denied)
- server: errorHandlers middleware (404 JSON + safe 500, no stack/message leak), mounted last
- server: enroll-face → 503 when AI offline, 502 on bad AI response, 400 forwarded for no-face,
  20s timeout; sanitize user.js 500s to generic message + console.error
- tests: add frontend error-page/boundary tests + backend 404/500 + AI-offline tests
- docs: docs/error-handling-report.md

Preserves RBAC; teammate-owned APIs left untouched (documented as known risks).
```
