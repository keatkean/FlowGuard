# FlowGuard - System Design

FlowGuard is an academic proof of concept with a React/Vite public and authenticated frontend, a Node.js/Express API, a PostgreSQL database managed through Sequelize, and a Python FastAPI AI service for facial recognition and object monitoring.

## Frontend

- Public pages: overview, capabilities, platform overview, contact, login/register and public Driver Pass.
- Authenticated pages: role dashboard, Gate Scanner, V-Patrol, Face Enrollment, Attendance, User Management, Security Review, Object Detection, Camera Inventory, Logistics, Incident Dashboard and Support Dashboard.
- Role protection is implemented through React `ProtectedRoute` and backend RBAC.

## Backend

- `/user`: authentication, manual user creation, face enrolment/re-enrolment, suspension/reactivation and user off-boarding.
- `/api/facial-recognition`: `/track`, `/recognize`, `/access-event`, `/evaluate`, and evaluation participant routes.
- `/api/attendance`: attendance summaries and `/scan` IN/OUT writes after Gate Scanner confirmation.
- `/api/bookings`: booking creation, reads, updates, status changes, gate scan and status-based cancellation.
- `/api/security`: security log reads and FM review updates.
- `/api/cameras`, `/api/zones`, `/api/detection-alerts`: camera inventory, monitoring zones and object alert workflows.
- `/api/support`: chat transcripts, support tickets and knowledge base.
- `/api/incidents`: incident dashboard CRUD and resolution notes.

## Database

Tables include `users`, `evaluation_participants`, `attendance`, `security_logs`, `bookings`, `invites`, `cameras`, `monitoring_zones`, `detection_alerts`, `incident_logs`, `chat_transcripts`, `support_tickets` and `knowledge_base`.

InsightFace generates 512-dimensional facial embeddings. PostgreSQL stores the enrolled template using the current `FLOAT[]` model field, while the Python AI service performs similarity matching. The project does not use pgvector.

## AI Architecture

- `/api/encode-faces`: enrolment encoding from captured/uploaded face images.
- `/user/track`: lightweight detector/keypoint endpoint for face presence, face box, face count and head-turn ratio.
- `/user/recognize`: full detection, embedding and identity match.
- `/refresh`: known-face cache refresh after enrolment or off-boarding.
- YOLO endpoints: object/person detection and alert emission for configured monitoring zones.

## Scanner Architecture

Camera preview -> lightweight tracking loop -> full identity recognition -> baseline motion-liveness challenge -> final same-identity confirmation -> Attendance or access-event write.

Gate Scanner writes Attendance IN/OUT through `/api/attendance/scan`. V-Patrol writes access-event SecurityLog records through `/api/facial-recognition/access-event` and does not change Attendance.

## Camera Source Parity

- Laptop webcam frames are captured in the browser.
- Raspberry Pi serves a latest-frame memory cache through snapshot/stream.
- Heavy InsightFace recognition remains on the laptop AI service.
- The Pi does not perform full facial recognition in the current PoC.

## External Integration

WhatsApp Cloud API is used for booking, Driver Pass, arrival/completion, cancellation and next-driver notifications. Local demonstration is mock-safe when credentials are not enabled.
