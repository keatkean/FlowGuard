# FlowGuard — AI Usage Summary (Felicia)

An honest summary of how AI assistants were used while building my modules
(Facial Recognition & Access Management + Smart Logistics & Loading Bay).

## What AI helped with
- **Planning & design:** shaping RBAC rules (FM/Tenant/Staff/Public), the booking/gate-scan flow,
  and the facial enrolment → recognition → review pipeline.
- **Coding assistance:** scaffolding React pages/components, Express routes, Sequelize model fields,
  the WhatsApp service, the Driver Pass QR page, and the gate-scan endpoint.
- **Debugging:** fixing the Driver Pass route/param mismatch, the `react-qr-code` CJS/ESM interop
  crash, the dark date-picker icon, and CSS class mismatches.
- **Testing:** drafting Jest/Vitest tests for RBAC, face enrol, bookings, gate scan, WhatsApp mock,
  and role-aware UI.
- **Documentation:** these Mermaid diagrams, API/schema docs, use cases, and rubric evidence.

## What I did (human review)
- Reviewed, edited, and accepted/rejected each suggestion; adjusted RBAC decisions (e.g. Staff = a
  factory worker, so Staff are blocked from AI/security pages and gate control, but may create
  bookings for their unit).
- Ran the app locally, tested flows by hand (enrol, recognise, book, gate scan, driver pass), and
  ran the automated suites before committing.
- Verified security choices: bcrypt hashing, JWT/RBAC, PDPA off-boarding, ownership checks, and that
  WhatsApp/DB credentials come from environment variables only.
- Made the final Git commits with meaningful messages.

## Secrets & safety
- **No secrets committed.** All credentials are placeholders in `.env.example`; real values live in
  gitignored `.env` files. WhatsApp real-send is env-gated and off by default; tokens/phones are
  masked in logs.

## References
- Raw AI conversation logs: `flowguard-ai/Tan Xiu Li, Felicia/ai-logs/` (`.jsonl` files + `logs_link.md`).
- Detailed reflection: `flowguard-ai/Tan Xiu Li, Felicia/ai-reflection.md`.
- Per-change reports: `docs/Tan Xiu Li, Felicia/*.md` (each feature/fix documents what AI helped with,
  what I reviewed, and how I verified it).
