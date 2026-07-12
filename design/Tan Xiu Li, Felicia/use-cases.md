# Felicia Use Cases - Manual CRUD and Automatic Processes

## Facial Recognition & Access Management

### Manual CRUD

| Operation | Frontend | Endpoint | Entity / Fields | Evidence |
|---|---|---|---|---|
| Create authorised user | User Management / Tenant onboarding | `POST /user/manual-create` | `User` | FM manually creates authorised users. |
| Create or replace Face ID | Face Enrollment | `POST /user/enroll-face` | `users.faceVector`, `users.isEnrolled` | User/FM enrols or re-enrols three face orientations/uploaded images. |
| Read users and audit records | User Management, V-Patrol timeline, Security Review, Attendance, User Logs | `GET /user/`, `GET /api/security/logs`, `GET /api/security/logs/user/:id`, `GET /api/attendance/logs`, `GET /api/facial-recognition/evaluation-participants` | User, SecurityLog, Attendance, EvaluationParticipant | Role-protected reads. |
| Update Face ID or account status | Face Enrollment, User Management, Security Review | `POST /user/enroll-face`, `PUT /user/suspend/:id`, `PATCH /api/security/logs/:id/review` | User, SecurityLog | Re-enrolment overwrites the vector; suspension/reactivation changes account access; FM review updates status/notes. |
| Delete/off-board user | User Management | `DELETE /user/:id` | User plus linked operational records | Transactional PDPA workflow: wipe faceVector, set isEnrolled false, delete Attendance, anonymise SecurityLogs, clear matched user references, unlink Booking user references, retire EvaluationParticipant, delete User, refresh AI cache. |

### Automatic Processes

- Successful Face ID enrolment assigns a stable EvaluationParticipant label and refreshes the AI cache.
- Tracking: `POST /api/facial-recognition/track` is detector-only. It returns face presence, box, count and head-turn ratio with no identity/DB/Attendance/SecurityLog side effects.
- Recognition: `POST /api/facial-recognition/recognize` identifies candidates through the authoritative user ID/status in PostgreSQL.
- Gate Scanner performs tracking, initial recognition, baseline head-turn verification, final same-ID recognition, then `POST /api/attendance/scan` to create Attendance IN/OUT. It fails closed on timeout or mismatch.
- V-Patrol performs the scanner policy and then `POST /api/facial-recognition/access-event`. Attendance is unchanged.
- Unknown/suspended cases deny access and create the appropriate SecurityLog according to current route behavior with deduplication.
- The confusion matrix/evaluation feature is internal FM validation only. It does not grant access, compares evaluator-confirmed actual identity with AI prediction, uses stable P01/P02/P03 labels, stores evaluation metadata locally in the browser, and does not store images or embeddings.

## Smart Logistics & Loading-Bay Management

### Manual CRUD

| Operation | Frontend | Endpoint | Entity / Fields | Evidence |
|---|---|---|---|---|
| Create booking | Logistics & Bays | `POST /api/bookings/create` | Booking | FM/Tenant/Staff create delivery bookings subject to role and ownership rules. |
| Read booking data | Logistics & Bays, public Driver Pass | `GET /api/bookings/`, `GET /api/bookings/all`, `GET /api/bookings/:ref` | Booking | Public Driver Pass lookup is intentionally public by booking reference. |
| Update booking | Logistics & Bays, gate scan | `PATCH /api/bookings/:id`, `PATCH /api/bookings/:id/status`, `PATCH /api/bookings/:ref/gate-scan` | Booking status/timestamps/details | FM can gate scan; authorised users update permitted booking fields. |
| Delete/logical cancellation | Logistics & Bays | `PATCH /api/bookings/:id/cancel` | `status = Cancelled` | Manual cancellation is status-based logical cancellation, not Sequelize destroy/delete. |

### Automatic Processes

- On create: validate required fields, enforce role/ownership rules, detect same-bay slot conflicts, generate `booking_ref`, generate Driver Pass link and send mock-safe WhatsApp notification.
- On gate entry: look up booking reference, optionally compare observed plate, set `status = Arrived`, set `arrived_at`, send arrival notification.
- On gate exit: set `status = Completed`, set `completed_at`, locate next eligible booking in same bay and notify next driver.
- On cancellation: set `Cancelled` and send cancellation notification.
