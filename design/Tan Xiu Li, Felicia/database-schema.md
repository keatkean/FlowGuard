# Database Schema — FlowGuard (Sequelize / PostgreSQL)

Documents the tables relevant to Felicia's features (facial access + logistics) plus the shared
tables the system uses. Defined with Sequelize.

> **Face-vector storage:** `faceVector` is a native PostgreSQL `FLOAT[]` array (Sequelize
> `ARRAY(FLOAT)`), **not** pgvector. Cosine-similarity matching is done in the Python AI service
> with NumPy, so pgvector is optional and unused.

---

## `users`  (model `User`)
**Purpose:** identity, role, registration-code logic, biometric vector. **Hard delete** (`paranoid:false`).

| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | auto |
| name | VARCHAR(100) | not null |
| email | VARCHAR(100) | not null, unique |
| password | VARCHAR(100) | bcrypt hash |
| role | ENUM(FM,Tenant,Staff) | default Tenant |
| companyCode | VARCHAR(50) | unique, nullable |
| codeCreatedAt / codeMaxUsage / codeCurrentUsage | TIMESTAMP / INT / INT | tenant unit-code logic |
| managerId | INTEGER | self-ref FK → users.id (Tenant → Staff) |
| isEnrolled | BOOLEAN | default false |
| faceVector | FLOAT[] | nullable, 512-d |
| isActive | BOOLEAN | default true |

**Relationships:** self (Manager/StaffMembers via `managerId`); 1—M `attendance`.
**CRUD:** create (register / manual-create), read (`GET /user/`, `/my-staff`), update
(suspend, generate-code, enroll-face), delete (PDPA `DELETE /user/:id`).

## `bookings`  (model `Booking`, `paranoid:true`)
**Purpose:** loading-bay booking requests + gate lifecycle.

| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| booking_ref | VARCHAR(50) | unique; QR value |
| tenantId | INTEGER | soft link → users.id (unit owner) |
| tenant_name | VARCHAR(255) | nullable |
| driver_name / transport_company / license_plate / driver_phone | VARCHAR | driver + vehicle |
| loading_bay | VARCHAR(50) | e.g. Bay A / Bay B |
| slot_start / slot_end | TIMESTAMP | nullable |
| status | VARCHAR(50) | Pending / Confirmed / Arrived / Completed / Cancelled |
| arrived_at / completed_at | TIMESTAMP | nullable, set on gate scan |
| deletedAt | TIMESTAMP | soft delete |

**Relationships:** soft link `tenantId → users.id`.
**CRUD:** create (`POST /api/bookings/create`), read (role-scoped `GET /api/bookings/`, public
`GET /api/bookings/:ref`), update (`PATCH /api/bookings/:id/status`,
`PATCH /api/bookings/:ref/gate-scan`), delete (soft cancel `PATCH /api/bookings/:id/cancel`).

## `attendance`  (model `Attendance`)
**Purpose:** IN/OUT events from gate recognition.

| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| type | ENUM(IN,OUT) | not null |
| timestamp | TIMESTAMP | default NOW |
| userId | INTEGER | FK → users.id, ON DELETE CASCADE |

**Relationships:** belongs to `User`. **CRUD:** create (`POST /api/attendance/scan`), read (`GET /api/attendance/logs`,
role-scoped), delete via user cascade.

## `security_logs`  (model `SecurityLog`)
**Purpose:** access + intrusion events; FM review workflow.

| Field | Type | Notes |
|-------|------|-------|
| id | VARCHAR PK | UUID |
| time / type / desc / severity / icon | VARCHAR/TEXT | event data |
| personnelName | VARCHAR | soft link → users.name; nulled on off-board |
| reviewStatus | VARCHAR | Pending Review / False Positive / Escalated / Resolved |
| reviewNotes / reviewedBy / reviewedAt | TEXT / VARCHAR / TIMESTAMP | FM triage |

**CRUD:** create (`POST /api/security/logs`), read (`GET /api/security/logs`,
`GET /api/security/logs/user/:id`), update (`PATCH /api/security/logs/:id/review`), delete not
exposed (retained for audit).

## `detection_alerts`  (model `DetectionAlert`, `paranoid:true`) — object-detection module
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| zone_name / camera_location | VARCHAR(255) | not null |
| status | VARCHAR(50) | default Active |
| object_class | VARCHAR(100) | nullable |
| duration_seconds | INTEGER | nullable |
| person_name | VARCHAR(255) | nullable |
| deletedAt | TIMESTAMP | soft delete + 30-day purge |

**Soft link:** `zone_name → monitoring_zones.zone_name`; can seed `incident_logs`.

## `incident_logs`  (model `IncidentLog`, `paranoid:true`) — incident module
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| camera_location | VARCHAR(255) | not null |
| status | VARCHAR(50) | not null |
| person_name | VARCHAR(255) | nullable |
| confidence_score | DECIMAL(5,4) | nullable |
| severity | VARCHAR(20) | default Medium |
| source | VARCHAR(50) | default Facial Recognition |
| resolutionStatus | VARCHAR(50) | default Active |
| notes | TEXT | nullable |
| deletedAt | TIMESTAMP | soft delete |

## `monitoring_zones`  (model `MonitoringZone`, `paranoid:true`) — object-detection module
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| zone_name / location | VARCHAR(255) | not null |
| time_threshold | INTEGER | minutes before an unattended-object alert |
| deletedAt | TIMESTAMP | soft delete |

## `invites`  (model `Invite`)
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| code | VARCHAR | unique |
| role | ENUM(Tenant) | default Tenant |
| isUsed | BOOLEAN | default false |
| expiresAt | TIMESTAMP | not null |

**CRUD:** create (`/invite-tenant`), read/consume during registration.

## `staff_members`  (model `Staff`, `paranoid:true`) — legacy/auxiliary
Legacy face store: `id`, `name`, `role`, `face_embedding` (TEXT), `deletedAt`. Superseded by the
`users.faceVector` approach; retained for compatibility.

---

*Cross-module note: `bookings`, `detection_alerts`, `incident_logs`, `monitoring_zones` live in the
shared DB and involve teammate modules; see `design/md/er-diagram.md` for the full picture.*
