# FlowGuard - Entity Relationship Diagram (merged system)

```mermaid
erDiagram
  USER ||--o{ ATTENDANCE : "has (userId)"
  USER ||--o{ USER : "manages (managerId)"
  USER o|--o| EVALUATIONPARTICIPANT : "has stable evaluation label"
  USER ||--o{ BOOKING : "owns unit (tenantId, soft reference)"
  USER ||--o{ SECURITYLOG : "matched/named in (soft reference)"
  MONITORINGZONE ||--o{ CAMERA : "has (zone_id)"
  MONITORINGZONE ||--o{ DETECTIONALERT : "in zone (zone_id)"
  CAMERA ||--o{ DETECTIONALERT : "from camera (camera_id)"
  CHATTRANSCRIPT ||--o| SUPPORTTICKET : "has one (transcriptId)"

  USER {
    int id PK
    string name
    string email UK
    string password
    string role "FM Tenant Staff"
    string companyCode UK
    datetime codeCreatedAt
    int codeMaxUsage
    int codeCurrentUsage
    int managerId FK "self ref"
    boolean isEnrolled
    float faceVector "FLOAT array"
    boolean isActive
    int tokenVersion
    string passwordResetTokenHash
    datetime passwordResetExpiresAt
    datetime createdAt
    datetime updatedAt
  }
  EVALUATIONPARTICIPANT {
    int id PK
    int userId FK "nullable, unique, ON DELETE SET NULL"
    string evaluationLabel UK
    boolean active
    datetime assignedAt
    datetime retiredAt
    datetime createdAt
    datetime updatedAt
  }
  BOOKING {
    int id PK
    string booking_ref UK
    string tenant_name
    int tenantId "soft link to user"
    string driver_name
    string transport_company
    string license_plate
    string driver_phone
    string loading_bay
    datetime slot_start
    datetime slot_end
    string status
    text notes
    datetime arrived_at
    datetime completed_at
    datetime deletedAt "model supports paranoid soft delete"
    datetime createdAt
    datetime updatedAt
  }
  ATTENDANCE {
    int id PK
    int userId FK "cascade delete"
    string type "IN OUT"
    datetime timestamp
    datetime createdAt
    datetime updatedAt
  }
  SECURITYLOG {
    string id PK
    string time
    string type
    text desc
    string severity
    string icon
    string personnelName "soft reference"
    int matchedUserId "soft reference"
    float confidence
    string cameraLocation
    string reviewStatus
    text reviewNotes
    string reviewedBy
    datetime reviewedAt
    datetime createdAt
    datetime updatedAt
  }
  INVITE {
    int id PK
    string code UK
    string role "Tenant"
    boolean isUsed
    datetime expiresAt
    datetime createdAt
    datetime updatedAt
  }
  MONITORINGZONE {
    int id PK
    string zone_name
    string location
    int time_threshold
    text monitored_classes
    int density_threshold
    int unattended_threshold_seconds
    int alert_cooldown_seconds
    string severity "Low Medium High Critical"
    string assigned_team
    boolean detection_enabled
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }
  CAMERA {
    int id PK
    string camera_code
    string camera_name
    string location
    int zone_id FK
    string stream_url
    string status "Online Offline Maintenance Disabled"
    string camera_type
    datetime last_active_at
    text notes
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }
  DETECTIONALERT {
    int id PK
    string zone_name
    string camera_location
    string status
    string object_class
    int duration_seconds
    string person_name
    string alert_type
    string severity "Low Medium High Critical"
    string source
    float confidence
    string snapshot_url
    string device_id
    datetime occurred_at
    int camera_id FK "nullable"
    int zone_id FK "nullable"
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }
  INCIDENTLOG {
    int id PK
    string camera_location
    string status
    string person_name
    decimal confidence_score
    string severity
    string source
    string resolutionStatus
    text notes
    datetime deletedAt
    datetime createdAt
    datetime updatedAt
  }
  CHATTRANSCRIPT {
    uuid id PK
    string sessionId UK
    int userId
    string tenantName
    string unitNumber
    json messages
    boolean isEscalated
    text escalationReason
    datetime createdAt
    datetime updatedAt
  }
  SUPPORTTICKET {
    uuid id PK
    uuid transcriptId FK
    int userId
    string tenantName
    string unitNumber
    string issueTitle
    text issueDescription
    string priority "Low Medium High"
    string status "Pending In Progress Resolved"
    string resolvedBy
    datetime resolvedAt
    text resolutionNotes
    datetime createdAt
    datetime updatedAt
  }
  KNOWLEDGEBASE {
    uuid id PK
    string category
    text question
    text answer
    string keywords "string array"
    string createdBy
    string updatedBy
    datetime createdAt
    datetime updatedAt
  }
```

## Notes

- `evaluation_participants` stores stable labels such as P01/P02/P03. Labels remain reserved after user off-boarding; the record is retired and its `userId` is set to null.
- Invite has no issuer/user foreign key in the actual model. Invite creation is role-controlled at application level only.
- DetectionAlert and IncidentLog are not database-linked. A detection-alert route may attempt to seed an IncidentLog, but the records are not linked by a database foreign key.
- `BOOKING.deletedAt` exists because the Sequelize model supports paranoid soft deletion. The current manual Cancel workflow does not call destroy/delete; it performs status-based logical cancellation with `status = Cancelled`.
- `faceVector` is a PostgreSQL `FLOAT[]` array. InsightFace generates 512-dimensional facial embeddings and the Python AI service performs similarity matching.
- Soft-deletable model tables: bookings, cameras, monitoring_zones, detection_alerts, incident_logs.
