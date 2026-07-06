# FlowGuard – Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ ATTENDANCE : records
    USERS ||--o{ USERS : manages
    USERS ||..o{ SECURITY_LOGS : "name match"
    USERS ||..o{ INCIDENT_LOGS : "name match"
    MONITORING_ZONES ||--o{ CAMERAS : "camera-to-zone mapping"
    MONITORING_ZONES ||--o{ DETECTION_ALERTS : "resolved link"
    CAMERAS ||--o{ DETECTION_ALERTS : "resolved link"

    USERS {
        int id PK
        string name
        string email UK
        string password
        enum role "FM | Tenant | Staff"
        string companyCode UK
        datetime codeCreatedAt
        int codeMaxUsage
        int codeCurrentUsage
        int managerId FK "self to users.id"
        boolean isEnrolled
        vector faceVector "512-dim pgvector"
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }
    ATTENDANCE {
        int id PK
        enum type "IN | OUT"
        datetime timestamp
        int userId FK "to users.id CASCADE"
        datetime createdAt
        datetime updatedAt
    }
    SECURITY_LOGS {
        string id PK
        string time
        string type
        text desc
        string severity
        string icon
        string personnelName "soft link to users.name"
        datetime createdAt
        datetime updatedAt
    }
    INCIDENT_LOGS {
        int id PK
        string camera_location
        string status
        string person_name
        decimal confidence_score "precision 5,4"
        datetime deletedAt "soft delete"
    }
    CAMERAS {
        int id PK
        string camera_code UK "checked case-insensitively in the route layer"
        string camera_name
        string location
        int zone_id FK "to monitoring_zones.id, nullable"
        string stream_url "nullable"
        enum status "Online | Offline | Maintenance | Disabled"
        string camera_type "nullable"
        datetime last_active_at "nullable"
        text notes "nullable"
        datetime deletedAt "soft delete = deactivate"
    }
    MONITORING_ZONES {
        int id PK
        string zone_name
        string location
        int time_threshold "LEGACY unattended threshold, MINUTES — read directly by ai-service"
        text monitored_classes "JSON-encoded array, default []"
        int density_threshold "nullable"
        int unattended_threshold_seconds "nullable — takes precedence over time_threshold*60 when set"
        int alert_cooldown_seconds "nullable"
        enum severity "Low | Medium | High | Critical"
        string assigned_team "nullable soft link, not a FK"
        boolean detection_enabled "default true"
        datetime deletedAt "soft delete"
    }
    DETECTION_ALERTS {
        int id PK
        string zone_name
        string camera_location
        string status "Active | Acknowledged | Dispatched | Cleared"
        string object_class "nullable"
        int duration_seconds "nullable"
        string person_name "nullable"
        int camera_id FK "to cameras.id, nullable, resolved best-effort from camera_location"
        int zone_id FK "to monitoring_zones.id, nullable, resolved best-effort from zone_name"
        datetime deletedAt "soft delete"
    }
    BOOKINGS {
        int id PK
        string booking_ref UK
        string transport_company
        string license_plate
        string driver_phone
        string loading_bay
        string status
        datetime deletedAt "soft delete"
    }
    INVITES {
        int id PK
        string code UK
        enum role "Tenant"
        boolean isUsed
        datetime expiresAt
    }
    STAFF_MEMBERS {
        int id PK
        string name
        string role
        text face_embedding
        datetime deletedAt "soft delete"
    }
```

**Solid line** = enforced foreign key. **Dotted line** = soft link by name (no DB-level FK).
`CAMERAS`, `MONITORING_ZONES`, and `DETECTION_ALERTS` (object-detection module — Camera Inventory
and Detection Setup) added 2026-07-06; see `docs/camera-inventory-detection-setup-api.md` for the
full API/field reference. Remaining teammate tables (Support_Tickets, Chat_Transcripts, etc.)
should still be added to complete the full-system ER.