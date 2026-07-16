# FlowGuard — Object Detection & SecurePi Integration API Documentation

**Scope:** Camera Inventory, Monitoring Zones (Detection Setup), Detection Alerts,
SecurePi edge-ingest, and the Object Detection page's supporting AI-service calls.

**Derived from source code on:** 2026-07-11, branch `feature/object-detection-space`.
All endpoints below were confirmed to exist in the current implementation — nothing
here is inferred from filenames alone. Where behaviour had to be inferred from
non-obvious code paths, it is explicitly marked **(Inferred)**.

---

## 1. System Overview

Three separate runtimes are involved in this feature, and only one of them is the
"FlowGuard backend" that owns JSON REST endpoints:

| System | Technology | Port (dev) | Role |
|---|---|---|---|
| **FlowGuard Backend** | Node.js / Express / Sequelize | 5001 | Owns Camera Inventory, Monitoring Zones, Detection Alerts. Source of truth in Postgres. |
| **FlowGuard AI Service** | Python / FastAPI | 8501 | Runs YOLO inference on browser-camera/uploaded-video frames for the *browser camera* and *upload video* modes on the Object Detection page. Proxied by Vite dev server at `/ai/*` → `http://localhost:8501/*`. |
| **SecurePi Edge Node** | Python, runs on Raspberry Pi | 8001 (stream), calls out to backend | Independent process (`edge/securepi/securepi_edge.py`). Streams MJPEG video directly to the browser and POSTs detection alerts to the FlowGuard backend over the LAN/hotspot. |

The Object Detection page (`client/src/pages/ObjectDetection.jsx`) talks to **all
three**: it reads/writes Camera/Zone/Alert data on the Node backend, it optionally
calls the AI Service directly for browser-camera inference, and it optionally loads
the SecurePi MJPEG stream/health check directly from the Pi's IP (bypassing the
Node backend entirely for those two calls).

---

## 2. Endpoint Summary

| Method | Endpoint | Purpose | Authentication | Used By |
|--------|----------|---------|----------------|---------|
| GET | `/api/zones` | List monitoring zones (Detection Setup) | JWT (FM, Staff) | Object Detection, Detection Setup |
| POST | `/api/zones` | Create a monitoring zone | JWT (FM only) | Detection Setup |
| PUT | `/api/zones/:id` | Update a monitoring zone | JWT (FM only) | Detection Setup |
| DELETE | `/api/zones/:id` | Delete a monitoring zone | JWT (FM only) | Detection Setup |
| GET | `/api/cameras` | List cameras (with zone) | JWT (FM, Staff) | Object Detection, Camera Inventory |
| GET | `/api/cameras/:id` | Get one camera | JWT (FM, Staff) | Camera Inventory |
| POST | `/api/cameras` | Create a camera | JWT (FM only) | Camera Inventory |
| PUT | `/api/cameras/:id` | Update a camera | JWT (FM only) | Camera Inventory |
| DELETE | `/api/cameras/:id` | Deactivate + soft-delete a camera | JWT (FM only) | Camera Inventory |
| GET | `/api/detection-alerts` | List latest 50 detection alerts | JWT (FM, Staff) | Object Detection |
| POST | `/api/detection-alerts` | Create a detection alert | JWT (FM, Staff) **or** `x-service-key` (AI engine) | AI engine (Python YOLO service-to-service); manual test alerts by FM/Staff |
| PUT | `/api/detection-alerts/:id` | Update alert status (Acknowledge / Investigate / Escalate / Clear) | JWT (FM, Staff) | Object Detection (incident action buttons) |
| POST | `/api/edge/detection-alerts` | SecurePi edge-device alert ingest | Bearer token (`EDGE_INGEST_TOKEN`) | SecurePi edge node (`securepi_edge.py`) |
| GET | `/ai/api/yolo/people-count` *(AI Service, not Node backend)* | Poll current people count from the AI service's background YOLO loop | None | Object Detection (5s poll) |
| POST | `/ai/api/yolo/analyze-frame` *(AI Service, not Node backend)* | Analyze one browser/upload frame and return detections | None | Object Detection (browser camera / uploaded video modes) |
| GET | `http://<pi-ip>:8001/health` *(SecurePi device, not a FlowGuard endpoint)* | Health probe of the SecurePi stream server | None | Object Detection (SecurePi hardware mode, 10s poll) |
| GET | `http://<pi-ip>:8001/video_feed` *(SecurePi device, not a FlowGuard endpoint)* | MJPEG live video stream | None | Object Detection (SecurePi hardware mode, `<img>` tag) |

