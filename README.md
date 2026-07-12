# FlowGuard

FlowGuard is an academic proof of concept for AI-assisted asset, access and manpower monitoring in industrial operations. It combines facial access management, camera-based object monitoring, loading-bay coordination and operational support in one integrated demo repository.

FlowGuard is not documented here as a live production deployment. Targets from the original problem statement are treated as project goals, not measured outcomes.

## Implemented Modules

### Facial Recognition & Access Management

- Face ID enrolment/re-enrolment with InsightFace embeddings.
- Gate Scanner with tracking, motion-liveness head-turn verification, final same-ID recognition and Attendance IN/OUT writes.
- V-Patrol access-event logging without Attendance changes.
- Security Review, User Logs, suspension/reactivation and privacy-conscious off-boarding.
- EvaluationParticipant labels for internal FM validation.

### Object Detection & Space Management

- Camera inventory.
- Monitoring zone setup.
- Configurable monitored classes, unattended-object thresholds, cooldown, severity and detection enable/disable.
- DetectionAlert review/status workflow.

Current documentation does not claim PPE, spill, pest, HVAC, robotics or environmental telemetry as implemented features.

### Smart Logistics & Loading-Bay Management

- Booking creation with role/ownership checks and same-bay slot conflict detection.
- Bay A / Bay B scheduling, booking reference and public Driver Pass.
- Gate arrival/completion workflow with `arrived_at` and `completed_at` timestamps.
- WhatsApp Cloud API integration with mock-safe local demonstration.
- Next-driver notification after completion.
- Cancellation is status-based logical cancellation: `status = Cancelled`. The Booking model supports paranoid soft deletion, but the manual Cancel workflow does not call destroy/delete.

### AI Helpdesk & Incident Support

- Chat transcripts.
- Unresolved-request escalation to support tickets.
- Knowledge base CRUD.
- Incident dashboard CRUD and resolution notes.

## Technology Stack

- Frontend: React, Vite.
- Backend: Node.js, Express.
- Database: PostgreSQL, Sequelize.
- AI: Python, FastAPI, InsightFace, Ultralytics YOLO, OpenCV, ONNX Runtime / NumPy.
- Hardware: Raspberry Pi Camera integration.
- External integration: WhatsApp Cloud API, mock-safe for local demonstration.

InsightFace generates 512-dimensional facial embeddings. PostgreSQL stores the enrolled template using the current `FLOAT[]` model field, while the Python AI service performs similarity matching. The project does not use pgvector.

## Facial Tracking and Liveness Architecture

Camera preview -> lightweight tracking loop -> full identity recognition -> baseline motion-liveness challenge -> final same-identity confirmation -> Attendance or access-event write.

- Laptop webcam frames are captured in the browser.
- Raspberry Pi serves a latest-frame memory cache through snapshot/stream.
- Heavy InsightFace recognition remains on the laptop AI service.
- The Pi does not perform full facial recognition in the current PoC.

## Public and Authenticated Surfaces

Public pages describe the academic PoC and do not expose operational data. Authenticated routes show role-protected operational records. The public Driver Pass route is intentionally public by booking reference.

## Local Development

Install dependencies in each tier as needed:

```bash
cd client
npm install
npm run dev
```

```bash
cd server
npm install
npm start
```

```bash
cd ai-service
python -m pip install -r requirements.txt
python main.py
```

Secrets and service credentials belong in environment variables. Do not commit API keys, database credentials, route secrets, enrolled users, facial images, embeddings, phone numbers or internal telemetry.

## Verification

Current verification results are recorded in `docs/Tan Xiu Li, Felicia/test-results-summary.md` after each run. Historical totals have been removed so the README does not imply stale pass counts.
