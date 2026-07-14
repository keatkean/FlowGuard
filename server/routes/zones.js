const express = require('express');
const router = express.Router();
const { MonitoringZone, Camera, sequelize } = require('../models');
const { verifyToken, requireRole } = require('../middlewares/auth');

// Runs fn inside a managed transaction when the connection is available; unit tests that
// mock ../models without a sequelize instance fall back to running fn untransacted.
const withTransaction = (fn) => {
    if (sequelize && typeof sequelize.transaction === 'function') {
        return sequelize.transaction(fn);
    }
    return fn(null);
};

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
// Stable Detection Setup categories — must match client/src/pages/detectionSettingsPayload.js
// DETECTION_TYPES keys and the values server/utils/detectionAlertBridge.js maps from.
const DETECTION_TYPES = ['unattended_object', 'crowd_density', 'unauthorized_access'];
const DEFAULT_DETECTION_TYPE = 'unattended_object';

const isPositiveNumber = (value) => value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) > 0;

// Parses a Detection Setup payload's `monitored_classes` into a JSON string for storage,
// validating "monitored object class cannot be empty" when the field is supplied at all.
const parseMonitoredClasses = (value) => {
    if (value === undefined) return { skip: true };
    const list = Array.isArray(value) ? value : String(value).split(',');
    const cleaned = list.map((item) => String(item).trim()).filter(Boolean);
    if (cleaned.length === 0) {
        return { error: 'monitored_classes cannot be empty.' };
    }
    return { json: JSON.stringify(cleaned) };
};

const serializeZone = (zone) => {
    const plain = zone.toJSON();
    try {
        plain.monitored_classes = JSON.parse(plain.monitored_classes || '[]');
    } catch {
        plain.monitored_classes = [];
    }
    // Rows created before detection_type existed serialize with the same safe default
    // the field always defaulted to conceptually (unattended-object monitoring).
    plain.detection_type = plain.detection_type || DEFAULT_DETECTION_TYPE;
    return plain;
};

const validateSetupFields = (body) => {
    const { density_threshold, unattended_threshold_seconds, alert_cooldown_seconds, severity, detection_type } = body;
    if (density_threshold !== undefined && density_threshold !== null && !isPositiveNumber(density_threshold)) {
        return 'density_threshold must be a positive number.';
    }
    if (unattended_threshold_seconds !== undefined && unattended_threshold_seconds !== null && !isPositiveNumber(unattended_threshold_seconds)) {
        return 'unattended_threshold_seconds must be a positive number.';
    }
    if (alert_cooldown_seconds !== undefined && alert_cooldown_seconds !== null && !isPositiveNumber(alert_cooldown_seconds)) {
        return 'alert_cooldown_seconds must be a positive number.';
    }
    if (severity !== undefined && severity !== null && !SEVERITIES.includes(severity)) {
        return `severity must be one of: ${SEVERITIES.join(', ')}.`;
    }
    if (detection_type !== undefined && detection_type !== null && !DETECTION_TYPES.includes(detection_type)) {
        return `detection_type must be one of: ${DETECTION_TYPES.join(', ')}.`;
    }
    return null;
};

router.use(verifyToken);