> `POST /api/detection-alerts` is implemented and tested but is **not called from the
> Object Detection page's UI**. It exists for the AI engine (server-to-server) and for
> a manual FM/Staff test-alert flow. See §3.6 for the mismatch note.

---

## 3. FlowGuard Backend Endpoints (Node.js / Express)

Mounted in `server/index.js`:
```js
app.use("/api/zones", require('./routes/zones'));
app.use("/api/cameras", require('./routes/cameras'));
app.use("/api/detection-alerts", require('./routes/detectionAlerts'));
app.use("/api/edge", require('./routes/edgeDetectionAlerts'));   // → /api/edge/detection-alerts
```

All JWT-protected routes require:
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```
`verifyToken` (`server/middlewares/auth.js`) decodes the JWT with `APP_SECRET`, then
re-reads the `User` row from the database on every request — a suspended/deleted
account or a stale `tokenVersion` (password reset, forced logout) is rejected even
if the JWT itself hasn't expired.

### 3.1 GET `/api/zones`

| | |
|---|---|
| **Purpose** | List all monitoring zones (Detection Setup records), most recent first. |
| **Auth** | JWT required |
| **Roles** | FM, Staff (403 for Tenant; 401 unauthenticated) |
| **Headers** | `Authorization: Bearer <token>` |
| **Path params** | none |
| **Query params** | none |
| **Body** | none |
| **Source** | `server/routes/zones.js:51-58` |

**Example request**
```
GET /api/zones
Authorization: Bearer <accessToken>
```

**Success — 200**
```json
[
  {
    "id": 3,
    "zone_name": "Loading Bay",
    "location": "Warehouse East",
    "time_threshold": 5,
    "monitored_classes": ["backpack", "suitcase", "person"],
    "density_threshold": 12,
    "unattended_threshold_seconds": 60,
    "alert_cooldown_seconds": 30,
    "severity": "High",
    "assigned_team": "Response Team A",
    "detection_enabled": true,
    "createdAt": "2026-07-01T02:00:00.000Z",
    "updatedAt": "2026-07-10T09:00:00.000Z"
  }
]
```
`monitored_classes` is stored as a JSON string column and parsed back into an array
by `serializeZone()` before it is returned.

**Errors**
| Status | Cause |
|---|---|
| 401 | Missing/invalid/expired token, revoked session, suspended/deleted account |
| 403 | Valid token but role is not FM/Staff |
| 500 | Database error |

---

### 3.2 POST `/api/zones`

| | |
|---|---|
| **Purpose** | Create a monitoring zone / Detection Setup rule set. |
| **Auth** | JWT required |
| **Roles** | FM only (403 for Staff/Tenant) |
| **Headers** | `Authorization: Bearer <token>`, `Content-Type: application/json` |
| **Source** | `server/routes/zones.js:60-93` |

**Request-body fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone_name` | string | Yes | |
| `location` | string | Yes | |
| `time_threshold` | number | Yes | Positive integer; legacy unattended-object threshold in **minutes** |
| `density_threshold` | number \| null | No | Positive integer if provided |
| `unattended_threshold_seconds` | number \| null | No | Positive integer if provided; overrides `time_threshold` for the AI engine when set |
| `alert_cooldown_seconds` | number \| null | No | Positive integer if provided |
| `severity` | string | No | One of `Low`, `Medium`, `High`, `Critical` (default `Medium`) |
| `assigned_team` | string \| null | No | Free-text soft link, not a foreign key |
| `detection_enabled` | boolean | No | Coerced with `Boolean()` |
| `monitored_classes` | array or comma-separated string | No | Cannot be an empty array if the field is supplied at all |

**Example request**
```
POST /api/zones
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "zone_name": "Loading Bay",
  "location": "Warehouse East",
  "time_threshold": 5,
  "unattended_threshold_seconds": 60,
  "severity": "High",
  "monitored_classes": ["backpack", "suitcase", "person"],
  "detection_enabled": true
}
```

**Success — 201** (same shape as §3.1 list item)

**Errors**
| Status | Cause |
|---|---|
| 400 | `zone_name`/`location`/`time_threshold` missing; any threshold not a positive number; invalid `severity`; empty `monitored_classes` array |
| 401 / 403 | See §3.1 |
| 500 | Database error |

---

### 3.3 PUT `/api/zones/:id`

