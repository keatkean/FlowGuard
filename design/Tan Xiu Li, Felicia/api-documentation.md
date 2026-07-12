# Felicia API Documentation - Actual Merged Repository

## Facial Recognition & Access Management

### Manual CRUD Endpoints

- `POST /user/manual-create` - FM creates an authorised user.
- `POST /user/enroll-face` - enrols or re-enrols Face ID, stores `users.faceVector` as `FLOAT[]`, sets `users.isEnrolled`, assigns/keeps an EvaluationParticipant label and refreshes the AI cache.
- `GET /user/` - role-protected user list.
- `GET /api/security/logs` - security review list.
- `GET /api/security/logs/user/:id` - user-scoped security logs.
- `GET /api/attendance/logs` - attendance summaries/logs by role.
- `GET /api/facial-recognition/evaluation-participants` - FM list of stable evaluation labels.
- `PUT /user/suspend/:id` - suspend/reactivate user access.
- `PATCH /api/security/logs/:id/review` - update review status and notes.
- `DELETE /user/:id` - transactional PDPA off-boarding.

### Automatic Scanner Endpoints

- `POST /api/facial-recognition/track` - detector-only face presence/box/count/head-turn ratio; no identity or persistent writes.
- `POST /api/facial-recognition/recognize` - full recognition, authoritative user resolution and SecurityLog creation for unknown/suspended/stale cases according to current route behavior.
- `POST /api/attendance/scan` - Gate Scanner writes Attendance IN/OUT after final same-ID confirmation.
- `POST /api/facial-recognition/access-event` - V-Patrol records a safe access SecurityLog and does not alter Attendance.
- `POST /api/facial-recognition/evaluate` - FM validation endpoint; side-effect-free for production users, attendance and security logs.

## Smart Logistics & Loading-Bay Management

### Manual CRUD Endpoints

- `POST /api/bookings/create` - create Booking and Driver Pass reference.
- `GET /api/bookings/` - read accessible bookings.
- `GET /api/bookings/all` - FM read where applicable.
- `GET /api/bookings/:ref` - public Driver Pass lookup by booking reference.
- `PATCH /api/bookings/:id` - update permitted booking details.
- `PATCH /api/bookings/:id/status` - update booking status where authorised.
- `PATCH /api/bookings/:ref/gate-scan` - FM gate entry/exit workflow.
- `PATCH /api/bookings/:id/cancel` - logical cancellation through `status = Cancelled` and cancellation notification.

### Automatic Processes

Booking creation validates input, applies ownership rules, checks same-bay slot conflicts, generates `booking_ref`, creates a Driver Pass link and sends WhatsApp in simulated or real mode. Gate entry sets Arrived/`arrived_at`; gate exit sets Completed/`completed_at`, finds the next eligible same-bay booking and notifies the next driver.
