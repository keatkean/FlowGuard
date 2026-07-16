# Group Rubric Evidence Map

## Module 1 - Facial Recognition & Access Management (Felicia)

Manual CRUD: FM manual user create (`POST /user/manual-create`), Face ID enrol/re-enrol (`POST /user/enroll-face`), user/security/attendance/evaluation reads, suspend/reactivate, security review updates and transactional user off-boarding (`DELETE /user/:id`).

Automatic processes: side-effect-free tracking, recognition with authoritative user status, Gate Scanner Attendance IN/OUT after final same-ID motion-liveness confirmation, V-Patrol access-event SecurityLog writes with Attendance unchanged, unknown/suspended SecurityLog handling and FM-only evaluation labels.

Limitations: motion liveness is head-turn verification, not complete anti-spoofing certification. Facial recognition does not create IncidentLog records.

## Module 2 - Object Detection & Space Management (Charlisa)

Actual CRUD: Camera, MonitoringZone and DetectionAlert workflows exist through current models/routes. Camera supports inventory fields including notes and zone association. MonitoringZone supports configurable classes, unattended thresholds, cooldown, severity, assigned team and detection enable/disable. DetectionAlert supports active alert records, severity/source/confidence/snapshot/device metadata and nullable camera/zone links.

Current YOLO workflow: object/person analysis can create DetectionAlert records for configured zones. DetectionAlert and IncidentLog are not database-linked; any incident seeding is an application workflow note only.

Limitations: no documented current PPE, spill, pest, environmental telemetry, HVAC, production robotics or people-counting implementation is claimed here.

## Module 3 - AI Helpdesk & Incident Support (Lucas / Gladwin)

Helpdesk behavior: ChatTranscript stores chat sessions and messages; unresolved chats can auto-escalate to SupportTicket. FM can read tickets, update status (`Pending`, `In Progress`, `Resolved`), add resolution notes and maintain KnowledgeBase entries.

Incident behavior: IncidentLog CRUD exists with camera location, status, person name, confidence score, severity, source, `resolutionStatus`, notes and paranoid soft-delete support.

Limitations: no autonomous final decision-making and no ticket archive flow is claimed.

## Module 4 - Smart Logistics & Loading-Bay Management (Felicia)

Manual CRUD: create/read/update bookings, public Driver Pass lookup, gate scan status updates and status-based logical cancellation (`status = Cancelled`).

Automatic processes: required-field validation, role/ownership enforcement, same-bay slot conflict detection, booking reference generation, Driver Pass link generation, mock-safe WhatsApp notification, arrival/completion timestamps, next-driver notification and cancellation notification.

Limitations: manual cancellation does not populate `deletedAt`; the model supports paranoid soft deletion but the current UI workflow uses status-based cancellation.