| | |
|---|---|
| **Purpose** | Update a monitoring zone's Detection Setup fields (partial update — only supplied fields change). |
| **Auth / Roles** | JWT, FM only |
| **Path params** | `id` — zone's numeric primary key |
| **Body fields** | Same as §3.2, all optional; validated the same way when present |
| **Source** | `server/routes/zones.js:95-127` |

**Success — 200**: updated zone object. **Errors:** 400 (validation, same rules as
POST), 401, 403, 404 (`sendStatus(404)` with empty body — no JSON `error` field),
500.

---

### 3.4 DELETE `/api/zones/:id`

| | |
|---|---|
| **Purpose** | Permanently remove a monitoring zone (hard `destroy()` — the model is `paranoid: true` so this is a soft-delete at the DB level, but the route does not restore it). |
| **Auth / Roles** | JWT, FM only |
| **Source** | `server/routes/zones.js:129-138` |

**Success — 200**: empty body (`res.sendStatus(200)`). **Errors:** 401, 403, 404
(empty body), 500.

---

### 3.5 Camera Inventory — `/api/cameras`

Model: `server/models/Camera.js`. All routes require a JWT (`router.use(verifyToken)`
at `server/routes/cameras.js:12`).

#### GET `/api/cameras`
- **Roles:** FM, Staff.
- Returns all cameras, newest first, each with its `zone` (via `include`).
- **Success 200** example:
```json
[
  {
    "id": 5,
    "camera_code": "CAM-05",
    "camera_name": "Loading Bay Camera 01",
    "location": "Warehouse East",
    "zone_id": 3,
    "stream_url": "http://172.20.10.5:8001/video_feed",
    "status": "Online",
    "camera_type": "Fixed",
    "last_active_at": "2026-07-11T09:55:00.000Z",
    "notes": null,
    "zone": { "id": 3, "zone_name": "Loading Bay", "...": "..." }
  }
]
```
- **Errors:** 401, 403, 500.

#### GET `/api/cameras/:id`
- **Roles:** FM, Staff. **Path param:** `id`.
- **Success 200:** single camera with `zone`. **Errors:** 401, 403, 404
  (`{ "error": "Camera not found." }`), 500.

#### POST `/api/cameras`
- **Roles:** FM only.

| Field | Type | Required | Validation |
|---|---|---|---|
| `camera_code` | string | Yes | Non-empty after trim; must be unique (case-insensitive) → 409 on duplicate |
| `camera_name` | string | Yes | Non-empty after trim |
| `location` | string | Yes | Non-empty after trim |
| `zone_id` | number \| null | No | Must reference an existing zone if provided |
| `stream_url` | string \| null | No | No format validation server-side (the frontend enforces `http(s)://` for custom sources) |
| `status` | string | No | One of `Online`, `Offline`, `Maintenance`, `Disabled` (default `Online`) |
| `camera_type` | string \| null | No | |
| `notes` | string \| null | No | |

**Example request**
```
POST /api/cameras
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "camera_code": "CAM-05",
  "camera_name": "Loading Bay Camera 01",
  "location": "Warehouse East",
  "zone_id": 3,
  "stream_url": "http://172.20.10.5:8001/video_feed",
  "status": "Online"
}
```
**Success — 201:** created camera object (`last_active_at` set to now).
**Errors:** 400 (missing required field, invalid `status`, `zone_id` not found),
401, 403, 409 (duplicate `camera_code`), 500.

#### PUT `/api/cameras/:id`
- **Roles:** FM only. Partial update; same field validation as POST when a field is
  supplied. **Errors:** 400, 401, 403, 404 (`{ "error": "Camera not found." }`),
  409 (duplicate code, excluding the camera being edited), 500.

#### DELETE `/api/cameras/:id`
- **Roles:** FM only. Sets `status: 'Disabled'` then calls `destroy()` (soft-delete,
  `paranoid: true`). **Success — 200:** empty body. **Errors:** 401, 403, 404
  (`{ "error": "Camera not found." }`), 500.

---

### 3.6 Detection Alerts — `/api/detection-alerts`

Model: `server/models/DetectionAlert.js`. Source: `server/routes/detectionAlerts.js`.

#### GET `/api/detection-alerts`
| | |
|---|---|
| **Purpose** | List the 50 most recent detection alerts, newest first. |
| **Auth / Roles** | JWT, FM or Staff |
| **Query params** | `status` (optional) — filters to an exact status match |
| **Source** | lines 43-56 |

**Example request**
```
GET /api/detection-alerts?status=Active
Authorization: Bearer <accessToken>
```

