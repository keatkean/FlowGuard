# Camera Inventory + Detection Setup — API & Data Model Reference

**Owner:** Tan Yu En, Charlisa · **Module:** Object Detection (Camera Inventory, Detection Setup,
Monitoring Zones, Detection Alerts) · **Date:** 2026-07-06

This is the full reference for every backend endpoint in this module: method, auth/role
requirement, request body, success response, and every error response. It also documents three
deliberate design decisions that aren't obvious from the code alone.

---

## A. Design decisions worth knowing before reading the code

1. **Detection Setup lives inside `MonitoringZone` — there is no separate `DetectionSetup` table.**
   A zone in this app has exactly one rule set (monitored classes, thresholds, severity, assigned
   team, enable/disable), so the setup fields were added as nullable/defaulted columns directly on
   `monitoring_zones` rather than introducing a second table with a `zone_id` FK. If a future
   requirement needs *multiple* configurations per zone, that's the point to split it out.
2. **Two unattended-threshold columns coexist on purpose.** `time_threshold` (INTEGER, minutes) is
   the original column — `ai-service/main.py::_refresh_zone_info` reads it via raw SQL and
   multiplies by 60. `unattended_threshold_seconds` (INTEGER, nullable) is the new Detection Setup
   field, in seconds. The AI engine now prefers `unattended_threshold_seconds` when it's set, and
   only falls back to `time_threshold * 60` when it isn't — so Detection Setup actually changes
   detection behavior, not just what's stored. See `_refresh_zone_info` for the exact precedence.
3. **Camera-to-zone mapping lives on `Camera.zone_id`, not on the zone.** Detection Setup's "map a
   camera to this zone" control calls `PUT /api/cameras/:id` with `{ zone_id }` — it does not add a
   camera field to `MonitoringZone`. `assigned_team` on `MonitoringZone` is a **free-text soft
   link** into the response-team directory (see §D), not a foreign key — matching the existing
   `SecurityLog.personnelName` soft-link convention already used elsewhere in this codebase.

---

## B. `/api/cameras` — Camera Inventory

All routes require a valid JWT (`Authorization: Bearer <token>`). Model: `server/models/Camera.js`.

| Method | Path | FM | Staff | Tenant | Unauthenticated |
|---|---|:--:|:--:|:--:|:--:|
| GET | `/api/cameras` | ✅ | ✅ | ❌ (403) | ❌ (401) |
| GET | `/api/cameras/:id` | ✅ | ✅ | ❌ (403) | ❌ (401) |
| POST | `/api/cameras` | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| PUT | `/api/cameras/:id` | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| DELETE | `/api/cameras/:id` | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `camera_code` | string | ✅ (create) | Must be unique — checked case-insensitively among non-deleted cameras. |
| `camera_name` | string | ✅ | |
| `location` | string | ✅ | Free-text location description. |
| `zone_id` | integer, nullable | – | Must reference an existing zone or is rejected. |
| `stream_url` | string, nullable | – | Video source URL/path. |
| `status` | enum | – | One of `Online`, `Offline`, `Maintenance`, `Disabled`. Defaults to `Online`. |
| `camera_type` | string, nullable | – | e.g. "Fixed", "PTZ", "Dome". |
| `last_active_at` | datetime | – | Server-set on create/update; not client-writable. |
| `notes` | text, nullable | – | |

### `POST /api/cameras` — create

Request:
```json
{ "camera_code": "CAM-07", "camera_name": "Dispatch Bay East", "location": "Zone G - Dispatch", "zone_id": 3, "status": "Online" }
```
Success `201`:
```json
{ "id": 12, "camera_code": "CAM-07", "camera_name": "Dispatch Bay East", "location": "Zone G - Dispatch", "zone_id": 3, "status": "Online", "stream_url": null, "camera_type": null, "notes": null, "last_active_at": "2026-07-06T04:00:00.000Z" }
```
Errors:
- `400 { "error": "camera_name is required." }` — also for missing `camera_code`/`location`, or `status` not in the allowed enum.
- `400 { "error": "Selected zone does not exist." }` — `zone_id` doesn't resolve to a zone.
- `409 { "error": "That camera code is already in use." }`
- `403 { "message": "Insufficient permissions for this resource." }` — Staff/Tenant.
- `401 { "message": "Access Denied. No security token provided." }` — no JWT.

