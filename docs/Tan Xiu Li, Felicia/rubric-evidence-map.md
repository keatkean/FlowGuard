# Felicia Rubric Evidence Map

## Manual CRUD Evidence

### Facial Recognition & Access Management

- Create: `POST /user/manual-create` creates authorised users; `POST /user/enroll-face` creates/replaces Face ID templates in `users.faceVector` and sets `users.isEnrolled`.
- Read: `GET /user/`, `GET /api/security/logs`, `GET /api/security/logs/user/:id`, `GET /api/attendance/logs`, `GET /api/facial-recognition/evaluation-participants`.
- Update: `POST /user/enroll-face`, `PUT /user/suspend/:id`, `PATCH /api/security/logs/:id/review`.
- Delete: `DELETE /user/:id` runs the transactional PDPA workflow: wipe vector, set unenrolled, delete Attendance, anonymise SecurityLogs, clear matched references, unlink Booking user references, retire EvaluationParticipant, delete User and refresh AI cache.

### Smart Logistics & Loading-Bay Management

- Create: `POST /api/bookings/create`.
- Read: `GET /api/bookings/`, `GET /api/bookings/all`, `GET /api/bookings/:ref`.
- Update: `PATCH /api/bookings/:id`, `PATCH /api/bookings/:id/status`, `PATCH /api/bookings/:ref/gate-scan`.
- Delete/logical cancellation: `PATCH /api/bookings/:id/cancel`, which sets `status = Cancelled`.

## Automatic Process Evidence

- Tracking: `POST /api/facial-recognition/track` is detector-only and side-effect-free.
- Recognition: `POST /api/facial-recognition/recognize` resolves active/enrolled/suspended/unknown status from PostgreSQL and writes SecurityLogs only for route-defined cases.
- Gate Scanner: tracking, recognition, baseline head-turn verification, final same-ID recognition, `POST /api/attendance/scan`, fail-closed behavior.
- V-Patrol: same scanner policy, `POST /api/facial-recognition/access-event`, Attendance unchanged.
- Evaluation: internal FM validation, P01/P02/P03 stable labels, browser-local evaluation metadata, no image/vector storage.
- Logistics: slot conflict checking, booking_ref and Driver Pass generation, WhatsApp mock-safe notification, arrival/completion timestamps, next-driver notification and cancellation notification.