**Success — 200**
```json
[
  {
    "id": 42,
    "zone_name": "Loading Bay",
    "camera_location": "Loading Bay Camera 01",
    "status": "Active",
    "object_class": "backpack",
    "duration_seconds": 65,
    "person_name": null,
    "alert_type": "Unattended Object",
    "severity": "High",
    "source": "SecurePi Edge Node",
    "confidence": 0.87,
    "snapshot_url": "alerts/loading-bay/event.jpg",
    "device_id": "securepi-loading-bay-01",
    "occurred_at": "2026-07-11T10:00:00.000Z",
    "camera_id": 5,
    "zone_id": 3,
    "createdAt": "2026-07-11T10:00:02.000Z",
    "updatedAt": "2026-07-11T10:00:02.000Z"
  }
]
```
**Errors:** 401, 403, 500.

#### POST `/api/detection-alerts`
| | |
|---|---|
| **Purpose** | Create a detection alert. Intended for the Python AI engine to post detections server-to-server; also usable by a logged-in FM/Staff user for a manual test alert. |
| **Auth** | `verifyServiceOrRole('FM','Staff')` — **either** header `x-service-key: <AI_SERVICE_KEY>` **or** a valid FM/Staff JWT |
| **Headers** | `x-service-key: <value>` **or** `Authorization: Bearer <token>`; `Content-Type: application/json` |
| **Source** | lines 81-146 |

**Not currently called from the Object Detection page's frontend code** — no button
or effect in `ObjectDetection.jsx` issues a `POST` to this URL. It is exercised only
by the AI engine and by the backend's own test suite
(`server/tests/Tan Yu En, Charlisa/detection-alerts.test.js`).

