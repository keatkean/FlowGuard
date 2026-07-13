# FlowGuard — Test Results Summary (Felicia)

Latest verified run on branch `feature/smart-logistics-whatsapp`.

## Backend — Jest
```bash
cd server
npm test
```
**Result:** ✅ **7 test suites passed, 79 tests passed.**

Covers: JWT/RBAC middleware, manual user creation role rules, face enrol (success / missing images /
AI-offline 503 / refresh), PDPA delete (vector wipe + log anonymise), security logs + FM review +
own-staff ownership, attendance role scoping (FM/Tenant/Staff), booking CRUD + validation + slot
conflict, WhatsApp mock vs real (endpoint/payload/phone-normalization/failure-safe), gate scan
entry/exit + next-in-line + FM-only, and the 404/500 fallback handlers.

## Frontend — Vitest
```bash
cd client
npm test -- --run
```
**Result:** ✅ **11 test files passed, 70 tests passed.**

Covers: ProtectedRoute + RBAC (role route guards + sidebar visibility + roleLabel), FaceEnrollment
(render / upload validation / submit / error / no-webcam), PasswordInput toggle, Users manual-add +
no-Re-enroll/no-Add-FM, Settings role-gated content, Attendance role-aware wording, Logistics
(filters, date filter, create modal, Staff create + no gate/status, gate-scan modal), DriverPass
(valid + `{booking}` envelope + 404 + missing-fields + QR fallback), and error pages / ErrorBoundary.

## Build — Vite
```bash
cd client
npm run build
```
**Result:** ✅ **Build succeeded.**

## Note on console output
Some tests log expected console warnings/errors (e.g. simulated WhatsApp "disabled" messages,
deliberate error-path logs, or React act warnings). These are **non-blocking** — every suite still
reports **passed**. The warnings are diagnostic output from code paths the tests intentionally
exercise, not test failures.
