# FlowGuard — Entity Relationship Diagram (merged system)

```mermaid
erDiagram
  USER ||--o{ ATTENDANCE : "has (userId)"
  USER ||--o{ USER : "manages (managerId)"
  USER ||--o{ BOOKING : "owns unit (tenantId, soft)"
  USER ||--o{ SECURITYLOG : "named in (personnelName, soft)"
  USER ||--o{ INVITE : "issues (FM, soft)"
  MONITORINGZONE ||--o{ CAMERA : "has (zone_id)"
  MONITORINGZONE ||--o{ DETECTIONALERT : "in zone (zone_id)"
  CAMERA ||--o{ DETECTIONALERT : "from camera (camera_id)"
  DETECTIONALERT ||--o{ INCIDENTLOG : "seeds (soft)"
  CHATTRANSCRIPT ||--o| SUPPORTTICKET : "has one (transcriptId)"

  USER {
    int id PK
    string name
    string email UK
    string password
    string role "FM Tenant Staff"
    int managerId FK "self ref"
    string companyCode UK
    int codeMaxUsage
    int codeCurrentUsage
    boolean isEnrolled
    float faceVector "FLOAT array"
    boolean isActive
  }
  BOOKING {
    int id PK
    string booking_ref UK
    int tenantId "soft link to user"
    string tenant_name
    string driver_name
    string transport_company
    string license_plate
    string driver_phone
    string loading_bay
    datetime slot_start
    datetime slot_end
    string status
    datetime arrived_at
    datetime completed_at
    datetime deletedAt "soft delete"
  }
  ATTENDANCE {
    int id PK
    int userId FK "cascade delete"
    string type "IN OUT"
    datetime timestamp
  }
  SECURITYLOG {
    string id PK
    string type
    string severity
    text desc
    string personnelName "soft link"
    string reviewStatus
    text reviewNotes
    string reviewedBy
  }
  INVITE {
    int id PK
    string code UK
    string role "Tenant"
    boolean isUsed
    datetime expiresAt
  }
  MONITORINGZONE {
    int id PK
    string zone_name
    string location
    int time_threshold "legacy minutes"
    text monitored_classes
    int density_threshold
    int unattended_threshold_seconds
    int alert_cooldown_seconds
    string severity "Low Medium High Critical"
    string assigned_team "soft link"
    boolean detection_enabled
    datetime deletedAt "soft delete"
  }
  CAMERA {
    int id PK
    string camera_code
    string camera_name
    string location
    int zone_id FK "to monitoring_zones"
    string stream_url
    string status "Online Offline Maintenance Disabled"
    string camera_type
    datetime last_active_at
    datetime deletedAt "soft delete"
  }
  DETECTIONALERT {
    int id PK
    string zone_name
    string camera_location
    string object_class
    int duration_seconds
    string person_name
    int camera_id FK "to cameras, nullable"
    int zone_id FK "to monitoring_zones, nullable"
    string status
    datetime deletedAt "soft delete"
  }
  INCIDENTLOG {
    int id PK
    string camera_location
    string person_name
    decimal confidence_score
    string severity
    string source
    string resolutionStatus
    text notes
    datetime deletedAt "soft delete"
  }
  CHATTRANSCRIPT {
    uuid id PK
    uuid sessionId UK
    int userId
    string tenantName
    string unitNumber
    json messages
    boolean isEscalated
    text escalationReason
  }
  SUPPORTTICKET {
    uuid id PK
    uuid transcriptId FK "to chat_transcripts"
    int userId
    string tenantName
    string unitNumber
    string issueTitle
    text issueDescription
    string priority "Low Medium High"
    string status "Pending InProgress Resolved"
    string resolvedBy
    datetime resolvedAt
    text resolutionNotes
  }
  KNOWLEDGEBASE {
    uuid id PK
    string category
    text question
    text answer
    string keywords "string array"
    string createdBy
    string updatedBy
  }
```

## Notes

- **Enforced FK relationships:** `ATTENDANCE.userId → USER.id` (ON DELETE CASCADE); `USER.managerId →
  USER.id` self-reference (Tenant ⟶ Staff); `CAMERA.zone_id → MONITORINGZONE.id`;
  `DETECTIONALERT.camera_id → CAMERA.id` and `DETECTIONALERT.zone_id → MONITORINGZONE.id` (both
  nullable — the AI engine's string payload still works); `SUPPORTTICKET.transcriptId →
  CHATTRANSCRIPT.id` (ChatTranscript `hasOne` SupportTicket).
- **Soft links (no DB-level FK, matched at query time):**
  - `BOOKING.tenantId → USER.id` — Staff bookings use the Staff member's `managerId`.
  - `SECURITYLOG.personnelName → USER.name` — nulled on PDPA off-boarding.
  - `MONITORINGZONE.assigned_team` — free-text response-team name, not an FK.
  - `DETECTIONALERT → INCIDENTLOG` — object-detection alerts can seed incident records (soft workflow).
- **KNOWLEDGEBASE** is standalone FAQ data used by the AI Helpdesk to match incoming chat messages.
- `faceVector` is a PostgreSQL `FLOAT[]` array (Sequelize `ARRAY(FLOAT)`) — **not pgvector**
  (pgvector not required).
- Soft-deletable (`paranoid`) tables keep a `deletedAt` timestamp: bookings, cameras, monitoring
  zones, detection alerts, incident logs.
- **After editing this diagram, regenerate `design/png/er-diagram.png`** from this Mermaid source.
