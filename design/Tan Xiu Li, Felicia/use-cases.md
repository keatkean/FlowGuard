# Use Cases — Felicia (Facial Recognition & Access Management + Smart Logistics)

Format for each: Actor · Trigger · Preconditions · Main flow · Alternate/edge flow · Outcome.

---

## A. Facial Recognition & Access Management

### UC-A1 Face enrolment
- **Actor:** New user (Tenant/Staff), or FM enrolling on their behalf.
- **Trigger:** User has `isEnrolled = false` and lands on the enrolment screen (or Settings → Re-enroll).
- **Preconditions:** Logged in; camera available or image files ready.
- **Main flow:** Capture front/left/right (or upload) → `POST /user/enroll-face` → AI (InsightFace)
  encodes → `faceVector` saved, `isEnrolled = true` → AI cache refreshed.
- **Alternate/edge:** No face detected → 400 + retry; camera denied/no webcam → switch to manual
  upload; AI offline → 503 "service offline", enrolment not saved.
- **Outcome:** User has a biometric profile usable at the gate.

### UC-A2 Face re-enrolment / update
- **Actor:** User (self) or FM.
- **Trigger:** Recognition becomes unreliable.
- **Preconditions:** Logged in; FM required to re-enrol another user.
- **Main flow:** Settings → Re-enroll → `POST /user/enroll-face` overwrites the existing vector →
  AI cache refreshed.
- **Alternate/edge:** Same failure handling as UC-A1.
- **Outcome:** Fresh `faceVector` replaces the old one.

### UC-A3 AI recognition at gate / V-Patrol
- **Actor:** Person at the gate; observed by FM.
- **Trigger:** A live frame is sent to the AI recognise endpoint.
- **Preconditions:** Enrolled vectors loaded in the AI service.
- **Main flow:** AI matches embedding → returns name/status/confidence/box → recognised person gets
  an IN/OUT attendance record and an "Access Granted" security log.
- **Alternate/edge:** No match above threshold → status DENIED.
- **Outcome:** Authorised entry logged automatically.

### UC-A4 Unauthorized face logging
- **Actor:** Unknown person; FM/security review later.
- **Trigger:** Recognition returns no confident match.
- **Main flow:** An intrusion/tailgating **security log** is created (severity non-safe) and shown
  on V-Patrol; it may also seed the incident dashboard.
- **Alternate/edge:** Invalid image → error, no log spam.
- **Outcome:** Unauthorized access is captured for review.

### UC-A5 FM security review
- **Actor:** Facilities Manager.
- **Trigger:** Non-safe security logs appear in the review queue.
- **Preconditions:** FM role.
- **Main flow:** Security Review page → filter by status → set `reviewStatus`
  (Pending Review / False Positive / Escalated / Resolved) + notes via `PATCH /api/security/logs/:id/review`.
- **Alternate/edge:** Non-FM blocked (403).
- **Outcome:** Each suspicious event is triaged with an audit trail.

### UC-A6 Off-boarding (PDPA delete)
- **Actor:** Facilities Manager.
- **Trigger:** A lease/employment ends.
- **Main flow:** `DELETE /user/:id` → wipe `faceVector`, delete attendance trail, anonymise security
  logs (`personnelName = null`), remove the user.
- **Alternate/edge:** Self-deletion blocked; Tenant may delete only their own staff.
- **Outcome:** No biometric-linked identity remains; audit events preserved anonymised.

### UC-A7 View own staff access logs (Tenant)
- **Actor:** Tenant.
- **Trigger:** Tenant clicks "Logs" for one of their staff.
- **Main flow:** `GET /api/security/logs/user/:id` — server confirms the target's `managerId` is the
  Tenant, then returns that person's access logs.
- **Alternate/edge:** Tenant requesting another tenant's staff → 403; Staff → 403; FM → any.
- **Outcome:** Tenants get visibility of their own unit only.

---

## B. Smart Logistics & Loading Bay Management

### UC-B1 Create a loading-bay booking
- **Actor:** FM, Tenant, or Staff.
- **Trigger:** A delivery needs a bay slot.
- **Preconditions:** Logged in (FM/Tenant/Staff).
- **Main flow:** + New Booking → `POST /api/bookings/create` → validate fields → generate
  `booking_ref`, status Pending, link `tenantId` (Tenant self / Staff → managerId) → WhatsApp
  driver-pass link sent (simulated if disabled).
- **Alternate/edge:** Missing/invalid fields → 400; overlapping slot for the same bay → 409.
- **Outcome:** A pending booking exists with a driver pass link.

### UC-B2 WhatsApp driver pass link
- **Actor:** System → Driver.
- **Trigger:** Booking created (and on status changes).
- **Main flow:** `whatsappService` sends a message containing the booking ref, company, plate, bay,
  slot, and the `/driver-pass/:ref` link.
- **Alternate/edge:** WhatsApp disabled → simulated result returned; send failure → non-fatal, the
  booking still succeeds.
- **Outcome:** Driver receives (or the system simulates) the pass link.

### UC-B3 Driver opens the QR pass
- **Actor:** Driver (public, no login).
- **Trigger:** Driver opens `/driver-pass/:ref`.
- **Main flow:** Page fetches `GET /api/bookings/:ref` and shows details + a QR encoding the booking
  ref; status badge shown.
- **Alternate/edge:** Unknown ref → clean "Pass not found"; Cancelled/Completed → warning banner;
  QR component unavailable → "use booking reference at gate" fallback (no crash).
- **Outcome:** Driver has a scannable entry pass on their phone.

### UC-B4 FM gate scan — entry
- **Actor:** Facilities Manager.
- **Trigger:** Driver arrives at the bay.
- **Preconditions:** FM role.
- **Main flow:** Gate Scan → enter booking ref (+ optional observed plate) →
  `PATCH /api/bookings/:ref/gate-scan {action:"entry"}` → status Arrived → WhatsApp arrival note.
- **Alternate/edge:** Cancelled/Completed booking → 409; plate mismatch → flagged (warn, not block);
  Tenant/Staff → 403.
- **Outcome:** Arrival recorded.

### UC-B5 FM gate scan — exit + next-in-line
- **Actor:** Facilities Manager.
- **Trigger:** Vehicle leaves the bay.
- **Main flow:** Gate Scan → `{action:"exit"}` → status Completed → find next non-cancelled booking
  for the same bay → WhatsApp "you may proceed" to that driver.
- **Alternate/edge:** Already Completed → idempotent, no duplicate; Cancelled → 409.
- **Outcome:** Bay freed and the next driver is invited immediately.

### UC-B6 Cancel a booking
- **Actor:** FM or the owning Tenant.
- **Trigger:** Delivery no longer needed.
- **Main flow:** Cancel → `PATCH /api/bookings/:id/cancel` → status Cancelled (soft delete) →
  WhatsApp cancellation note.
- **Alternate/edge:** Non-owner Tenant / Staff → 403.
- **Outcome:** Booking cancelled but retained for audit.

### UC-B7 RBAC restrictions (logistics)
- **Actor:** Tenant / Staff.
- **Trigger:** They attempt a facility-level action.
- **Main flow:** Gate Scan and Mark Arrived/Completed are FM-only — the controls are hidden and the
  backend returns 403.
- **Outcome:** Staff/Tenant can book and view their unit, but cannot control the gate.
