# Manual User Creation — Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Additive only. No tables dropped, no existing actions removed, invite-code onboarding kept,
no auth/RBAC core or AI logic changed.
**Date:** 2026-06-21

## What changed

Added a **role-gated manual user-creation** flow so FM and Tenant users can create accounts directly,
alongside the existing invite-code self-registration. Also aligned the V-Patrol / Gate Scanner page
container to match Camera Network.

## Role rules (enforced on the backend, mirrored in the UI)

| Creator | Can manually create | Cannot create |
|---------|---------------------|---------------|
| **FM** | **Tenant** | FM, Staff |
| **Tenant** | **Staff** (linked via `managerId`) | FM, Tenant |
| **Staff** | — | anything (403) |
| **Public** | — | anything (401) |

No one can create an **FM** account through this flow. If a request sends an explicit `role` that
doesn't match what the creator may make, it's rejected with 403 (tamper-safe).

## Backend routes added/changed

- **Added** `POST /user/manual-create` (in `server/routes/user.js`), protected by the existing
  `authenticateToken` middleware. Validates `name` + `email` + `password` (yup, ≥8 chars), enforces
  the role rules, hashes the password with bcrypt, sets `isActive: true`, and for Tenant-created Staff
  sets `managerId` = the Tenant's id (so they appear under **My Staff**). Returns a **sanitized user
  object (no password hash)**.
  - Errors: `400` validation / duplicate email (`SequelizeUniqueConstraintError`), `401` no token,
    `403` wrong role, `500` generic safe message (no stack trace). Matches the existing
    `{ errors: [...] }` style.
- **Unchanged:** `POST /register` (invite-code self-registration), login, suspend, delete, enroll-face,
  my-code, my-staff, generate-code. No model migration — `manual-create` reuses existing `users` columns.

## Frontend pages changed

- **User Management (`Users.jsx`):** FM-only **+ Add Tenant** button in the header → dark modal
  (name / email / temporary password) → `POST /user/manual-create` → closes, toasts, refreshes the
  list. Existing Logs / Face ID / Suspend / Delete actions untouched.
- **My Staff (`StaffManagement.jsx`):** Tenant-only **+ Add Staff** button → same modal → creates Staff
  → refreshes. Existing code generator + Logs/Remove actions untouched. Staff/FM do not see the button.
- **Tenant Onboarding (`TenantManagement.jsx`):** helper text updated to say the invite code is an
  **alternative** secure self-registration path (no longer claims accounts can't be created manually).
- **Shared CSS (`Dashboard.css`):** added scoped `.add-user-form` / `.add-user-btn` / `.add-user-error`
  styles (dark theme), reusing the shared `.modal-overlay` / `.modal-content` / `.cancel-btn`.
- **Layout (`VPatrol.css`):** `.vpatrol-main` / `.gate-main` padding `30px 16px → 30px` to match Camera
  Network's container spacing + left alignment; Gate grid `justify-content: center → flex-start`.
  Camera/timeline stay side-by-side on laptop and stack on ≤1024px (from the prior pass).

## Invite-code onboarding preserved

Confirmed. `POST /register` and both invite/code generators (`/user/invite-tenant`,
`/user/generate-code`) are unchanged. Manual creation is purely additive; the helper text now presents
the invite code as the alternative secure self-registration route.

## Files changed

| Area | File | Change |
|------|------|--------|
| Backend | `server/routes/user.js` | **Added** `POST /user/manual-create` (role-gated) |
| Backend tests | `server/tests/user.test.js` | +7 manual-create tests |
| Frontend | `client/src/pages/Users.jsx` | + Add Tenant button + modal (FM) |
| Frontend | `client/src/pages/StaffManagement.jsx` | + Add Staff button + modal (Tenant) |
| Frontend | `client/src/pages/TenantManagement.jsx` | invite helper text (text only) |
| Frontend CSS | `client/src/css/Dashboard.css` | scoped `.add-user-*` form styles |
| Frontend CSS | `client/src/css/VPatrol.css` | container padding + gate left-align |
| Frontend tests | `client/tests/Tan Xiu Li, Felicia/UserManagement.test.jsx` | +5 add-control tests |
| Docs | `docs/Tan Xiu Li, Felicia/user-management-manual-add-report.md` | this report |

## Tests / build results

```
cd server && npm test            → Test Suites: 5 passed · Tests: 43 passed ✅
cd client && npm test -- --run   → Test Files: 6 passed · Tests: 34 passed ✅
cd client && npm run build       → built successfully ✅
```

Backend manual-create coverage: FM→Tenant (no hash returned), Tenant→Staff (managerId set),
Tenant→Tenant blocked (403), FM→FM blocked (403), Staff blocked (403), duplicate email (400),
missing fields (400).

## Remaining risks

1. **No contact-number field** — the `users` model has no phone column, so it was omitted (the spec
   said "if existing model supports it"). Adding one later is a simple additive migration.
2. **Temporary password is admin-entered** (not auto-generated or force-reset on first login). A
   "must change password" flag is a sensible Phase 2 hardening.
3. **No email notification** to the new user (out of scope); they receive credentials out-of-band.
4. Manual-created Staff are linked by `managerId` (same mechanism as invite-code staff), so they show
   correctly under My Staff and respect existing tenant scoping.

## Suggested commit message

```
feat(users): role-gated manual user creation (additive)

- backend: POST /user/manual-create — FM->Tenant, Tenant->Staff (managerId),
  Staff/Public blocked, no FM creation; bcrypt hash, unique email, no hash in response
- frontend: + Add Tenant (User Management, FM) and + Add Staff (My Staff, Tenant) dark
  modals; refresh list on success; restricted roles see no add controls
- TenantManagement: invite code reframed as alternative self-registration (text only)
- VPatrol/Gate Scanner: match Camera Network container padding + left alignment
- tests: +7 backend (role rules, duplicate, no-hash), +5 frontend (button gating, modal)

Additive only; invite-code onboarding, existing User Management actions, auth/RBAC,
and AI logic all unchanged.
```
