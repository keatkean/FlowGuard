# Change Report — Facial Recognition & Access Management (Felicia)

**Branch:** `feature/facial-recognition-access`
**Module owner:** Tan Xiu Li, Felicia
**Date:** 2026-06-21

---

## A. Summary of what was changed

The Facial Recognition & Access Management module was already broad (webcam + upload
enrolment, live recognition, user management, security logs). This pass closed the gaps
that the rubric cares about:

1. **Route protection** — most facial/access pages were *public*. They are now wrapped in
   `ProtectedRoute`, and FM-only pages are restricted to the FM role.
2. **Manual FM review workflow (the missing "manual task")** — security logs now carry a
   `reviewStatus` (Pending Review / False Positive / Escalated / Resolved) + `reviewNotes`,
   with a new FM-only **Security Review** page and a backend endpoint to action them.
3. **API security** — every `/api/security/*` route now requires a valid JWT (previously
   anyone could read personnel logs or post fake events).
4. **PDPA-compliant off-boarding** — deleting a user now explicitly wipes the biometric
   vector and **anonymises** the related security logs (keeps the audit event, strips the
   name) instead of leaving identity data behind.
5. **Documentation accuracy** — the code stores face embeddings as `FLOAT[]`, not
   `pgvector`. README and the DB schema were corrected.
6. **Tests** — meaningful Vitest + Jest tests added under the student folders; build verified.

No teammate modules (Smart Traffic, WhatsApp, loading bay, logistics, object-detection)
were modified.

---

## B. Files changed (grouped)

### Frontend (`client/`)
| File | Change |
|------|--------|
| `src/components/ProtectedRoute.jsx` | Added `allowedRoles` array support (back-compatible with `requiredRole`). |
| `src/App.jsx` | Moved facial/access routes from public → protected; registered `/security-review`. |
| `src/pages/SecurityReview.jsx` | **NEW** — FM-only manual review queue (filter, status dropdown, notes, save). |
| `src/components/Sidebar.jsx` | Added FM "Security Review" nav link. |

### Backend (`server/`)
| File | Change |
|------|--------|
| `models/SecurityLogs.js` | Added `reviewStatus`, `reviewNotes`, `reviewedBy`, `reviewedAt`. |
| `routes/security.js` | `router.use(verifyToken)`; auto review-status on create; `?status`/`?limit` filtering; new `PATCH /logs/:id/review` (FM-only). |
| `routes/user.js` | DELETE now nulls `faceVector`, anonymises security logs by name (PDPA). |

### Tests
| File | Change |
|------|--------|
| `client/tests/Tan Xiu Li, Felicia/FaceEnrollment.test.jsx` | **NEW** — render, upload validation, submit endpoint, error surfacing, missing-images guard. |
| `client/tests/Tan Xiu Li, Felicia/ProtectedRoute.test.jsx` | **NEW** — unauth + non-FM blocking, role allow-list. |
| `server/tests/Tan Xiu Li, Felicia/security.test.js` | **NEW** — auth, auto status, FM-only review, validation. |
| `server/tests/user.test.js` | Updated DELETE test to assert biometric wipe + log anonymisation. |

### Docs
| File | Change |
|------|--------|
| `README.md` | `pgvector` claim → accurate `FLOAT[]` + optional-pgvector fallback wording. |
| `design/Tan Xiu Li, Felicia/database-schema.md` | `faceVector` type fixed; review fields + PDPA note added. |
| `design/Tan Xiu Li, Felicia/api-documentation.md` | Security routes marked 🔒; review endpoint + PDPA delete documented. |
| `flowguard-ai/Tan Xiu Li, Felicia/ai-reflection.md` | Filled in (was empty). |
| `docs/felicia-facial-recognition-change-report.md` | **NEW** — this report. |

---

## C. CRUD mapping

| CRUD | Capability | Where |
|------|-----------|-------|
| **Create** | Face enrolment (webcam + manual upload), 3-angle vector | `FaceEnrollment.jsx` → `POST /user/enroll-face` → Python `/api/encode-faces` |
| **Create** | Automatic access/security logs on recognition | `VPatrol.jsx` → `POST /api/security/logs` (Access Granted / Intrusion) |
| **Read** | Live V-Patrol dashboard + security timeline | `VPatrol.jsx` → `GET /api/security/logs` |
| **Read** | Per-personnel access history | `UserLogs.jsx` → `GET /api/security/logs/user/:id` |
| **Read** | Personnel list + enrolment/active status | `Users.jsx` → `GET /user/` |
| **Read** | Unauthorized/intrusion logs + review queue | `SecurityReview.jsx` → `GET /api/security/logs?status=` |
| **Update** | Re-enrol / overwrite face scan | `Users.jsx` → `FaceEnrollment` (re-enroll mode) → `POST /user/enroll-face` |
| **Update** | Access level / status (Active ↔ Suspended) | `Users.jsx` → `PUT /user/suspend/:id` |
| **Update** | FM review of suspicious logs + resolution notes | `SecurityReview.jsx` → `PATCH /api/security/logs/:id/review` |
| **Delete** | Off-board user safely (PDPA) | `Users.jsx` → `DELETE /user/:id` (wipes vector, anonymises logs) |

---

## D. Automatic vs manual workflow

| Type | Trigger | Behaviour |
|------|---------|-----------|
| **Automatic** | AI recognition on the V-Patrol gantry | On a verified match → `Gantry Access` log (`severity: safe`, auto `Resolved`). On an unknown face → `Intrusion Alert` (`severity: critical`, auto `Pending Review`). Gate Scanner auto clock-in/out via `POST /api/attendance/scan`. |
| **Manual** | FM staff on the Security Review page | FM filters the queue, sets `reviewStatus` (Pending Review / False Positive / Escalated / Resolved) and writes resolution notes; saved via `PATCH /api/security/logs/:id/review` with `reviewedBy` + `reviewedAt` stamped server-side. |

