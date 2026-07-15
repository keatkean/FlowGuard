const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { verifyToken } = require('../middlewares/auth');
const {
  User,
  Attendance,
  Camera,
  DetectionAlert,
  Booking,
  IncidentLog,
  SupportTicket,
  SecurityLog
} = require('../models');
const {
  getSingaporeWindow,
  deriveDailySummaries,
  summarizeForDate,
  buildAttendanceWhere
} = require('../services/attendanceSummary');
const { buildAlertAnalytics } = require('../services/dashboardAnalytics');

const ACTIVE_ALERT_STATUSES = ['Active', 'Acknowledged', 'Investigating', 'Escalated', 'Dispatched'];
const HIGH_SEVERITIES = ['High', 'Critical'];
const OPEN_INCIDENT_STATUSES = ['Active', 'Pending Review', 'Escalated', 'Open'];
const OPEN_TICKET_STATUSES = ['Pending', 'In Progress'];
const ACTIVE_BOOKING_STATUSES = ['Confirmed', 'Arrived'];

const safeCount = async (model, options = {}) => {
  if (!model || typeof model.count !== 'function') return null;
  return model.count(options);
};

const todayWindow = () => getSingaporeWindow({ filter: 'today' });

const attendanceForUsers = async (userWhere) => {
  const window = todayWindow();
  const records = await Attendance.findAll({
    where: buildAttendanceWhere(window),
    include: [{ model: User, attributes: ['id', 'name', 'role', 'managerId'], ...(userWhere ? { where: userWhere } : {}) }],
    order: [['timestamp', 'ASC']]
  });
  const summaries = deriveDailySummaries(records);
  return { window, summaries, today: summarizeForDate(summaries, window.todayKey) };
};

const safeBookingFields = ['id', 'booking_ref', 'tenantId', 'tenant_name', 'transport_company', 'license_plate', 'loading_bay', 'slot_start', 'slot_end', 'status'];

router.get('/summary', verifyToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const window = todayWindow();

    if (role === 'FM') {
      const attendance = await attendanceForUsers();
      const [cameraTotal, camerasOnline, camerasOffline, urgentDetectionAlerts, todayBookings, activeVehicles, openIncidents, openSupportTickets] = await Promise.all([
        safeCount(Camera),
        safeCount(Camera, { where: { status: 'Online' } }),
        safeCount(Camera, { where: { status: 'Offline' } }),
        safeCount(DetectionAlert, { where: { severity: { [Op.in]: HIGH_SEVERITIES }, status: { [Op.in]: ACTIVE_ALERT_STATUSES } } }),
        safeCount(Booking, { where: { slot_start: { [Op.gte]: window.start, [Op.lt]: window.end } } }),
        safeCount(Booking, { where: { status: { [Op.in]: ACTIVE_BOOKING_STATUSES } } }),
        safeCount(IncidentLog, { where: { [Op.or]: [{ resolutionStatus: { [Op.in]: OPEN_INCIDENT_STATUSES } }, { status: { [Op.in]: OPEN_INCIDENT_STATUSES } }] } }),
        safeCount(SupportTicket, { where: { status: { [Op.in]: OPEN_TICKET_STATUSES } } })
      ]);

      const recentHighPriorityAlerts = DetectionAlert?.findAll ? await DetectionAlert.findAll({
        where: { severity: { [Op.in]: HIGH_SEVERITIES }, status: { [Op.in]: ACTIVE_ALERT_STATUSES } },
        attributes: ['id', 'zone_name', 'camera_location', 'status', 'object_class', 'alert_type', 'severity', 'source', 'occurred_at', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: 5
      }) : [];

      // Aggregate-only operational analytics (per-day High/Critical counts + busiest
      // zones over the last 7 SG days). FM-only; no individual alert rows, no personal
      // or biometric fields. Failure here must never take down the whole summary.
      let analytics = { alertTrend7Days: [], topAlertZones7Days: [] };
      try {
        analytics = await buildAlertAnalytics(DetectionAlert);
      } catch (analyticsErr) {
        console.error('Dashboard analytics error:', analyticsErr);
      }

      return res.json({
        role: 'FM',
        summary: {
          cameras: { total: cameraTotal, online: camerasOnline, offline: camerasOffline },
          attendance: {
            peopleCurrentlyOnSite: attendance.today.onSite,
            checkedInToday: attendance.today.checkedIn,
            checkedOutToday: attendance.today.checkedOut
          },
          urgentDetectionAlerts,
          todaysLoadingBayBookings: todayBookings,
          activeOrArrivedVehicles: activeVehicles,
          openIncidents,
          openSupportTickets
        },
        recentHighPriorityAlerts: recentHighPriorityAlerts.map((alert) => (typeof alert.toJSON === 'function' ? alert.toJSON() : alert)),
        analytics
      });
    }

    if (role === 'Tenant') {
      const attendance = await attendanceForUsers({ role: 'Staff', managerId: userId });
      const [staffTotal, todayBookings, openSupportCases] = await Promise.all([
        safeCount(User, { where: { role: 'Staff', managerId: userId } }),
        safeCount(Booking, { where: { tenantId: userId, slot_start: { [Op.gte]: window.start, [Op.lt]: window.end } } }),
        safeCount(SupportTicket, { where: { userId, status: { [Op.in]: OPEN_TICKET_STATUSES } } })
      ]);

      const nextBooking = Booking?.findOne ? await Booking.findOne({
        where: { tenantId: userId, status: { [Op.notIn]: ['Completed', 'Cancelled'] }, slot_start: { [Op.gte]: new Date() } },
        attributes: safeBookingFields,
        order: [['slot_start', 'ASC']]
      }) : null;

      const recentActivity = Booking?.findAll ? await Booking.findAll({
        where: { tenantId: userId },
        attributes: safeBookingFields,
        order: [['updatedAt', 'DESC']],
        limit: 5
      }) : [];

      return res.json({
        role: 'Tenant',
        summary: {
          staffTotal,
          staffCurrentlyOnSite: attendance.today.onSite,
          staffLateToday: attendance.today.late,
          todaysOwnBookings: todayBookings,
          ownOpenSupportCases: openSupportCases
        },
        nextBooking: nextBooking ? (typeof nextBooking.toJSON === 'function' ? nextBooking.toJSON() : nextBooking) : null,
        recentActivity: recentActivity.map((item) => (typeof item.toJSON === 'function' ? item.toJSON() : item))
      });
    }

    const attendance = await attendanceForUsers({ id: userId });
    const ownToday = attendance.today.summaries[0] || null;
    const account = User?.findByPk ? await User.findByPk(userId, { attributes: ['id', 'isEnrolled'] }) : null;

    return res.json({
      role: 'Staff',
      summary: {
        currentClockStatus: ownToday?.currentStatus || 'OUT',
        todayFirstClockIn: ownToday?.firstCheckIn || null,
        todayLatestClockOut: ownToday?.latestCheckOut || null,
        punctuality: ownToday?.punctuality || 'NO_IN',
        faceIdEnrolled: Boolean(account?.isEnrolled)
      },
      nextRelevantBooking: null,
      unavailable: {
        nextRelevantBooking: 'No staff-to-booking ownership link exists in the current schema.'
      },
      quickLinks: [
        { label: 'My Attendance', to: '/attendance' },
        { label: 'Logistics', to: '/logistics' },
        { label: 'Settings', to: '/settings' }
      ]
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard summary.' });
  }
});

module.exports = router;