-- 20260714_sync_object_detection_schema.sql
--
-- Purpose
--   Bring the LIVE PostgreSQL schema back in line with the Object Detection
--   Sequelize models after the group-final integration merge. Two model fields
--   were added during integration but never applied to the live database, so
--   Sequelize SELECTed columns that do not exist and every read that touches the
--   affected tables returned HTTP 500:
--
--     monitoring_zones.detection_type   -> MonitoringZone.detection_type (STRING(30))
--         Breaks GET /api/zones   ("column \"detection_type\" does not exist")
--         Breaks GET /api/cameras ("column zone.detection_type does not exist"),
--         because GET /api/cameras eager-loads the `zone` association and selects
--         every MonitoringZone attribute, including detection_type.
--
--     detection_alerts.incident_log_id  -> DetectionAlert.incident_log_id (INTEGER)
--         Already added manually earlier in this investigation (GET
--         /api/detection-alerts now returns 200). Re-stated here idempotently so a
--         fresh/other environment gets the complete Object Detection schema from
--         one file, not two separate manual steps.
--
-- Safety
--   * Idempotent: every statement uses ADD COLUMN IF NOT EXISTS, so re-running is a
--     no-op and columns that already exist are left exactly as they are.
--   * Non-destructive: no DROP, no TRUNCATE, no DELETE, no table recreation.
--   * Existing rows are preserved. Both columns are NULLable, so no default backfill
--     is required and no existing row is rewritten.
--   * Does NOT depend on DB_SYNC_ALTER=true.
--
-- All other Object Detection model fields (cameras.*, monitoring_zones.* aside from
-- detection_type, detection_alerts.* aside from incident_log_id, incident_logs.*,
-- plus createdAt/updatedAt/deletedAt on every paranoid model) were audited against
-- information_schema.columns on 2026-07-14 and confirmed already present, so they are
-- intentionally not touched here.

BEGIN;

-- MonitoringZone.detection_type — explicit Detection Setup category. Nullable; the
-- zones route's serializeZone() fills the 'unattended_object' default for old rows.
ALTER TABLE monitoring_zones
    ADD COLUMN IF NOT EXISTS detection_type VARCHAR(30);

-- DetectionAlert.incident_log_id — links an alert to the IncidentLog created with it.
-- Nullable; alerts created before this field existed simply have no linked incident.
ALTER TABLE detection_alerts
    ADD COLUMN IF NOT EXISTS incident_log_id INTEGER;

COMMIT;