### `PUT /api/cameras/:id` — update (partial)

Only supplied fields are validated/updated. `404 { "error": "Camera not found." }` if the id
doesn't exist. Same `400`/`409` shapes as create for whichever fields are supplied.

### `DELETE /api/cameras/:id` — deactivate

Sets `status: 'Disabled'`, then soft-deletes (paranoid `destroy`) — this is the "deactivate"
semantic. Success: `200` (no body). `404` if not found.

---

## C. `/api/zones` — Detection Setup (stored in `MonitoringZone`)

All routes require a JWT. Model: `server/models/MonitoringZone.js`.

| Method | Path | FM | Staff | Tenant | Unauthenticated |
|---|---|:--:|:--:|:--:|:--:|
| GET | `/api/zones` | ✅ | ✅ (view-only) | ❌ (403) | ❌ (401) |
| POST | `/api/zones` | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| PUT | `/api/zones/:id` | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| DELETE | `/api/zones/:id` | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |

### Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `zone_name` | string | ✅ | |
| `location` | string | ✅ | |
| `time_threshold` | integer (minutes) | ✅ | Must be `> 0`. Legacy field, still read by the AI engine as a fallback. |
| `monitored_classes` | array of strings | – | If supplied, must be non-empty — "monitored object class cannot be empty." Returned to the client as a parsed array (stored as JSON internally). |
| `density_threshold` | integer, nullable | – | Must be `> 0` if supplied. |
| `unattended_threshold_seconds` | integer, nullable | – | Must be `> 0` if supplied. Takes precedence over `time_threshold * 60` in the AI engine. |
| `alert_cooldown_seconds` | integer, nullable | – | Must be `> 0` if supplied. |
| `severity` | enum, nullable | – | One of `Low`, `Medium`, `High`, `Critical`. Defaults to `Medium`. |
| `assigned_team` | string, nullable | – | Free-text soft link into the response-team directory (see §D) — not a foreign key. |
| `detection_enabled` | boolean | – | Defaults to `true`. |

### `POST /api/zones` — create

Request:
```json
{ "zone_name": "Zone A - Loading Bay", "location": "Building 2, Dock 4", "time_threshold": 5,
  "monitored_classes": ["person", "backpack"], "density_threshold": 12,
  "unattended_threshold_seconds": 90, "alert_cooldown_seconds": 60, "severity": "High",
  "assigned_team": "Security Team Alpha", "detection_enabled": true }
```
Success `201` — same shape back, with `monitored_classes` as a parsed array.

Errors:
- `400 { "error": "zone_name, location, and time_threshold are required." }`
- `400 { "error": "time_threshold must be a positive number." }`
- `400 { "error": "density_threshold must be a positive number." }` (same pattern for the other two threshold fields)
- `400 { "error": "severity must be one of: Low, Medium, High, Critical." }`
- `400 { "error": "monitored_classes cannot be empty." }`
- `403` / `401` as above.

### `PUT /api/zones/:id`, `DELETE /api/zones/:id`

Same validation as create for whichever fields are supplied on `PUT`. `404` (empty body, matching
the pre-existing convention on this route) if the zone doesn't exist.

### Camera-to-zone mapping

There is no `camera_id` field on this resource. To map a camera into a zone, call
`PUT /api/cameras/:id` with `{ "zone_id": <zone id> }` (FM-only, same as any other camera update).

---

## D. Response-team directory — explicitly NOT persisted in the database

"Assigned team" on Detection Setup (`assigned_team`, a plain string) and the "Response Teams"
directory shown on the Detection Setup page are **two different things**:
- `assigned_team` is a DB column on `monitoring_zones` — saved, real, returned by the API.
- The Response Teams directory (name/team/contact records you add on the Detection Setup page) is
  **localStorage-only**, under the key `flowguard-response-teams`, per browser. This was an explicit
  scope decision (see plan §"Decisions confirmed with the user") — the spec allows a
  localStorage-only demo store when full DB persistence isn't part of the current pass, as long as
  it's documented. **It is not an API and has no backend route.** Refreshing in a different browser
  or clearing site data loses it.

