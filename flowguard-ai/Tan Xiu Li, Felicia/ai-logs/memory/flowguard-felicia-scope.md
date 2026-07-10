---
name: flowguard-felicia-scope
description: "Felicia's feature ownership and hard scope rules for the FlowGuard repo"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5a35ed4c-88a7-4a75-b20c-df57b52dfc47
---

The user (Felicia, Tan Xiu Li — NYP student) owns two FlowGuard features: **Facial Recognition & Access Management** (GateScanner, VPatrol, FaceEnrollment, attendance, security logs) and **Smart Logistics & Loading Bay Management** (bookings, driver pass, WhatsApp).

**Why:** Teammates own other modules; edits outside scope risk breaking their work and violate the group's boundaries.

**How to apply:**
- Never edit Object Detection (CameraFeed/ObjectDetection pages, YOLO code in `ai-service/main.py`), Incident Tracking, Helpdesk, Camera Inventory, or Charlisa/Gladwin/Lucas features unless a shared config absolutely requires it.
- Never touch real `.env` files — only `.env.example` with placeholders; no secrets in `VITE_` vars.
- Tests/docs go under `.../Tan Xiu Li, Felicia/` folders (client/tests, server/tests, docs).
- Privacy wording: "protected biometric template", "recognition result", "confidence", "attendance/security log" — never "raw vectors/embeddings".
- Pi Camera Module 3 is the primary gate camera (env `VITE_PI_CAMERA_*`, fallback 172.20.10.4:8081); laptop webcam is automatic fallback — preserve this in any camera change.
- As of 2026-07: recognition flows browser → Node `POST /api/facial-recognition/recognize` (FM JWT or x-edge-token) → FastAPI (X-AI-Service-Key) → Node resolves User by unique ID from PostgreSQL; `/api/attendance/scan` takes `{userId}` with `verifyServiceOrRole('FM')`. Frontend never calls FastAPI directly.
- Pre-existing client lint errors (React unused, Date.now purity, use-before-declare) are baseline — don't fix unless asked; verify no NEW lint issues via `git stash` comparison. `react-hooks/purity` flags direct `Date.now()` in component bodies — use `startTimer()` from `client/src/constants/scanControl.js` instead.
- Server-owned audit: `/api/attendance/scan` writes the safe "Gantry Access" SecurityLog (deduped via `server/services/securityAudit.js`); the browser never posts audit rows. Public `GET /api/bookings/:ref` returns a safe DTO (no tenantId/driver_phone/notes). Server binds `0.0.0.0` with `PORT || APP_PORT || 5001` (`server/config/serverConfig.js`).
