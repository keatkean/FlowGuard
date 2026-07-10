const express = require('express');
const router = express.Router();
const { Attendance, User } = require('../models');
const { Op } = require('sequelize');
const { verifyToken, verifyServiceOrRole } = require('../middlewares/auth');
const { shouldWriteLog, createSecurityLog } = require('../services/securityAudit');
const {
  getSingaporeWindow,
  deriveDailySummaries,
  summarizeForDate,
  buildAttendanceWhere
} = require('../services/attendanceSummary');

const attendanceInclude = (where) => ({
  model: User,
  attributes: ['id', 'name', 'role', 'managerId'],
  ...(where ? { where } : {})
});

const recordDto = (summary) => ({
  user: summary.user ? {
    id: summary.user.id,
    name: summary.user.name,
    role: summary.user.role
  } : null,
  userId: summary.userId,
  date: summary.date,
  firstCheckIn: summary.firstCheckIn,
  latestCheckOut: summary.latestCheckOut,
  currentStatus: summary.currentStatus,
  punctuality: summary.punctuality
});

router.get('/logs', verifyToken, async (req, res) => {
  try {
    const { id: loggedInUserId, role: userRole } = req.user;
    const window = getSingaporeWindow({
      filter: req.query.filter || 'today',
      date: req.query.date,
      now: req.query.now ? new Date(req.query.now) : new Date()
    });

    let attendanceRecords;

    if (userRole === 'FM') {
      attendanceRecords = await Attendance.findAll({
        where: buildAttendanceWhere(window),
        include: [attendanceInclude()],
        order: [['timestamp', 'ASC']]
      });
      const dailySummaries = deriveDailySummaries(attendanceRecords);
      const today = summarizeForDate(dailySummaries, window.todayKey);
      return res.status(200).json({
        role: 'FM',
        filter: { type: window.filter, startDate: window.startKey, endDateExclusive: window.endExclusiveKey, timezone: 'Asia/Singapore' },
        summary: {
          peopleOnSite: today.onSite,
          checkedInToday: today.checkedIn,
          checkedOutToday: today.checkedOut,
          activityCount: dailySummaries.length
        }
      });
    }

    if (userRole === 'Tenant') {
      attendanceRecords = await Attendance.findAll({
        where: buildAttendanceWhere(window),
        include: [attendanceInclude({ role: 'Staff', managerId: loggedInUserId })],
        order: [['timestamp', 'ASC']]
      });
      const records = deriveDailySummaries(attendanceRecords).map(recordDto);
      const today = summarizeForDate(records, window.todayKey);
      return res.status(200).json({
        role: 'Tenant',
        filter: { type: window.filter, startDate: window.startKey, endDateExclusive: window.endExclusiveKey, timezone: 'Asia/Singapore' },
        summary: {
          staffOnSite: today.onSite,
          onTimeToday: today.onTime,
          lateToday: today.late
        },
        records
      });
    }

    attendanceRecords = await Attendance.findAll({
      where: { ...buildAttendanceWhere(window), userId: loggedInUserId },
      include: [attendanceInclude()],
      order: [['timestamp', 'ASC']]
    });
    const records = deriveDailySummaries(attendanceRecords).map(recordDto);
    const today = summarizeForDate(records, window.todayKey);
    const ownToday = today.summaries[0] || null;
    return res.status(200).json({
      role: 'Staff',
      filter: { type: window.filter, startDate: window.startKey, endDateExclusive: window.endExclusiveKey, timezone: 'Asia/Singapore' },
      summary: {
        currentStatus: ownToday?.currentStatus || 'OUT',
        firstCheckIn: ownToday?.firstCheckIn || null,
        latestCheckOut: ownToday?.latestCheckOut || null,
        punctuality: ownToday?.punctuality || 'NO_IN'
      },
      records
    });
  } catch (error) {
    console.error('Attendance Extraction Error:', error);
    const status = /Custom date/.test(error.message) ? 400 : 500;
    res.status(status).json({ error: status === 400 ? error.message : 'Internal server error reading logs.' });
  }
});

router.post('/scan', verifyServiceOrRole('FM'), async (req, res) => {
  try {
    const { userId: scannedUserId } = req.body;

    if (scannedUserId == null || !Number.isInteger(Number(scannedUserId))) {
      return res.status(400).json({ error: 'Missing required parameter: userId' });
    }

    const user = await User.findByPk(scannedUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not recognized in system registry.' });
    }
    if (!user.isEnrolled) {
      return res.status(403).json({ error: 'User has no enrolled Face ID.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account suspended. Gate access denied.' });
    }

    const userId = user.id;
    const todayWindow = getSingaporeWindow({ filter: 'today' });

    const existingLogsToday = await Attendance.findAll({
      where: {
        userId,
        timestamp: {
          [Op.gte]: todayWindow.start,
          [Op.lt]: todayWindow.end
        }
      },
      order: [['timestamp', 'ASC']]
    });

    let actionTaken = '';
    let finalLog = null;

    const hasClockedInToday = existingLogsToday.some((log) => log.type === 'IN');
    const hasClockedOutToday = existingLogsToday.some((log) => log.type === 'OUT');

    if (!hasClockedInToday) {
      finalLog = await Attendance.create({ userId, type: 'IN', timestamp: new Date() });
      actionTaken = 'CLOCK_IN_SUCCESSFUL';
    } else if (!hasClockedOutToday) {
      finalLog = await Attendance.create({ userId, type: 'OUT', timestamp: new Date() });
      actionTaken = 'CLOCK_OUT_SUCCESSFUL';
    } else {
      const lastOutLog = [...existingLogsToday].reverse().find((log) => log.type === 'OUT');
      if (lastOutLog) {
        lastOutLog.timestamp = new Date();
        await lastOutLog.save();
        finalLog = lastOutLog;
        actionTaken = 'CLOCK_OUT_TIMESTAMP_UPDATED';
      }
    }

    const cameraLocation = typeof req.body.cameraLocation === 'string' && req.body.cameraLocation.trim()
      ? req.body.cameraLocation.trim().slice(0, 100)
      : 'Main Gate';
    if (shouldWriteLog(`granted:${user.id}:${cameraLocation}`)) {
      await createSecurityLog({
        type: 'Gantry Access',
        desc: `Identity & liveness verified - ${actionTaken.replace(/_/g, ' ').toLowerCase()}: ${user.name} (${user.role}) at ${cameraLocation}.`,
        severity: 'safe',
        icon: 'UNLOCK',
        personnelName: user.name,
        matchedUserId: user.id,
        cameraLocation
      });
    }

    return res.status(200).json({
      status: 'SUCCESS',
      action: actionTaken,
      worker: user.name,
      role: user.role,
      timestamp: finalLog.timestamp,
      openTurnstile: true
    });
  } catch (error) {
    console.error('IoT Gate Processing Loop Fault:', error);
    return res.status(500).json({ error: 'Internal processing crash inside gatekeeper module.' });
  }
});

module.exports = router;