---

## E. `/api/detection-alerts` — Detection Alerts

Model: `server/models/DetectionAlert.js`. This route has **two callers**: the Python AI engine
(server-to-server, no user session) and the FM/Staff frontend (JWT).

| Method | Path | Service key | FM | Staff | Tenant | Unauthenticated |
|---|---|:--:|:--:|:--:|:--:|:--:|
| GET | `/api/detection-alerts` | – | ✅ | ✅ | ❌ (403) | ❌ (401) |
| POST | `/api/detection-alerts` | ✅ | ✅ | ✅ | ❌ (403*) | ❌ (401*) |
| PUT | `/api/detection-alerts/:id` | – | ✅ | ✅ | ❌ (403) | ❌ (401) |

\* `POST` accepts **either** a valid `x-service-key` header **or** a logged-in FM/Staff JWT — see
`verifyServiceOrRole` in `server/middlewares/auth.js`. Without a matching key, it falls through to
normal JWT+role checks, so a request with neither gets `401`, and one with a Tenant JWT gets `403`.

### `POST /api/detection-alerts` — create (AI engine or manual)

The Python AI engine (`ai-service/main.py::_fire_alert`) posts here directly, authenticating with:
```
x-service-key: <AI_SERVICE_KEY>
```
`AI_SERVICE_KEY` must be identical in `server/.env` and `ai-service/.env` (see `.env.example` in
both folders) — one shared name, no alternate key name anywhere.

Request:
```json
{ "zone_name": "Zone A", "camera_location": "Webcam Feed", "status": "Active", "object_class": "backpack", "duration_seconds": 95, "person_name": null }
```
On create, the route **best-effort resolves** `zone_id` (by matching `zone_name` to a
`MonitoringZone`) and `camera_id` (by matching `camera_location` to a `Camera.camera_name` or
`Camera.location`) and stores them alongside the existing string fields — this is how "detection
alert references valid camera/zone where applicable" is satisfied without requiring the AI engine
to know a database camera ID. If no match is found, the alert is still created with
`camera_id`/`zone_id` left `null` — enrichment never blocks alert creation.

Success `201`:
```json
{ "id": 55, "zone_name": "Zone A", "camera_location": "Webcam Feed", "status": "Active", "object_class": "backpack", "duration_seconds": 95, "person_name": null, "camera_id": 3, "zone_id": 1 }
```
Errors: `400 { "error": "zone_name and camera_location are required." }`, `401`/`403` per the table
above.

### `PUT /api/detection-alerts/:id` — acknowledge / dispatch / clear

Request: `{ "status": "Acknowledged" | "Dispatched" | "Cleared" }`. `404` if not found.

---

## F. AI frame-analysis proxy paths (unauthenticated by design — existing, unchanged)

`/ai/api/yolo/people-count` and `/ai/api/yolo/analyze-frame` are dev-time proxy paths straight into
the Python `ai-service` (see `ai-service/main.py`). They carry no user auth today — this is an
existing characteristic of the local dev setup, not something this pass changed, and is flagged
here for completeness rather than newly introduced risk.

---

## G. Honest limitations (stock YOLO / single-source pipeline)

- The AI engine analyzes **one active source at a time** — either the browser webcam or one
  uploaded video file. Selecting a camera from inventory on the Object Detection page labels which
  camera/zone the *current* feed is meant to represent; it does **not** switch the underlying video
  source to that camera's actual stream. A multi-stream, per-camera-routed pipeline is future work.
- `ai-service/main.py::_refresh_zone_info`'s zone-selection query (`ORDER BY time_threshold ASC
  LIMIT 1`) picks the single lowest-threshold zone globally — it does not target "the zone the
  currently selected camera belongs to." This is a pre-existing simplification, left unchanged by
  this pass (only the threshold *value* resolution was changed — see §A.2).
- No fake camera inventory or fake bounding boxes are introduced anywhere in this pass — every
  camera shown comes from `/api/cameras`, and every detection box comes from a real YOLO inference
  call.
