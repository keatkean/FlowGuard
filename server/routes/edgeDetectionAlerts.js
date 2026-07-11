const express = require('express');
const router = express.Router();
const { DetectionAlert, IncidentLog, MonitoringZone, Camera, sequelize } = require('../models');
const { Op } = require('sequelize');

// Mirrors the fallback in detectionAlerts.js so edge and AI alerts get consistent severities
function severityFromDuration(seconds) {
    if (!seconds || seconds < 120) return 'Low';
    if (seconds < 300) return 'Medium';
    if (seconds < 600) return 'High';
    return 'Critical';
}

// Runs fn inside a managed transaction when the connection is available; unit tests that
// mock ../models without a sequelize instance fall back to running fn untransacted.
const withTransaction = (fn) => {
    if (sequelize && typeof sequelize.transaction === 'function') {
        return sequelize.transaction(fn);
    }
    return fn(null);
};

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const VALID_STATUSES = ['Active', 'Acknowledged', 'Investigating', 'Dispatched', 'Escalated', 'Cleared'];

const cleanText = (value, maxLength) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.slice(0, maxLength);
};

const parsePositiveInt = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseConfidence = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(1, parsed));
};

const parseOccurredAt = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const verifyEdgeIngestToken = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!process.env.EDGE_INGEST_TOKEN) {
        return res.status(503).json({ error: 'Edge ingest is not configured.' });
    }
    if (!token || token !== process.env.EDGE_INGEST_TOKEN) {
        return res.status(401).json({ error: 'Invalid edge ingest token.' });
    }
    return next();
};

async function resolveLinks(zone_name, camera_location) {
    const links = {};
    try {
        if (zone_name) {
            const zone = await MonitoringZone.findOne({ where: { zone_name } });
            if (zone) links.zone_id = zone.id;
        }
        if (camera_location) {
            const camera = await Camera.findOne({
                where: {
                    [Op.or]: [{ camera_name: camera_location }, { location: camera_location }]
                }
            });
            if (camera) links.camera_id = camera.id;
        }
    } catch {
        // Edge ingestion should still work even if enrichment cannot resolve links.
    }
    return links;
}

router.post('/detection-alerts', verifyEdgeIngestToken, async (req, res) => {
    try {
        const {
            zone_name,
            camera_location,
            status,
            object_class,
            duration_seconds,
            person_name,
            alert_type,
            severity,
            source,
            confidence,
            snapshot_url,
            snapshot_path,
            device_id,
            timestamp,
            occurred_at
        } = req.body;

        const cleanedZone = cleanText(zone_name, 255);
        const cleanedCamera = cleanText(camera_location, 255);
        if (!cleanedZone || !cleanedCamera) {
            return res.status(400).json({ error: 'zone_name and camera_location are required.' });
        }
        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
        }
        if (severity && !SEVERITIES.includes(severity)) {
            return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(', ')}.` });
        }

        const links = await resolveLinks(cleanedZone, cleanedCamera);
        const resolvedSeverity = severity || severityFromDuration(duration_seconds);

        // Alert + linked incident are created atomically: a failed incident create rolls
        // back the detection alert so the edge node can safely retry the whole event.
        const alert = await withTransaction(async (t) => {
            const created = await DetectionAlert.create({
                zone_name: cleanedZone,
                camera_location: cleanedCamera,
                status: status || 'Active',
                object_class: cleanText(object_class, 100) || 'package-like object',
                duration_seconds: parsePositiveInt(duration_seconds),
                person_name: cleanText(person_name, 255),
                alert_type: cleanText(alert_type, 100) || 'Unattended Object',
                severity: resolvedSeverity,
                source: cleanText(source, 100) || 'SecurePi Edge Node',
                confidence: parseConfidence(confidence),
                snapshot_url: cleanText(snapshot_url || snapshot_path, 500),
                device_id: cleanText(device_id, 100),
                occurred_at: parseOccurredAt(timestamp || occurred_at),
                ...links
            }, { transaction: t });

            const incident = await IncidentLog.create({
                camera_location: cleanedCamera,
                status: 'UNATTENDED_OBJECT',
                source: 'Object Detection',
                severity: resolvedSeverity,
                person_name: (person_name && person_name !== 'UNKNOWN') ? cleanText(person_name, 255) : null,
                confidence_score: null,
                resolutionStatus: 'Active',
                notes: `[Object Detection] Zone: ${cleanedZone}`
            }, { transaction: t });

            await created.update({ incident_log_id: incident.id }, { transaction: t });
            return created;
        });

        return res.status(201).json(alert);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
