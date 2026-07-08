const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');

// Destructure BOTH sequelize (for raw queries) and SecurityLog from the auto-loader
const { sequelize, SecurityLog } = require('../models');
const { verifyToken } = require('../middlewares/auth');

// 🔒 Every security-log route requires a valid JWT. These logs contain personnel
// identities and intrusion data, so they must not be publicly readable/writable.
router.use(verifyToken);

const ALLOWED_REVIEW_STATUSES = ['Pending Review', 'False Positive', 'Escalated', 'Resolved'];

// 1. POST Route: Catch the log from React and save it to PostgreSQL
//    AUTOMATIC TASK: AI recognition (V-Patrol) posts Access Granted / Intrusion events here.
router.post('/logs', async (req, res) => {
  try {
    const { time, type, desc, severity, icon, personnelName } = req.body;

    // Safe access events are auto-resolved; anything else lands in the FM review queue.
    const reviewStatus = severity === 'safe' ? 'Resolved' : 'Pending Review';

    const newLog = await SecurityLog.create({
      id: randomUUID(),   // server-generated UUID — no more duplicate key collisions
      time,
      type,
      desc,
      severity,
      icon,
      personnelName,
      reviewStatus
    });

    res.status(201).json({ message: "Log secured in database", log: newLog });
  } catch (error) {
    console.error("Failed to save security log:", error);
    res.status(500).json({ error: "Internal server error while saving log." });
  }
});

// 2. GET Route: Fetch logs for a specific person by Name
router.get('/logs/personnel/:name', async (req, res) => {
  try {
    const logs = await SecurityLog.findAll({
      where: { personnelName: req.params.name },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json(logs);
  } catch (error) {
    console.error("Failed to fetch personnel logs:", error);
    res.status(500).json({ error: "Could not retrieve personnel timeline." });
  }
});

// 3. GET Route: Fetch logs by User ID instead of name (For UserLogs.jsx)
router.get('/logs/user/:id', async (req, res) => {
  try {
    // Look up the target user (name for log matching + managerId/role for ownership).
    const users = await sequelize.query(
      'SELECT id, name, "managerId", role FROM users WHERE id = ?',
      {
        replacements: [req.params.id],
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!users || users.length === 0) {
      return res.status(404).json({ error: "Personnel member not found." });
    }

    const target = users[0];

    // Ownership: FM sees anyone; a Tenant may only view logs for their own staff.
    const isFM = req.user.role === 'FM';
    const isOwnerTenant = req.user.role === 'Tenant' && String(target.managerId) === String(req.user.id);
    if (!isFM && !isOwnerTenant) {
      return res.status(403).json({ error: "You can only view logs for your own staff." });
    }

    const userName = target.name;

    const logs = await SecurityLog.findAll({
      where: { personnelName: userName },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      personnelName: userName,
      logs: logs
    });
  } catch (error) {
    console.error("Failed to fetch personnel logs by ID:", error);
    res.status(500).json({ error: "Could not retrieve activity logs." });
  }
});

// 4. GET Route: Fetch logs for the dashboard / review queue.
//    Supports optional filtering: ?status=Pending Review and ?limit=100
router.get('/logs', async (req, res) => {
  try {
    const { status, limit } = req.query;

    const where = {};
    if (status) {
      if (!ALLOWED_REVIEW_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid review status filter." });
      }
      where.reviewStatus = status;
    }

    const logs = await SecurityLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(limit, 10) || 15, 200)
    });

    res.status(200).json(logs);
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    res.status(500).json({ error: "Could not retrieve security timeline." });
  }
});

// 5. PATCH Route: MANUAL TASK — FM reviews a suspicious log and updates its status/notes.
//    FM-only. status ∈ {Pending Review, False Positive, Escalated, Resolved}
router.patch('/logs/:id/review', async (req, res) => {
  try {
    if (req.user.role !== 'FM') {
      return res.status(403).json({ error: "Only Facilities Managers can review security logs." });
    }

    const { reviewStatus, reviewNotes } = req.body;

    if (!reviewStatus || !ALLOWED_REVIEW_STATUSES.includes(reviewStatus)) {
      return res.status(400).json({
        error: `reviewStatus is required and must be one of: ${ALLOWED_REVIEW_STATUSES.join(', ')}.`
      });
    }

    const log = await SecurityLog.findByPk(req.params.id);
    if (!log) {
      return res.status(404).json({ error: "Security log not found." });
    }

    await log.update({
      reviewStatus,
      reviewNotes: reviewNotes ?? log.reviewNotes,
      reviewedBy: req.user.email || `FM #${req.user.id}`,
      reviewedAt: new Date()
    });

    res.status(200).json({ message: "Review updated.", log });
  } catch (error) {
    console.error("Failed to update review:", error);
    res.status(500).json({ error: "Could not update the security log review." });
  }
});

module.exports = router;