router.get('/', requireRole('FM', 'Staff'), async (req, res) => {
    try {
        const zones = await MonitoringZone.findAll({ order: [['createdAt', 'DESC']] });
        res.json(zones.map(serializeZone));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', requireRole('FM', 'Staff'), async (req, res) => {
    try {
        // Non-numeric ids would make Postgres throw on an integer PK lookup — treat as not found.
        if (!/^\d+$/.test(req.params.id)) return res.sendStatus(404);
        const zone = await MonitoringZone.findByPk(req.params.id);
        if (!zone) return res.sendStatus(404);
        res.json(serializeZone(zone));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireRole('FM'), async (req, res) => {
    try {
        const { zone_name, location, time_threshold, density_threshold, unattended_threshold_seconds,
            alert_cooldown_seconds, severity, assigned_team, detection_enabled, detection_type, monitored_classes,
            camera_id } = req.body;

        if (!zone_name || !location || time_threshold === undefined) {
            return res.status(400).json({ error: 'zone_name, location, and time_threshold are required.' });
        }
        if (!isPositiveNumber(time_threshold)) {
            return res.status(400).json({ error: 'time_threshold must be a positive number.' });
        }
        const setupError = validateSetupFields(req.body);
        if (setupError) return res.status(400).json({ error: setupError });

        const classesResult = parseMonitoredClasses(monitored_classes);
        if (classesResult.error) return res.status(400).json({ error: classesResult.error });

        let camera = null;
        if (camera_id !== undefined && camera_id !== null) {
            camera = await Camera.findByPk(camera_id);
            if (!camera) return res.status(400).json({ error: 'Selected camera does not exist.' });
            // Brand-new zone — any existing zone_id means the camera is already active
            // on another Detection Setup rule; never silently steal it.
            if (camera.zone_id) {
                return res.status(409).json({ error: 'That camera is already assigned to another Detection Setup rule.' });
            }
        }

        // Zone creation + camera assignment happen in one transaction: if the camera
        // update fails, the zone itself is never created either.
        const zone = await withTransaction(async (t) => {
            const opts = t ? { transaction: t } : undefined;
            const created = await MonitoringZone.create({
                zone_name,
                location,
                time_threshold: parseInt(time_threshold, 10),
                ...(density_threshold !== undefined && { density_threshold: density_threshold === null ? null : parseInt(density_threshold, 10) }),
                ...(unattended_threshold_seconds !== undefined && { unattended_threshold_seconds: unattended_threshold_seconds === null ? null : parseInt(unattended_threshold_seconds, 10) }),
                ...(alert_cooldown_seconds !== undefined && { alert_cooldown_seconds: alert_cooldown_seconds === null ? null : parseInt(alert_cooldown_seconds, 10) }),
                ...(severity !== undefined && { severity }),
                ...(assigned_team !== undefined && { assigned_team: assigned_team || null }),
                ...(detection_enabled !== undefined && { detection_enabled: Boolean(detection_enabled) }),
                ...(detection_type !== undefined && { detection_type: detection_type || null }),
                ...(!classesResult.skip && { monitored_classes: classesResult.json })
            }, opts);

            if (camera) {
                await camera.update({ zone_id: created.id }, opts);
            }
            return created;
        });
        res.status(201).json(serializeZone(zone));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireRole('FM'), async (req, res) => {
    try {
        const zone = await MonitoringZone.findByPk(req.params.id);
        if (!zone) return res.sendStatus(404);
        const { zone_name, location, time_threshold, density_threshold, unattended_threshold_seconds,
            alert_cooldown_seconds, severity, assigned_team, detection_enabled, detection_type, monitored_classes,
            camera_id } = req.body;

        if (time_threshold !== undefined && !isPositiveNumber(time_threshold)) {
            return res.status(400).json({ error: 'time_threshold must be a positive number.' });
        }
        const setupError = validateSetupFields(req.body);
        if (setupError) return res.status(400).json({ error: setupError });

        const classesResult = parseMonitoredClasses(monitored_classes);
        if (classesResult.error) return res.status(400).json({ error: classesResult.error });

        // camera_id is optional and tri-state: undefined = leave assignment untouched
        // (backward compatible), null = explicitly release, a value = validate + assign.
        let newCamera = null;
        if (camera_id !== undefined && camera_id !== null) {
            newCamera = await Camera.findByPk(camera_id);
            if (!newCamera) return res.status(400).json({ error: 'Selected camera does not exist.' });
            // Re-saving the SAME camera already on this zone is always allowed; a camera
            // actively held by a DIFFERENT zone is never silently stolen.
            if (newCamera.zone_id && String(newCamera.zone_id) !== String(zone.id)) {
                return res.status(409).json({ error: 'That camera is already assigned to another Detection Setup rule.' });
            }
        }

        // Camera replacement + zone update happen in ONE transaction: if assigning the
        // new camera fails, the old camera's assignment and the zone's fields are both
        // preserved (nothing here has committed yet).
        await withTransaction(async (t) => {
            const opts = t ? { transaction: t } : undefined;

            if (camera_id !== undefined) {
                const currentCamera = await Camera.findOne({ where: { zone_id: zone.id }, ...opts });
                if (currentCamera && (!newCamera || currentCamera.id !== newCamera.id)) {
                    await currentCamera.update({ zone_id: null }, opts);
                }
                if (newCamera) {
                    await newCamera.update({ zone_id: zone.id }, opts);
                }
            }

            await zone.update({
                ...(zone_name !== undefined && { zone_name }),
                ...(location !== undefined && { location }),
                ...(time_threshold !== undefined && { time_threshold: parseInt(time_threshold, 10) }),
                ...(density_threshold !== undefined && { density_threshold: density_threshold === null ? null : parseInt(density_threshold, 10) }),
                ...(unattended_threshold_seconds !== undefined && { unattended_threshold_seconds: unattended_threshold_seconds === null ? null : parseInt(unattended_threshold_seconds, 10) }),
                ...(alert_cooldown_seconds !== undefined && { alert_cooldown_seconds: alert_cooldown_seconds === null ? null : parseInt(alert_cooldown_seconds, 10) }),
                ...(severity !== undefined && { severity }),
                ...(assigned_team !== undefined && { assigned_team: assigned_team || null }),
                ...(detection_enabled !== undefined && { detection_enabled: Boolean(detection_enabled) }),
                ...(detection_type !== undefined && { detection_type: detection_type || null }),
                ...(!classesResult.skip && { monitored_classes: classesResult.json })
            }, opts);
        });
        res.json(serializeZone(zone));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireRole('FM'), async (req, res) => {
    try {
        const zone = await MonitoringZone.findByPk(req.params.id);
        if (!zone) return res.sendStatus(404);

        // Release any camera(s) mapped to this rule BEFORE soft-deleting the zone, in one
        // transaction, so they immediately show as unassigned/available for another
        // Detection Setup rule instead of pointing at a deleted zone_id.
        await withTransaction(async (t) => {
            const opts = t ? { transaction: t } : undefined;
            await Camera.update({ zone_id: null }, { where: { zone_id: zone.id }, ...opts });
            await zone.destroy(opts);
        });
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
