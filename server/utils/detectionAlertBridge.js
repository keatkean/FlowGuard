// Shared helper for mapping a detection alert onto the IncidentLog row created
// alongside it — used by BOTH server/routes/detectionAlerts.js (AI engine + manual
// FM/Staff alerts) and server/routes/edgeDetectionAlerts.js (SecurePi edge alerts), so
// a crowd/person-count alert and an unattended-object alert never collapse onto the
// same incident type just because one route forgot the mapping.
//
// NOTE on naming: IncidentLog.status is misleadingly named — it stores the incident
// TYPE (UNATTENDED_OBJECT / OVERCROWDING / UNAUTHORIZED_ACCESS / ...), not a workflow
// state (that's IncidentLog.resolutionStatus). Preserved as-is rather than renamed, to
// avoid an unrelated schema/consumer redesign — every reader (IncidentDashboard.jsx)
// already expects this field to hold the type.
//
// Only values the Incident Dashboard's own "Log Incident" dropdown already understands
// (client/src/pages/IncidentDashboard.jsx) are ever returned.
const INCIDENT_TYPE_BY_DETECTION_TYPE = {
    unattended_object: 'UNATTENDED_OBJECT',
    crowd_density: 'OVERCROWDING',
    unauthorized_access: 'UNAUTHORIZED_ACCESS',
};

const DEFAULT_INCIDENT_TYPE = 'UNATTENDED_OBJECT';

// Resolves the IncidentLog type for a detection alert. Prefers an explicit
// Detection Setup detection_type (zone.detection_type) when the caller has one on
// hand; otherwise falls back to reading the alert's own alert_type/object_class text,
// since most detection alerts (AI-engine person-count/unattended-object alerts) don't
// carry an explicit detection_type today.
function resolveIncidentType({ alert_type, object_class, detection_type } = {}) {
    if (detection_type && INCIDENT_TYPE_BY_DETECTION_TYPE[detection_type]) {
        return INCIDENT_TYPE_BY_DETECTION_TYPE[detection_type];
    }

    const haystack = `${alert_type || ''} ${object_class || ''}`.toLowerCase();

    if (/unauthorized/.test(haystack)) {
        return 'UNAUTHORIZED_ACCESS';
    }
    // Person/crowd-count alerts read like "Critical: Person Detected" or
    // "Warning: 3 People Detected" (see ai-service/main.py::_maybe_fire_person_alert).
    if (/\b(person|people)\b[\s\S]*detected/.test(haystack) || /crowd|density|overcrowd/.test(haystack)) {
        return 'OVERCROWDING';
    }
    return DEFAULT_INCIDENT_TYPE;
}

module.exports = { resolveIncidentType, INCIDENT_TYPE_BY_DETECTION_TYPE, DEFAULT_INCIDENT_TYPE };
