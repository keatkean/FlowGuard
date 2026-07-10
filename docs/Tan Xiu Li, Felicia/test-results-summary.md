# FlowGuard — Test Results Summary (Felicia)

Latest verified run on branch `feature/smart-logistics-whatsapp` (2026-07-10).
These are the ONLY current totals — earlier snapshots (79/79, 70/70, 170/170, 150/150) are superseded.

## Backend — Jest
```bash
cd server
npm test
```
**Result:** ✅ **19 test suites passed, 214 tests passed.**

Covers: DB-backed `verifyToken` (deleted → 401, suspended → 403, tokenVersion revocation, DB role
authoritative), JWT/RBAC middleware, manual user creation role rules, face enrol permissions
(self / FM-any / Tenant-own-Staff / Staff-blocked, success / missing images / AI-offline 503 /
refresh), transactional PDPA off-boarding (vector wipe + attendance delete + log anonymisation +
booking unlink + row genuinely gone + tenant-with-staff 409), suspension permissions + session
revocation, change-password, forgot/reset password (generic response, SHA-256 token hash, 15-min
expiry, rate limit 429), security logs + FM review + own-staff ownership, attendance role scoping
and gate-scan toggling, recognition orchestration (DB-authoritative identity, dedup logs, no-face
→ no log), access-event audit-only route, booking CRUD + validation + slot conflict + edit + pass,
WhatsApp mock vs real, gate scan entry/exit + next-in-line + FM-only, CORS, and 404/500 fallbacks.

## Frontend — Vitest
```bash
cd client
npm test -- --run
```
**Result:** ✅ **25 test files passed, 206 tests passed.**

Covers: ProtectedRoute + RBAC, FaceEnrollment (Pi-primary probe, webcam fallback, manual source
switch, upload validation, submit, error), Facial Evaluation Lab (FM-only route, simulation banner,
all six scenarios, no real API calls from simulations, evaluation-record CRUD + localStorage
persistence, confusion-matrix counts/accuracy/macro-P/R/F1/FAR/FRR, zero-sample safety, CSV export,
no raw image/vector/template rendered or stored), face-box coordinate contract (clamping +
contain/cover projection), Pi camera helpers, GateScanner camera source, scan control, recognition
subject mapping, security timeline, Settings (role gating + change-password card), Users/Face ID
badges + API-base static checks, Attendance, Logistics (filters, create, edit, gate-scan),
DriverPass (+ fallback), PasswordInput, and error pages / ErrorBoundary.

## Build — Vite
```bash
cd client
npm run build
```
**Result:** ✅ **Build succeeded** (pre-existing >500 kB chunk-size warning only).

## Syntax / compile checks
```bash
node --check server/index.js        # ✅ passes
python -m py_compile ai-service/main.py   # ✅ passes
```

## Note on console output
Some tests log expected console warnings/errors (e.g. simulated WhatsApp "disabled" messages,
deliberate error-path logs, or React act warnings). These are **non-blocking** — every suite still
reports **passed**. The warnings are diagnostic output from code paths the tests intentionally
exercise, not test failures.
