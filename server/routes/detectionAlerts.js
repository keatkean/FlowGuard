const express = require('express');
const router = express.Router();
const { DetectionAlert, IncidentLog } = require('../models');

function severityFromDuration(seconds) {
  if (!seconds || seconds < 120) return 'Low';
  if (seconds < 300) return 'Medium';
  if (seconds < 600) return 'High';
  return 'Critical';
}
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
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

router.post('/', async (req, res) => {
    try {
        const { zone_name, camera_location, status, object_class, duration_seconds, person_name } = req.body;
        if (!zone_name || !camera_location) {
            return res.status(400).json({ error: 'zone_name and camera_location are required.' });
        }
        const alert = await DetectionAlert.create({
            zone_name,
            camera_location,
            status: status || 'Active',
            object_class: object_class || null,
            duration_seconds: duration_seconds || null,
            person_name: person_name || null
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

router.put('/:id', async (req, res) => {
    try {
        const alert = await DetectionAlert.findByPk(req.params.id);
        if (!alert) return res.sendStatus(404);
        await alert.update({ status: req.body.status });
        res.json(alert);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purge detection alerts older than 30 days — runs once daily
function purgeStaleLogs() {
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
