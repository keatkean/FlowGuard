const express = require('express');
const router = express.Router();
const { Camera, MonitoringZone, sequelize } = require('../models');
const { verifyToken, requireRole } = require('../middlewares/auth');

const CAMERA_STATUSES = ['Online', 'Offline', 'Maintenance', 'Disabled'];

const findCameraByCode = (code, excludeId) => Camera.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('camera_code')), code.toLowerCase())
}).then((cam) => (cam && excludeId && cam.id === excludeId ? null : cam));

// Enforces "one selected camera per Detection Setup rule": a zone that already has a
// camera mapped to it cannot silently gain a second one. excludeId lets the SAME
// camera keep (or re-save) its own zone_id without tripping this check.
const findCameraByZone = (zoneId, excludeId) => Camera.findOne({
    where: { zone_id: zoneId }
}).then((cam) => (cam && excludeId && cam.id === excludeId ? null : cam));

router.use(verifyToken);

router.get('/', requireRole('FM', 'Staff'), async (req, res) => {
    try {
        const cameras = await Camera.findAll({
            include: [{ model: MonitoringZone, as: 'zone' }],
            order: [['createdAt', 'DESC']]
        });
        res.json(cameras);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', requireRole('FM', 'Staff'), async (req, res) => {
    try {
        const camera = await Camera.findByPk(req.params.id, {
            include: [{ model: MonitoringZone, as: 'zone' }]
        });
        if (!camera) return res.status(404).json({ error: 'Camera not found.' });
        res.json(camera);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireRole('FM'), async (req, res) => {
    try {
        const { camera_code, camera_name, location, zone_id, stream_url, status, camera_type, notes } = req.body;

        if (!camera_code || !String(camera_code).trim()) {
            return res.status(400).json({ error: 'camera_code is required.' });
        }
        if (!camera_name || !String(camera_name).trim()) {
            return res.status(400).json({ error: 'camera_name is required.' });
        }
        if (!location || !String(location).trim()) {
            return res.status(400).json({ error: 'location is required.' });
        }
        if (status !== undefined && !CAMERA_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${CAMERA_STATUSES.join(', ')}.` });
        }
        if (zone_id !== undefined && zone_id !== null) {
            const zone = await MonitoringZone.findByPk(zone_id);
            if (!zone) return res.status(400).json({ error: 'Selected zone does not exist.' });
            const zoneTaken = await findCameraByZone(zone_id);
            if (zoneTaken) {
                return res.status(409).json({ error: 'That zone already has a camera assigned. Unassign it before mapping another camera.' });
            }
        }

        const normalizedCode = String(camera_code).trim();
        const duplicate = await findCameraByCode(normalizedCode);
        if (duplicate) {
            return res.status(409).json({ error: 'That camera code is already in use.' });
        }

        const camera = await Camera.create({
            camera_code: normalizedCode,
            camera_name: String(camera_name).trim(),
            location: String(location).trim(),
            zone_id: zone_id || null,
            stream_url: stream_url || null,
            status: status || 'Online',
            camera_type: camera_type || null,
            notes: notes || null,
            last_active_at: new Date()
        });
        res.status(201).json(camera);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireRole('FM'), async (req, res) => {
    try {
        const camera = await Camera.findByPk(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found.' });

        const { camera_code, camera_name, location, zone_id, stream_url, status, camera_type, notes } = req.body;

        if (camera_code !== undefined) {
            const normalizedCode = String(camera_code).trim();
            if (!normalizedCode) {
                return res.status(400).json({ error: 'camera_code is required.' });
            }
            const duplicate = await findCameraByCode(normalizedCode, camera.id);
            if (duplicate) {
                return res.status(409).json({ error: 'That camera code is already in use.' });
            }
        }
        if (camera_name !== undefined && !String(camera_name).trim()) {
            return res.status(400).json({ error: 'camera_name is required.' });
        }
        if (location !== undefined && !String(location).trim()) {
            return res.status(400).json({ error: 'location is required.' });
        }
        if (status !== undefined && !CAMERA_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${CAMERA_STATUSES.join(', ')}.` });
        }
        if (zone_id !== undefined && zone_id !== null) {
            const zone = await MonitoringZone.findByPk(zone_id);
            if (!zone) return res.status(400).json({ error: 'Selected zone does not exist.' });
            const zoneTaken = await findCameraByZone(zone_id, camera.id);
            if (zoneTaken) {
                return res.status(409).json({ error: 'That zone already has a camera assigned. Unassign it before mapping another camera.' });
            }
        }

        await camera.update({
            ...(camera_code !== undefined && { camera_code: String(camera_code).trim() }),
            ...(camera_name !== undefined && { camera_name: String(camera_name).trim() }),
            ...(location !== undefined && { location: String(location).trim() }),
            ...(zone_id !== undefined && { zone_id: zone_id || null }),
            ...(stream_url !== undefined && { stream_url: stream_url || null }),
            ...(status !== undefined && { status }),
            ...(camera_type !== undefined && { camera_type: camera_type || null }),
            ...(notes !== undefined && { notes: notes || null }),
            last_active_at: new Date()
        });
        res.json(camera);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireRole('FM'), async (req, res) => {
    try {
        const camera = await Camera.findByPk(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found.' });
        await camera.update({ status: 'Disabled' });
        await camera.destroy();
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