**Request-body fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone_name` | string | Yes | |
| `camera_location` | string | Yes | |
| `status` | string | No | One of `Active`, `Acknowledged`, `Investigating`, `Dispatched`, `Escalated`, `Cleared` (default `Active`) |
| `object_class` | string | No | |
| `duration_seconds` | number | No | Non-negative integer or `null` |
| `person_name` | string | No | |
| `alert_type` | string | No | |
| `severity` | string | No | One of `Low`, `Medium`, `High`, `Critical` (default `High`) |
| `source` | string | No | Defaults to `"Object Detection"` |
| `confidence` | number | No | Clamped into `[0, 1]` |
| `snapshot_url` / `snapshot_path` | string | No | Either key accepted; `snapshot_path` is a fallback alias |
| `device_id` | string | No | |
| `timestamp` / `occurred_at` | string (ISO date) | No | Either key accepted; invalid dates become `null` |

**Success — 201:** created alert object. As a side effect, the route also
fire-and-forgets a matching `IncidentLog.create()` row (status
`UNATTENDED_OBJECT`, source `Object Detection`) so the alert also appears on the
Incident Dashboard — this does not block or affect the 201 response even if it
fails.

**Errors:** 400 (`zone_name`/`camera_location` missing, invalid `status`, invalid
`severity`), 401 (no service key and no/invalid JWT), 403 (JWT valid but role not
FM/Staff), 500.

#### PUT `/api/detection-alerts/:id`

| | |
|---|---|
| **Purpose** | Update an alert's status — this is the endpoint behind the Object Detection page's Acknowledge / Mark Investigating / Escalate / Mark Resolved-Cleared buttons. |
| **Auth / Roles** | JWT, FM or Staff |
| **Path params** | `id` — alert's numeric primary key |
| **Source** | lines 148-160 |

**Request-body fields**

| Field | Type | Required | Validation |
|---|---|---|---|
| `status` | string | Yes (effectively — sent by every UI action) | Must be one of `Active`, `Acknowledged`, `Investigating`, `Dispatched`, `Escalated`, `Cleared` if provided |

**Example request**
```
PUT /api/detection-alerts/42
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "status": "Acknowledged" }
```

**Success — 200:** updated alert object.
**Errors:** 400 (invalid `status` value), 401, 403 (Tenant role), 404 (`sendStatus`,
no JSON body), 500.

> **Frontend↔backend behaviour note (inferred):** `handleAcknowledgeAlert`,
> `handleInvestigateAlert`, `handleEscalateAlert`, and `handleClearAlert` in
> `ObjectDetection.jsx` (lines 302-331) all funnel into this single PUT endpoint with
> different `status` values — there is no dedicated "acknowledge"/"escalate" route.

---

### 3.7 SecurePi Edge Ingest — POST `/api/edge/detection-alerts`

This is the endpoint the Raspberry Pi SecurePi node calls to report an unattended
object. It is a distinct route from §3.6's `/api/detection-alerts` and uses a
different authentication mechanism (a static bearer token instead of a user JWT or
service key).

**Mounting.** In `server/index.js`:
```js
const edgeDetectionAlertsRoute = require('./routes/edgeDetectionAlerts');
app.use("/api/edge", edgeDetectionAlertsRoute);
```
and inside `server/routes/edgeDetectionAlerts.js`:
```js
router.post('/detection-alerts', verifyEdgeIngestToken, async (req, res) => { ... });
```
so the full path is `/api/edge` + `/detection-alerts` = **`/api/edge/detection-alerts`**.

**Authentication.** A hand-rolled middleware (`verifyEdgeIngestToken`, lines 35-45)
— *not* the shared `verifyToken`/`requireRole` middleware used elsewhere:
- Reads `Authorization: Bearer <token>`.
- If `process.env.EDGE_INGEST_TOKEN` is unset on the server → **503** (edge ingest
  not configured), even before checking the caller's token.
- If the token is missing or does not exactly match `EDGE_INGEST_TOKEN` → **401**.
- Otherwise → `next()`.

There is no role concept here (no FM/Staff/Tenant) — it is a single shared secret
for the trusted device, stored in `EDGE_INGEST_TOKEN` (see `server/.env.example`
and `edge/securepi/.env.example`).

| | |
|---|---|
| **Method** | POST |
| **Full route** | `/api/edge/detection-alerts` |
| **Purpose** | Accept an unattended-object alert pushed by the SecurePi edge node and persist it as a `DetectionAlert` row. |
| **Auth type** | Static bearer token (`EDGE_INGEST_TOKEN`), not a user JWT |
| **Authorised roles** | N/A — device-level trust, no user role check |
| **Required headers** | `Authorization: Bearer <EDGE_INGEST_TOKEN>`, `Content-Type: application/json` |
| **Path params** | none |
| **Query params** | none |
| **Source** | `server/routes/edgeDetectionAlerts.js` |

**Request-body fields**

| Field | Type | Required | Default if omitted | Validation |
|---|---|---|---|---|
| `zone_name` | string | **Yes** | — | Non-empty after trim, max 255 chars → 400 if missing |
| `camera_location` | string | **Yes** | — | Non-empty after trim, max 255 chars → 400 if missing |
| `status` | string | No | `"Active"` | Must be one of `Active`, `Acknowledged`, `Investigating`, `Dispatched`, `Escalated`, `Cleared` if provided |
| `object_class` | string | No | `"package-like object"` | Max 100 chars |
| `duration_seconds` | number | No | `null` | Coerced to a non-negative integer; invalid values become `null` |
| `person_name` | string | No | `null` | Max 255 chars |
| `alert_type` | string | No | `"Unattended Object"` | Max 100 chars |
| `severity` | string | No | `"High"` | Must be one of `Low`, `Medium`, `High`, `Critical` if provided |
| `source` | string | No | `"SecurePi Edge Node"` | Max 100 chars |
| `confidence` | number | No | `null` | Clamped into `[0, 1]` |
| `snapshot_url` / `snapshot_path` | string | No | `null` | Either key accepted; max 500 chars |
| `device_id` | string | No | `null` | Max 100 chars |
| `timestamp` / `occurred_at` | string (ISO 8601) | No | `null` | Either key accepted; invalid/unparseable dates become `null` |

Any other field sent in the body (e.g. `ignored_extra`) is silently dropped — the
route destructures only the fields above before calling `DetectionAlert.create()`.

**Confidence validation.** `parseConfidence()` converts the value with `Number()`
and, if finite, clamps it into `[0, 1]` with `Math.max(0, Math.min(1, parsed))`. A
non-numeric value becomes `null` rather than causing a 400.

**Timestamp handling.** `parseOccurredAt()` prefers `timestamp`, then falls back to
`occurred_at`, parses with `new Date(value)`, and stores `null` if the result is
`Invalid Date`.

**Zone/camera enrichment.** After validation, `resolveLinks()` best-effort looks up
a `MonitoringZone` by exact `zone_name` and a `Camera` by `camera_name` OR
`location` matching `camera_location`, and adds `zone_id`/`camera_id` to the created
row if found. A lookup failure is swallowed and never blocks alert creation.

**Example request**
```
POST /api/edge/detection-alerts
Authorization: Bearer <EDGE_INGEST_TOKEN>
Content-Type: application/json