---

## E. Assignment rubric mapping

| Rubric item | How it is met |
|-------------|----------------|
| **Full-stack feature** | React UI ↔ Express/Sequelize API ↔ PostgreSQL ↔ Python InsightFace AI service. |
| **CRUD** | Full Create/Read/Update/Delete across enrolment, logs, access status, and off-boarding (table in §C). |
| **Enhanced capability** | Webcam **and** manual-upload enrolment, 3-angle averaged embedding, head-turn liveness, automatic logging, FM manual-review triage workflow. |
| **Security** | JWT on all user/security/attendance routes; role-gated routes (`ProtectedRoute` + server-side `req.user.role` checks); FM-only review/management; reCAPTCHA on login/register; bcrypt; timing-safe login. |
| **Usability** | Guided 3-step enrolment, live HUD feedback, audio cues, toast notifications, confirmation modals, status badges, review filter. |
| **Performance** | Frames downscaled to ~420px + JPEG q0.3 before AI calls; scan throttling/locking; capped log queries (`limit≤200`); embeddings cached in-memory in the AI service. |
| **Testing** | 13 frontend (Vitest) + 11 backend (Jest) tests, all passing; build verified. |
| **AI usage documentation** | `flowguard-ai/Tan Xiu Li, Felicia/ai-logs/` + `ai-reflection.md` + this report. |

---

## F. API endpoints added / changed

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| `PATCH` | `/api/security/logs/:id/review` | **Added** | FM-only; updates `reviewStatus` + `reviewNotes`. |
| `GET` | `/api/security/logs` | Changed | Now requires JWT; supports `?status=` and `?limit=`. |
| `POST` | `/api/security/logs` | Changed | Now requires JWT; auto-sets `reviewStatus` by severity. |
| `GET` | `/api/security/logs/personnel/:name`, `/logs/user/:id` | Changed | Now require JWT. |
| `DELETE` | `/user/:id` | Changed | PDPA: wipes `faceVector`, anonymises security logs. |

(Enrolment `POST /user/enroll-face`, recognition `POST /user/recognize`, and
`POST /api/attendance/scan` are unchanged.)

---

## G. Database / model changes

`security_logs` table (Sequelize `SecurityLog`) gained:
- `reviewStatus` VARCHAR NOT NULL default `'Pending Review'`
- `reviewNotes` TEXT nullable
- `reviewedBy` VARCHAR nullable
- `reviewedAt` TIMESTAMP nullable

`users.faceVector` is confirmed/documented as `FLOAT[]` (`ARRAY(FLOAT)`), **not** pgvector.
The server still attempts `CREATE EXTENSION vector` and auto-falls back to `FLOAT[]`.

> Migration note: the app uses `sequelize.sync({ alter: true })`, so the new columns are
> added automatically on next server start. No manual SQL required.

---

## H. Tests added / changed

- **Frontend (Vitest):** `FaceEnrollment.test.jsx` (5 tests) + `ProtectedRoute.test.jsx`
  (5 tests), under `client/tests/Tan Xiu Li, Felicia/`. Existing
  `src/pages/__tests__/FaceEnrollment.test.jsx` retained.
- **Backend (Jest):** `security.test.js` (8 tests) under `server/tests/Tan Xiu Li, Felicia/`;
  `user.test.js` updated to assert biometric wipe + log anonymisation on delete.

---

## I. Commands run and results

```
# Backend
cd server && npx jest
→ Test Suites: 2 passed, 2 total · Tests: 11 passed, 11 total ✅

# Frontend tests
cd client && npx vitest run
→ Test Files: 3 passed (3) · Tests: 13 passed (13) ✅

# Frontend build
cd client && npx vite build
→ ✓ built in ~1.1s (148 modules) ✅
```

---

## J. Known issues / remaining risks

- **Logs link by name, not FK.** Security logs reference `personnelName` (string), so
  anonymisation matches on name and two staff with identical names would both be anonymised.
  A real `userId` FK with `ON DELETE SET NULL` is the proper fix.
- **Dev proxy port.** `client/vite.config.js` proxies `/user` and `/api` to a fixed port
  (currently `5001`/`5000`); the backend `.env` `APP_PORT` must match or calls 404 in dev.
- **Liveness is basic.** Head-turn ratio only — not real anti-spoofing; acceptable for a PoC.
- **CORS is open (`origin: '*'`)** for local/phone testing; tighten before any real deploy.
- **`/gate-scanner` requires login.** If a true unattended kiosk is wanted later, give it a
  dedicated kiosk token instead of a user session.

---

## K. Recommended next steps before merging

1. Run all three services and smoke-test enrolment → recognition → review → off-board.
2. Confirm `.env` `APP_PORT` matches the Vite proxy target.
3. Seed an FM account (`node seed.js`) and verify FM-only pages redirect non-FM users.
4. Squash/clean commit history on the feature branch, then open a PR into `main`.

---

## L. Suggested git commit message

```
feat(facial-access): protect routes, add FM review workflow, PDPA off-boarding

- ProtectedRoute: support allowedRoles; lock down /vpatrol, /attendance, /staff,
  /tenant-management, /user-logs, /gate-scanner, /security-review
- security logs: require JWT, add reviewStatus/reviewNotes, FM-only review endpoint
  and Security Review page (Pending/False Positive/Escalated/Resolved)
- DELETE /user/:id: wipe faceVector + anonymise security logs (PDPA data minimisation)
- docs: correct pgvector->FLOAT[] in README & schema; add API + AI reflection
- tests: add Vitest + Jest coverage under student folders (13 + 11 passing)
```
