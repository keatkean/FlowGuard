const express = require('express');
const router = express.Router();
const { Attendance, User } = require('../models');
const { Op } = require('sequelize');

// 🎯 IMPORT YOUR AUTH MIDDLEWARE HERE
// (Change this path/name if your project uses a different filename like verifyToken.js)
const { verifyToken } = require('../middlewares/auth'); 

// 1. GET Route: Fetch attendance log data dynamically based on RBAC
// URL: GET /api/attendance/logs
// 🎯 Added 'verifyToken' right here to intercept the call and populate req.user!
router.get('/logs', verifyToken, async (req, res) => {
  try {
    const { id: loggedInUserId, role: userRole } = req.user; 

    let attendanceRecords;

    // 1. FM DASHBOARD VIEW: Global access to everything
    if (userRole === 'FM') {
      attendanceRecords = await Attendance.findAll({
        include: [{
          model: User,
          attributes: ['id', 'name', 'role']
        }],
        order: [['timestamp', 'DESC']]
      });
    } 
    
    // 2. TENANT DASHBOARD VIEW: Enforce strict PDPA compartmentalization
    else if (userRole === 'Tenant') {
      attendanceRecords = await Attendance.findAll({
        include: [{
          model: User,
          attributes: ['id', 'name', 'role', 'managerId'],
          where: {
            [Op.or]: [
              { managerId: loggedInUserId }, // Pulls their assigned Staff records
              { id: loggedInUserId }         // Pulls the Tenant's own logs
            ]
          }
        }],
        order: [['timestamp', 'DESC']]
      });
    } 
    
    // 3. STAFF VIEW: own attendance records only — never the aggregate roster (PDPA-safe).
    else {
      attendanceRecords = await Attendance.findAll({
        where: { userId: loggedInUserId },
        include: [{
          model: User,
          attributes: ['id', 'name', 'role']
        }],
        order: [['timestamp', 'DESC']]
      });
    }

    res.status(200).json(attendanceRecords);
  } catch (error) {
    console.error("Attendance Extraction Error:", error);
    res.status(500).json({ error: "Internal server error reading logs." });
  }
});

// 2. POST Route: Automatic IoT Clock-In / Clock-Out Trigger
// URL: POST /api/attendance/scan
// (This remains public/unprotected because it is called autonomously by the camera engine)
router.post('/scan', async (req, res) => {
  try {
    const { name } = req.body; 

    if (!name) {
      return res.status(400).json({ error: "Missing required parameter: name" });
    }

    const user = await User.findOne({ where: { name: name } });
    if (!user) {
      return res.status(404).json({ error: `User '${name}' not recognized in system registry.` });
    }

    const userId = user.id;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const existingLogsToday = await Attendance.findAll({
      where: {
        userId,
        timestamp: {
          [Op.between]: [startOfToday, endOfToday]
        }
      },
      order: [['timestamp', 'ASC']]
    });

    let actionTaken = "";
    let finalLog = null;

    const hasClockedInToday = existingLogsToday.some(log => log.type === 'IN');
    const hasClockedOutToday = existingLogsToday.some(log => log.type === 'OUT');

    if (!hasClockedInToday) {
      finalLog = await Attendance.create({
        userId,
        type: 'IN',
        timestamp: new Date()
      });
      actionTaken = "CLOCK_IN_SUCCESSFUL";
    } 
    else if (hasClockedInToday && !hasClockedOutToday) {
      finalLog = await Attendance.create({
        userId,
        type: 'OUT',
        timestamp: new Date()
      });
      actionTaken = "CLOCK_OUT_SUCCESSFUL";
    } 
    else {
      const lastOutLog = existingLogsToday.reverse().find(log => log.type === 'OUT');
      if (lastOutLog) {
        lastOutLog.timestamp = new Date();
        await lastOutLog.save();
        finalLog = lastOutLog;
        actionTaken = "CLOCK_OUT_TIMESTAMP_UPDATED";
      }
    }

    return res.status(200).json({
      status: "SUCCESS",
      action: actionTaken,
      worker: user.name,
      timestamp: finalLog.timestamp,
      openTurnstile: true
    });

  } catch (error) {
    console.error("IoT Gate Processing Loop Fault:", error);
    return res.status(500).json({ error: "Internal processing crash inside gatekeeper module." });
  }
});

module.exports = router;