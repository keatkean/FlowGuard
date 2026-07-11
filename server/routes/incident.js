const express = require('express');
const router = express.Router();
const { IncidentLog } = require('../models');
const { Op } = require("sequelize");
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { verifyToken, requireRole, verifyServiceOrRole } = require('../middlewares/auth');
require('dotenv').config();

const ALLOWED_STATUSES = ['Active', 'Investigating', 'Escalated to Security', 'Cleared'];

// Memory storage for incoming CCTV frames
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// AI INTEGRATION ROUTE: Scan frame and save to DB automatically
// -------------------------------------------------------------
// Camera bridge posts frames server-to-server with the shared AI service key;
// FM/Staff JWTs may also call it for manual testing. Never publicly accessible.
router.post("/scan-frame", verifyServiceOrRole('FM', 'Staff'), upload.single('file'), async (req, res) => {
    const cameraLocation = req.body.camera_location || "Unknown Sector";

    if (!req.file) {
        return res.status(400).json({ error: "No image frame provided" });
    }

    if (!process.env.PYTHON_AI_URL) {
        return res.status(503).json({ error: "AI service is not configured (PYTHON_AI_URL missing)." });
    }

    try {
        // 1. Package the frame for Python
        const formData = new FormData();
        formData.append('file', req.file.buffer, req.file.originalname);

        // 2. Request AI analysis
        const aiResponse = await axios.post(process.env.PYTHON_AI_URL, formData, {
            headers: formData.getHeaders()
        });

        const faces = aiResponse.data.faces;
        const savedLogs = [];

        // 3. Save AI results into PostgreSQL via Sequelize
        for (let face of faces) {
            let newLog = await IncidentLog.create({
                camera_location: cameraLocation,
                status: face.status,
                person_name: face.name,
                confidence_score: face.confidence
            });
            savedLogs.push(newLog);

            if (face.status === "UNAUTHORIZED_ACCESS") {
                console.log(`🚨 ALERT: Unauthorized access (${face.name}) at ${cameraLocation}!`);
            } else {
                console.log(`✅ LOGGED: ${face.name} authorized at ${cameraLocation}.`);
            }
        }

        res.json({ success: true, ai_detections: faces, db_logs: savedLogs });

    } catch (err) {
        console.error("AI Communication Error:", err.message);
        res.status(500).json({ error: "Failed to process frame with AI Service" });
    }
});

// -------------------------------------------------------------
// Manual FM incident creation
// -------------------------------------------------------------
router.post("/", verifyToken, requireRole('FM', 'Staff'), async (req, res) => {
    const { camera_location, status, source, severity, person_name, confidence_score, notes } = req.body;
    if (!camera_location || !status || !source || !severity) {
        return res.status(400).json({ error: "camera_location, status, source, and severity are required." });
    }
    try {
        const log = await IncidentLog.create({
            camera_location,
            status,
            source,
            severity,
            person_name: person_name || null,
            confidence_score: confidence_score ? parseFloat(confidence_score) : null,
            notes: notes || '',
            resolutionStatus: 'Active'
        });
        res.status(201).json(log);
    } catch (err) {
        console.error("Failed to create incident:", err);
        res.status(500).json({ error: "Failed to create incident log." });
    }
});

// -------------------------------------------------------------
// STANDARD CRUD: Get all logs for React Dashboard
// -------------------------------------------------------------
router.get("/", verifyToken, requireRole('FM', 'Staff'), async (req, res) => {
    let condition = {};
    let search = req.query.search;

    // Allow React frontend to search by name or location
    if (search) {
        condition[Op.or] = [
            { person_name: { [Op.like]: `%${search}%` } },
            { camera_location: { [Op.like]: `%${search}%` } },
            { status: { [Op.like]: `%${search}%` } }
        ];
    }

    try {
        let list = await IncidentLog.findAll({
            where: condition,
            order: [['createdAt', 'DESC']]
        });
        res.json(list);
    } catch (err) {
        console.error("Failed to fetch incident logs:", err);
        res.status(500).json({ error: "Failed to fetch incident logs." });
    }
});

// Get specific log
router.get("/:id", verifyToken, requireRole('FM', 'Staff'), async (req, res) => {
    let id = req.params.id;
    try {
        let log = await IncidentLog.findByPk(id);
        if (!log) {
            res.sendStatus(404);
            return;
        }
        res.json(log);
    } catch (err) {
        console.error("Failed to fetch incident log:", err);
        res.status(500).json({ error: "Failed to fetch incident log." });
    }
});

// Update resolution status and/or notes
router.patch("/:id", verifyToken, requireRole('FM', 'Staff'), async (req, res) => {
    const log = await IncidentLog.findByPk(req.params.id);
    if (!log) return res.status(404).json({ error: "Incident not found." });
    const { resolutionStatus, notes } = req.body;
    if (resolutionStatus && !ALLOWED_STATUSES.includes(resolutionStatus)) {
        return res.status(400).json({ error: `resolutionStatus must be one of: ${ALLOWED_STATUSES.join(', ')}.` });
    }
    try {
        await log.update({
            resolutionStatus: resolutionStatus ?? log.resolutionStatus,
            notes: notes !== undefined ? notes : log.notes
        });
        res.status(200).json(log);
    } catch (err) {
        console.error("Failed to update incident:", err);
        res.status(500).json({ error: "Failed to update incident log." });
    }
});

// Delete a log (e.g., clearing false alarms)
// Deleting an incident is FM-only, matching detection-alert deletion (the Incident
// Dashboard itself is an FM-only page in the frontend).
router.delete("/:id", verifyToken, requireRole('FM'), async (req, res) => {
    let id = req.params.id;
    let log = await IncidentLog.findByPk(id);
    if (!log) {
        res.sendStatus(404);
        return;
    }
    await log.destroy();
    res.sendStatus(200);
});

module.exports = router;