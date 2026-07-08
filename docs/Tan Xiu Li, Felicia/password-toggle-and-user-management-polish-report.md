# Password Toggle & User Management Polish — Report

**Branch:** `feature/smart-logistics-whatsapp`
**Scope:** Two small, safe frontend UI improvements. No backend/API, auth/RBAC, password hashing, or
validation logic changed.
**Date:** 2026-06-21

## What changed

1. **Removed the duplicate "Re-enroll My Face ID" button from User Management.** Face ID
   re-enrolment already lives on the Settings page, so the User Management header now shows only the
   **+ Add Tenant** button (FM). The now-unused `handleSelfReEnroll` helper in `Users.jsx` was removed.
2. **Added a reusable show/hide password toggle** (`PasswordInput`) and applied it to every password
   field in the app.

## Files changed

| Area | File | Change |
|------|------|--------|
| Frontend | `client/src/components/PasswordInput.jsx` | **NEW** — reusable input + eye toggle |
| Frontend | `client/src/components/PasswordInput.css` | **NEW** — scoped dark-theme toggle styles |
| Frontend | `client/src/pages/Login.jsx` | Use `PasswordInput` for the Access Key field |
| Frontend | `client/src/pages/Register.jsx` | Use `PasswordInput` for the Create Access Key field |
| Frontend | `client/src/pages/Users.jsx` | Removed Re-enroll button + unused handler; Add Tenant modal uses `PasswordInput` |
| Frontend | `client/src/pages/StaffManagement.jsx` | Add Staff modal uses `PasswordInput` |
| Frontend tests | `client/tests/Tan Xiu Li, Felicia/PasswordInput.test.jsx` | **NEW** — toggle behaviour |
| Docs | `docs/Tan Xiu Li, Felicia/password-toggle-and-user-management-polish-report.md` | This report |

No `server/` files touched.

## Re-enroll button — removed only from User Management
Confirmed. The `self-enroll-btn` / "Re-enroll My Face ID" button and its `handleSelfReEnroll` handler
were removed **only** from `Users.jsx`. The per-row **Face ID** action (re-enrol for a specific user)
and Logs / Suspend / Delete actions remain. The user table is unchanged.

## Settings Re-enroll button — still present
Confirmed. `Settings.jsx` still renders **"Re-enroll My Face ID"** (`handleSelfReEnroll` →
`/enrollment`). No Face ID functionality was removed from Settings.

## Password validation / auth logic — unchanged
`PasswordInput` only swaps the input's `type` between `password` and `text` in local component state.
It spreads all props (`value`, `onChange`, `name`, `placeholder`, `required`, `minLength`…) straight
onto the underlying `<input>`, so existing controlled-input handlers and HTML validation (`required`,
`minLength="8"`) behave exactly as before. No Formik/Yup logic, no backend validation, and no password
hashing were modified. Password values are never logged or exposed anywhere new.

## Password fields now with show/hide toggle
- Login → Access Key
- Register → Create Access Key
- User Management → Add Tenant modal → Temporary Password
- My Staff → Add Staff modal → Temporary Password

(Forgot Key page has no password field — email only — so nothing to add there.)

## Accessibility / safety of the toggle
- `type="button"` → never submits the form.
- `aria-label` switches between "Show password" / "Hide password" (+ `aria-pressed`).
- Keyboard-focusable with a visible focus ring; dark-theme styling; input gets right padding so text
  never overlaps the eye button. Default state is **hidden** (`type=password`).

## Test / build results
```
cd client && npm test -- --run   → Test Files: 7 passed · Tests: 38 passed ✅
cd client && npm run build       → built successfully ✅
```
Backend not touched → `server` tests not run.

PasswordInput coverage: starts as `password`, toggle → `text`, toggle again → `password`, button is
`type=button`, and props (name/required) forward to the input.

## Suggested commit message
```
feat(ui): reusable password show/hide toggle; drop duplicate Re-enroll button

- add PasswordInput component (eye toggle, type=button, aria-label, dark theme)
- use it on Login, Register, Add Tenant modal, Add Staff modal
- Users: remove duplicate "Re-enroll My Face ID" header button (+ unused handler);
  keep + Add Tenant, table, and Logs/Face ID/Suspend/Delete row actions
- Settings Re-enroll button unchanged

Frontend-only; no backend/API/RBAC/validation/hashing changes.
```

---

## Follow-up: dark theme for dashboard modal inputs (2026-06-21)

**Decision kept:** "+ Add Tenant" stays on **User Management** (manual account creation/management),
and **Tenant Onboarding** stays as the **invite-code self-registration** page. That separation is
intentional and unchanged.

**What changed**
- The **Add Tenant** and **Add Staff** modal fields now render in the dark FlowGuard theme reliably
  (dark background, light text, dark border, blue focus ring).
- `PasswordInput` gained a `variant="dark"` option. Passing it adds a `password-field--dark` class
  that explicitly styles the input **and** the eye/toggle button for dark dashboard modals (higher
  specificity, so it no longer depends on cross-file cascade order). Used **only** in the Add Tenant
  and Add Staff modals.
- Added `:-webkit-autofill` overrides for the dashboard-modal inputs so browser autofill no longer
  forces them white/yellow — the most common cause of the "white field" look.

**Login / Register unchanged**
They use `PasswordInput` **without** `variant`, so they keep their existing light auth styling
(`.input-group input` from `Login.css`). No autofill override was applied to auth inputs.

**Files changed (follow-up)**
- `client/src/components/PasswordInput.jsx` — added `variant` prop → `password-field--dark`.
- `client/src/components/PasswordInput.css` — `.password-field--dark` input/toggle/autofill styles.
- `client/src/css/Dashboard.css` — `.add-user-form input` autofill (dark) override.
- `client/src/pages/Users.jsx` — Add Tenant modal `PasswordInput variant="dark"`.
- `client/src/pages/StaffManagement.jsx` — Add Staff modal `PasswordInput variant="dark"`.

**No backend / auth / RBAC / validation / hashing changes.** CSS + one prop only; form behaviour
identical. Modals remain responsive.

**Test / build results (follow-up)**
```
cd client && npm test -- --run   → Test Files: 7 passed · Tests: 38 passed ✅
cd client && npm run build       → built successfully ✅
```
