const express = require('express');
const router = express.Router();
const { MonitoringZone } = require('../models');
const { verifyToken, requireRole } = require('../middlewares/auth');

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

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
    return plain;
};

const validateSetupFields = (body) => {
    const { density_threshold, unattended_threshold_seconds, alert_cooldown_seconds, severity } = body;
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
            alert_cooldown_seconds, severity, assigned_team, detection_enabled, monitored_classes } = req.body;

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

        const zone = await MonitoringZone.create({
            zone_name,
            location,
            time_threshold: parseInt(time_threshold, 10),
            ...(density_threshold !== undefined && { density_threshold: density_threshold === null ? null : parseInt(density_threshold, 10) }),
            ...(unattended_threshold_seconds !== undefined && { unattended_threshold_seconds: unattended_threshold_seconds === null ? null : parseInt(unattended_threshold_seconds, 10) }),
            ...(alert_cooldown_seconds !== undefined && { alert_cooldown_seconds: alert_cooldown_seconds === null ? null : parseInt(alert_cooldown_seconds, 10) }),
            ...(severity !== undefined && { severity }),
            ...(assigned_team !== undefined && { assigned_team: assigned_team || null }),
            ...(detection_enabled !== undefined && { detection_enabled: Boolean(detection_enabled) }),
            ...(!classesResult.skip && { monitored_classes: classesResult.json })
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
            alert_cooldown_seconds, severity, assigned_team, detection_enabled, monitored_classes } = req.body;

        if (time_threshold !== undefined && !isPositiveNumber(time_threshold)) {
            return res.status(400).json({ error: 'time_threshold must be a positive number.' });
        }
        const setupError = validateSetupFields(req.body);
        if (setupError) return res.status(400).json({ error: setupError });

        const classesResult = parseMonitoredClasses(monitored_classes);
        if (classesResult.error) return res.status(400).json({ error: classesResult.error });

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
            ...(!classesResult.skip && { monitored_classes: classesResult.json })
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
        await zone.destroy();
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
