# AI Reflection — Object Detection Module (Charlisa)

This module was built with the help of Claude Code. Raw prompt logs are in
[`ai-logs/`](./ai-logs/). My individual scope covers the full object-detection surface, not just
the YOLO dashboard: Camera Inventory, Detection Setup, Monitoring Zones, detection thresholds,
alert lifecycle, camera health, and FM/Staff role-based access across all of it.

## What AI helped with
- Auditing the existing pages (`ObjectDetection.jsx`, `Cameras.jsx`, `CameraInventory.jsx`,
  `DetectionSettings.jsx`) against my corrected individual scope, and finding that Camera
  Inventory and the live camera wall were **100% frontend mock state** — no backend model, no
  route, nothing survived a page refresh.
- Designing and building the new `Camera` Sequelize model + `/api/cameras` CRUD route (FM
  create/edit/deactivate, Staff view-only, validation, duplicate-code `409`).
- Extending `MonitoringZone` in place with the Detection Setup fields (`monitored_classes`,
  `density_threshold`, `unattended_threshold_seconds`, `alert_cooldown_seconds`, `severity`,
  `assigned_team`, `detection_enabled`) rather than introducing a parallel table.
- Closing a real, already-documented security gap: `/api/zones` and `/api/detection-alerts` had
  **zero authentication** before this pass (flagged in `docs/rbac-access-control-report.md` as a
  known risk). Added `verifyToken`/`requireRole`, plus a `verifyServiceOrRole` middleware so the
  Python AI engine can still post alerts server-to-server via a shared `AI_SERVICE_KEY`.
- Wiring `unattended_threshold_seconds` into `ai-service/main.py::_refresh_zone_info` so Detection
  Setup's threshold actually changes detection behavior (with a fallback to the legacy
  minutes-based `time_threshold` for zones that haven't set the new field).
- Rewiring `CameraInventory.jsx`, `Cameras.jsx`, and `DetectionSettings.jsx` off mock arrays and
  onto the real APIs, with loading/empty/offline states and Staff-vs-FM read-only UI.
- Writing the backend Jest tests, the API/DB documentation, and this reflection.

## What I manually reviewed
- **Scope boundary.** Before any code changed, I confirmed with the assistant exactly which files
  were mine (Camera/MonitoringZone/DetectionAlert models, cameras/zones/detectionAlerts routes, the
  four camera/detection pages, and the AI engine's alert-posting + threshold functions) and which
  were explicitly off-limits (Felicia's Face Enrollment, Gate Scanner, Attendance, Security Review,
  User/Tenant Management, and `incident.js`/`IncidentLog`). I checked the diff against this list
  before accepting it.
- **Real vs. fake data.** I checked that the new Camera Inventory and Object Detection camera
  picker are backed by the actual `/api/cameras` endpoint — no hardcoded camera arrays remain in
  either page, and no bounding boxes are synthesized (they still come from real YOLO inference).
- **The two-threshold decision.** I deliberately kept `time_threshold` (minutes, legacy, read by
  the AI engine) and `unattended_threshold_seconds` (seconds, new, Detection-Setup-facing) as
  separate columns rather than reinterpreting the old one, then confirmed the AI engine's fallback
  logic actually prefers the new field when it's set.
- **Auth gap closure.** I traced that the Python AI engine's `_fire_alert` was the only caller of
  `POST /api/detection-alerts`, so adding role enforcement there needed a service-key bypass rather
  than a JWT — I verified all three call sites in `main.py` go through the same `_fire_alert`
  function, so one header addition covers every alert path.

## What code I accepted / rejected / adjusted
- **Accepted:** extending `MonitoringZone` in place (no new `DetectionSetup` table) — the app's
  detection rules are genuinely one-per-zone, so a second table would have been unused complexity.
- **Adjusted:** the original plan considered keeping `time_threshold`'s minutes-only semantics and
  only documenting the seconds conversion. After review, I asked for the AI engine to actually
  consume the new seconds field (with a documented fallback) so Detection Setup isn't cosmetic.
- **Rejected:** a fuller rewrite of the AI engine's per-camera stream routing. The stock pipeline
  only supports one active video source; pretending the camera picker on Object Detection switches
  real streams would have been dishonest. I kept the picker as a labeling control and documented
  the limitation instead of overselling the integration.
- **Added beyond the original request:** a double-click delete confirmation on Camera Inventory.
  Deletion is now a real, persisted deactivation (previously it just mutated in-memory mock state),
  so an accidental click has real consequences — worth the small addition.

## How I verified correctness
- `cd server && npx jest` → all 7 suites / 59 tests pass, including the 3 new suites under
  `server/tests/Tan Yu En, Charlisa/` (`cameras.test.js`, `detection-setup.test.js`,
  `detection-alerts.test.js`) and the pre-existing suites (RBAC, security, error-handling, user)
  unchanged.
- `cd client && npx vite build` → clean production build, no compile errors, after each of the
  three page rewrites.
- Manual reasoning check on the RBAC matrix: unauthenticated → 401, Staff on FM-only camera/zone
  writes → 403, Staff on GET → 200, FM on everything → 200 — cross-checked against the actual
  `requireRole` calls in each route file, not just the test file's assertions.

## Limitations / risks (documented, not hidden)
- **Single-source YOLO pipeline.** The AI engine still analyzes one active source (browser camera
  or one uploaded file) at a time. The Object Detection camera picker labels which inventory
  camera the current feed represents; it does not yet route each camera's real stream into
  detection. A multi-stream, per-camera pipeline is future work.
- **Zone auto-selection is still global.** `_refresh_zone_info`'s `ORDER BY time_threshold ASC
  LIMIT 1` picks one zone process-wide, not "the zone belonging to the selected camera." Only the
  threshold *value* resolution was changed in this pass — the zone-selection query itself is a
  pre-existing simplification I chose not to touch, to avoid destabilizing the live detection loop
  for a change outside this pass's scope.
- **Response Teams is still localStorage-only**, per an explicit, documented scope decision (see
  `docs/camera-inventory-detection-setup-api.md` §D) — not a DB-backed API. Assigned-team text on a
  zone is a soft link into that directory, not a foreign key.
- **Camera-code uniqueness is app-level, not a DB constraint.** Case-insensitive duplicate checking
  happens in the route (`findCameraByCode`), not a Postgres unique index — acceptable for this
  scale, but a race between two simultaneous creates could theoretically both pass the check.
