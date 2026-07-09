const express = require('express');
const router = express.Router();
// const { DetectionAlert, IncidentLog } = require('../models');
const { DetectionAlert, IncidentLog, MonitoringZone, Camera } = require('../models');
function severityFromDuration(seconds) {
  if (!seconds || seconds < 120) return 'Low';
  if (seconds < 300) return 'Medium';
  if (seconds < 600) return 'High';
  return 'Critical';
}
// const { DetectionAlert, MonitoringZone, Camera } = require('../models');
const { Op } = require('sequelize');
const { verifyToken, requireRole, verifyServiceOrRole } = require('../middlewares/auth');
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

router.get('/', verifyToken, requireRole('FM', 'Staff'), async (req, res) => {
    try {
        const where = {};
        if (req.query.status) where.status = req.query.status;
        const alerts = await DetectionAlert.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 50
        });
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resolves best-effort zone_id/camera_id from the free-text zone_name/camera_location the
// AI engine (or a manual caller) sends — additive enrichment, never blocks alert creation.
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
        // Enrichment is best-effort only — never fail alert creation because of it.
    }
    return links;
}

// AI engine posts here server-to-server via a shared service key; FM/Staff may also
// create a manual test alert using their own JWT.
router.post('/', verifyServiceOrRole('FM', 'Staff'), async (req, res) => {
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
        if (!zone_name || !camera_location) {
            return res.status(400).json({ error: 'zone_name and camera_location are required.' });
        }
        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
        }
        if (severity && !SEVERITIES.includes(severity)) {
            return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(', ')}.` });
        }
        const links = await resolveLinks(zone_name, camera_location);
        const alert = await DetectionAlert.create({
            zone_name: cleanText(zone_name, 255),
            camera_location: cleanText(camera_location, 255),
            status: status || 'Active',
            object_class: cleanText(object_class, 100),
            duration_seconds: parsePositiveInt(duration_seconds),
            person_name: cleanText(person_name, 255),
            alert_type: cleanText(alert_type, 100),
            severity: severity || 'High',
            source: cleanText(source, 100) || 'Object Detection',
            confidence: parseConfidence(confidence),
            snapshot_url: cleanText(snapshot_url || snapshot_path, 500),
            device_id: cleanText(device_id, 100),
            occurred_at: parseOccurredAt(timestamp || occurred_at),
            ...links
        });
        res.status(201).json(alert);

        // Bridge to IncidentLog — fire-and-forget so the AI always gets its 201
        IncidentLog.create({
            camera_location: camera_location,
            status: 'UNATTENDED_OBJECT',
            source: 'Object Detection',
            severity: severityFromDuration(duration_seconds),
            person_name: (person_name && person_name !== 'UNKNOWN') ? person_name : null,
            confidence_score: null,
            resolutionStatus: 'Active',
            notes: zone_name ? `[Object Detection] Zone: ${zone_name}` : ''
        }).catch(err =>
            console.error(`[Bridge] DetectionAlert id=${alert.id} — IncidentLog create failed:`, err.message)
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', verifyToken, requireRole('FM', 'Staff'), async (req, res) => {
    try {
        const alert = await DetectionAlert.findByPk(req.params.id);
        if (!alert) return res.sendStatus(404);
        if (req.body.status && !VALID_STATUSES.includes(req.body.status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
        }
        await alert.update({ status: req.body.status });
        res.json(alert);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purge detection alerts older than 30 days — runs once daily
function purgeStaleLogs() {
    if (typeof DetectionAlert.destroy !== 'function') return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    DetectionAlert.destroy({
        where: { createdAt: { [Op.lt]: cutoff } },
        force: true
    })
    .then(n => { if (n > 0) console.log(`[Purge] Removed ${n} stale detection alerts.`); })
    .catch(e => console.error('[Purge] Error:', e));
}

setInterval(purgeStaleLogs, 24 * 60 * 60 * 1000);
// Delay the first run by 20s to let Sequelize finish syncing tables on startup
setTimeout(purgeStaleLogs, 20000);

module.exports = router;
