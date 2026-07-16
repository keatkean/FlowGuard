# Week 13 Demo Script - Felicia Evidence

## Manual CRUD

1. Create an authorised user from User Management using `POST /user/manual-create`.
2. Enrol or re-enrol Face ID from Face Enrollment using `POST /user/enroll-face`; explain `faceVector`, `isEnrolled`, EvaluationParticipant label assignment and AI cache refresh.
3. Read users, security logs, attendance logs and evaluation participants from role-protected dashboards.
4. Suspend/reactivate a user and update Security Review notes/status.
5. Off-board a user with `DELETE /user/:id`; explain the transactional PDPA cleanup.
6. Create, read, update and cancel a Smart Logistics booking; show cancellation as `status = Cancelled`.

## Automatic Processes

1. Gate Scanner: tracking, first recognition, head-turn motion-liveness verification, final same-ID recognition, then Attendance IN/OUT.
2. V-Patrol: same scanner policy, then access-event SecurityLog only; Attendance remains unchanged.
3. Unknown/suspended/timeout/mismatch: fail closed and avoid false Attendance.
4. Logistics: booking_ref and Driver Pass creation, mock-safe WhatsApp notification, gate entry Arrived timestamp, gate exit Completed timestamp and next-driver notification.
5. Evaluation lab: internal FM validation with stable labels; no access grant and no image/vector storage.