{
  "alert_type": "Unattended Object",
  "object_class": "bag",
  "zone_name": "Loading Bay",
  "camera_location": "Loading Bay Camera 01",
  "duration_seconds": 15,
  "severity": "High",
  "status": "Active",
  "source": "SecurePi Edge Node",
  "confidence": 0.91,
  "device_id": "securepi-loading-bay-01",
  "occurred_at": "2026-07-11T10:00:00.000Z"
}
```

**Success response**

- **Status:** `201 Created`
- **Body:** the newly created `DetectionAlert` Sequelize instance (all model
  columns, including generated `id`, `createdAt`, `updatedAt`, and any resolved
  `zone_id`/`camera_id`), e.g.:
```json
{
  "id": 57,
  "zone_name": "Loading Bay",
  "camera_location": "Loading Bay Camera 01",
  "status": "Active",
  "object_class": "bag",
  "duration_seconds": 15,
  "person_name": null,
  "alert_type": "Unattended Object",
  "severity": "High",
  "source": "SecurePi Edge Node",
  "confidence": 0.91,
  "snapshot_url": null,
  "device_id": "securepi-loading-bay-01",
  "occurred_at": "2026-07-11T10:00:00.000Z",
  "camera_id": 5,
  "zone_id": 3,
  "createdAt": "2026-07-11T10:00:01.000Z",
  "updatedAt": "2026-07-11T10:00:01.000Z"
}
```

**Error responses**

| Status | Condition | Example body |
|---|---|---|
| 400 | `zone_name` or `camera_location` missing/blank; `status` not a valid enum value; `severity` not a valid enum value | `{ "error": "zone_name and camera_location are required." }` |
| 401 | No/blank bearer token, or token does not match `EDGE_INGEST_TOKEN` | `{ "error": "Invalid edge ingest token." }` |
| 503 | `EDGE_INGEST_TOKEN` is not set in the server's environment (feature not configured) | `{ "error": "Edge ingest is not configured." }` |
| 500 | Unexpected error (e.g. DB write failure) | `{ "error": "<exception message>" }` |

Confirmed by `server/tests/Tan Yu En, Charlisa/edge-detection-alerts.test.js`, which
asserts exactly the 401/503/201/400 cases above.

**How the alert is stored.** `DetectionAlert.create()` writes a row to the
`detection_alerts` table (model is `paranoid: true`, i.e. soft-deletable). This is
the **same table and model** used by `/api/detection-alerts` — the two routes are
two different front doors (device token vs. user JWT/service key) into one
underlying alert store. Alerts created here are picked up by the Object Detection
page's `GET /api/detection-alerts` polling exactly like AI-engine-created alerts.

**Caller.** `edge/securepi/securepi_edge.py`'s `AlertBridge.post_alert()` builds
this exact payload shape and sends it with
`Authorization: Bearer <EDGE_INGEST_TOKEN>` when `--edge-ingest-token` /
`EDGE_INGEST_TOKEN` is configured (it falls back to an `x-service-key` header only
if no edge token is set — but that would hit `/api/detection-alerts`' auth, not this
route's, since this route only understands the bearer token).

---

## 4. AI Service Endpoints Used by Object Detection (not part of the Node backend)

`ai-service/main.py` is a separate FastAPI process (default port 8501). The Vite
dev server proxies frontend calls to `/ai/*` through to this service, stripping the
`/ai` prefix (`client/vite.config.js:20-26`). These two endpoints have **no
authentication** — unlike every FlowGuard backend route above, no JWT or token is
checked.

### GET `/ai/api/yolo/people-count` → FastAPI `/api/yolo/people-count`
| | |
|---|---|
| **Purpose** | Poll the current people count from the AI service's background YOLO detection loop (runs against its own local camera/video source independent of the browser). |
| **Auth** | None |
| **Used by** | `ObjectDetection.jsx` — polled every 5 seconds (`fetchPeopleCount`) |
| **Source** | `ai-service/main.py:880-887` |

**Success — 200**
```json
{ "count": 2, "detection_active": true, "camera_status": "browser_camera" }
```
No documented error responses in code beyond a generic 500 on an unhandled
exception; the frontend treats any request failure (including a timeout) as "AI
Engine: Offline" after 3 consecutive failures.

### POST `/ai/api/yolo/analyze-frame` → FastAPI `/api/yolo/analyze-frame`
| | |
|---|---|
| **Purpose** | Analyze a single frame captured from the browser camera or an uploaded video file and return YOLO detections for overlay boxes. |
| **Auth** | None |
| **Body** | `{ "image": "<base64 data URL or raw base64 JPEG>" }` — `image` is required |
| **Used by** | `ObjectDetection.jsx` — called every ~2.2s while `sourceMode` is `camera` or `file` |
| **Source** | `ai-service/main.py:851-877` |

**Success — 200**
```json
{
  "count": 2,
  "detections": [
    { "label": "person", "box": [120, 40, 300, 480], "status": "normal", "confidence": 0.91, "type": "person" }
  ],
  "frame_width": 960,
  "frame_height": 540,
  "detection_active": true,
  "camera_status": "browser_camera"
}
```
**Error:** `400` `{ "detail": "Invalid image data" }` when the `image` field cannot
be decoded (FastAPI's standard `HTTPException` envelope, different shape from the
Node backend's `{ "error": ... }` convention).

**Frontend↔backend behaviour note (inferred):** this proxy path only exists in the
Vite **dev-server** config (`client/vite.config.js`). No equivalent rewrite was
found in the codebase for a production build, so in a deployed (non-Vite-dev)
environment `/ai/*` calls from the built frontend would need an explicit reverse
proxy or a different base URL — this is a potential deployment gap, not something
present in the current dev-only proxy config.

---

## 5. SecurePi Device Endpoints (Raspberry Pi service, not FlowGuard endpoints)

These are **not** FlowGuard REST endpoints — they run on the Raspberry Pi itself
(`edge/securepi/`) and are reached directly by the browser over the LAN/hotspot,
completely bypassing the Node backend and any FlowGuard authentication. They exist
in this documentation only because `ObjectDetection.jsx`'s "SecurePi Hardware"
source mode calls them directly.

The exact HTTP server implementation for `/health` and `/video_feed` was **not**
found inside `edge/securepi/securepi_edge.py` (that script only tracks detections
and POSTs alerts — see §3.7). The frontend's resolution logic
(`client/src/utils/securepiStream.js`) and Camera Inventory's placeholder text
(`http://<pi-ip>:8001/video_feed`) confirm these paths/port are the expected
contract, but the underlying MJPEG/health server binary/module is provided by the
upstream `edge/securepi/upstream/` SecurePi project rather than this repository's
own Node/Python services. Treat the request/response shapes below as the
**documented contract the frontend relies on**, not as FlowGuard-owned code.

### GET `http://<pi-ip>:8001/health`
| | |
|---|---|
| **Purpose** | Liveness check for the SecurePi stream server. |
| **Auth** | None |
| **Used by** | `ObjectDetection.jsx`, polled every 10 seconds while SecurePi Hardware mode is active; toggles the "SECUREPI EDGE LIVE" / "SECUREPI CONNECTING" / offline banner |
| **URL resolution** | `getHardwareHealthUrl()` in `client/src/utils/securepiStream.js`: prefers `VITE_SECUREPI_HEALTH_URL`, else derives `<stream origin>/health` from the resolved stream URL |
| **Response shape** | Not asserted by the frontend — only HTTP success/failure (2xx vs. network error/timeout) is used; any 2xx response is treated as healthy |

### GET `http://<pi-ip>:8001/video_feed`
| | |
|---|---|
| **Purpose** | Live annotated MJPEG video stream from the Pi's camera. |
| **Auth** | None |
| **Used by** | `ObjectDetection.jsx` — rendered directly via `<img src={hardwareStreamUrl}>` (lines 496-514) |
| **URL resolution** | `getHardwareStreamUrl()`: prefers the selected Camera Inventory record's `stream_url` (must be `http://`/`https://`), else `VITE_SECUREPI_STREAM_URL` |
| **Response type** | `multipart/x-mixed-replace` MJPEG stream — **not** a JSON REST response. The browser's `<img>` tag natively decodes this as a continuously-updating image; there is no request/response cycle to document in JSON terms, and it must not be modeled as a normal OpenAPI JSON response. |
| **Network assumption** | Works only when the browser and the Pi are on the same LAN/hotspot network (the same constraint documented in `edge/securepi/.env.example`'s `FLOWGUARD_API_BASE_URL=http://172.20.10.2:5001` hotspot-IP example) — this is the current prototype's networking model, not a general-purpose internet-facing stream. |

---

## 6. Authentication Summary

| Mechanism | Header | Used for | Verified against |
|---|---|---|---|
| User JWT | `Authorization: Bearer <token>` | `/api/zones`, `/api/cameras`, `/api/detection-alerts` (GET/PUT, and POST as a fallback) | `APP_SECRET`; DB re-check of `User` row + `tokenVersion` on every request (`verifyToken`) |
| AI-service shared key | `x-service-key: <value>` | `POST /api/detection-alerts` (service path) | `process.env.AI_SERVICE_KEY` |
| Edge device bearer token | `Authorization: Bearer <value>` | `POST /api/edge/detection-alerts` | `process.env.EDGE_INGEST_TOKEN` (separate secret from `AI_SERVICE_KEY` and from user JWTs) |
| None | — | AI Service `/api/yolo/*`, SecurePi `/health`, `/video_feed` | n/a — no credential is checked |

Role gate (`requireRole`, applies only after a JWT is verified):

| Role | Zones | Cameras | Detection Alerts |
|---|---|---|---|
| FM | Full CRUD | Full CRUD | View, create (manual), update status |
| Staff | View only | View only | View, create (manual), update status |
| Tenant | 403 on all zone/camera/alert routes | 403 | 403 |

---

## 7. Implementation Inconsistencies & Notes

1. **`POST /api/detection-alerts` is unused by the Object Detection page's UI.** It
   is fully implemented, role-gated, and tested, but no code path in
   `ObjectDetection.jsx` calls it — alerts reaching this page come from either the
   AI engine (service key, not inspected as part of this task) or SecurePi (via the
   separate `/api/edge/detection-alerts` route). Flagging so this isn't mistaken for
   dead code — it has its own tests and a documented purpose, it's just not wired
   into this particular page.
2. **Two different bodies of auth exist for creating alerts** — a shared service
   key (`AI_SERVICE_KEY`) for `/api/detection-alerts` and a separate bearer token
   (`EDGE_INGEST_TOKEN`) for `/api/edge/detection-alerts`. They are deliberately
   kept independent per the comments in `server/.env.example`; a caller with only
   an edge token cannot use the service-key path and vice versa.
3. **The AI Service and SecurePi device endpoints have zero authentication**,
   unlike every Node backend route. For the browser-camera/upload-video AI Service
   calls this is mitigated by the calls only being reachable through the local dev
   proxy; for the SecurePi stream/health endpoints, the mitigation is physical/LAN
   isolation (same hotspot network), not an application-level control. Any hardening
   work should treat this as a known prototype limitation, not an oversight to
   silently work around.
4. **Error response shape is inconsistent across systems**: the Node backend
   returns `{ "error": "..." }` (mostly) or `{ "message": "..." }` (auth
   middleware specifically), the AI Service (FastAPI) returns `{ "detail": "..." }`,
   and several Node routes on 404 use `res.sendStatus(404)` with **no JSON body at
   all** (`PUT /api/zones/:id`, `DELETE /api/zones/:id`, `PUT
   /api/detection-alerts/:id`). Frontend error handling should not assume a single
   error envelope.
5. **`GET /api/edge/detection-alerts` does not exist.** Only `POST` is defined on
   that router; SecurePi alerts are read back by FM/Staff through
   `GET /api/detection-alerts` (the shared alert list), not through a
   `/api/edge/...` read path.

---

## 8. Endpoints Explicitly Out of Scope / Excluded

The following were found in the codebase during inspection but are excluded from
this document because they are not part of the Object Detection / SecurePi
integration feature per the requested scope:

- `POST /api/incident`, `GET /api/incident`, `PATCH /api/incident/:id`, `DELETE
  /api/incident/:id`, `POST /api/incident/scan-frame` (`server/routes/incident.js`)
  — this is the **Facial Recognition / Incident Dashboard** module. It is only
  related to Object Detection indirectly: `POST /api/detection-alerts` fire-and-forgets
  an `IncidentLog.create()` as a side effect so unattended-object alerts also show up
  on the Incident Dashboard, but the Object Detection page itself never calls any
  `/api/incident/*` route.
- `/api/facial-recognition/*`, `/api/attendance/*`, `/api/bookings/*`,
  `/api/security/*`, `/api/support/*`, `/user/*` — unrelated FlowGuard modules
  (facial recognition, staff attendance, driver/tenant bookings, security logs,
  support tickets, auth/user management).
- `GET /ai/api/yolo/stream` (`ai-service/main.py:842-848`) — an MJPEG stream
  endpoint on the AI Service, analogous in spirit to SecurePi's `/video_feed` but
  **not referenced anywhere in `ObjectDetection.jsx` or `CameraFeed.jsx`**; it
  appears to be an alternative/legacy stream path that the current frontend does
  not use. Marked here as present-but-unused rather than silently omitted.
- `POST /user/recognize`, `POST /api/encode-faces`, `GET /refresh` on the AI
  Service — face-recognition endpoints, unrelated to object detection.
