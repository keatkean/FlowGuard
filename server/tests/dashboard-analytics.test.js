const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { buildAlertAnalytics } = require('../services/dashboardAnalytics');

// Fixed "now": 2026-07-10T03:00Z == 2026-07-10 11:00 Singapore. The seven SG days are
// therefore 2026-07-04 .. 2026-07-10 inclusive.
const NOW = new Date('2026-07-10T03:00:00.000Z');

const modelWith = (rows) => ({ findAll: jest.fn().mockResolvedValue(rows) });

describe('buildAlertAnalytics (unit)', () => {
  test('returns seven chronological Singapore dates, filling zero-count days', async () => {
    const { alertTrend7Days } = await buildAlertAnalytics(modelWith([]), { now: NOW });
    expect(alertTrend7Days).toHaveLength(7);
    expect(alertTrend7Days.map((d) => d.date)).toEqual([
      '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'
    ]);
    // Ascending order + every day present with zeroed counts.
    alertTrend7Days.forEach((d) => {
      expect(d).toMatchObject({ high: 0, critical: 0 });
      expect(typeof d.label).toBe('string');
    });
  });

  test('separates High and Critical counts per day and uses createdAt when occurred_at is null', async () => {
    const rows = [
      { severity: 'High', zone_name: 'Loading Bay', occurred_at: '2026-07-10T02:00:00.000Z', createdAt: '2026-07-10T02:00:00.000Z' },
      { severity: 'Critical', zone_name: 'Loading Bay', occurred_at: '2026-07-10T05:00:00.000Z', createdAt: '2026-07-10T05:00:00.000Z' },
      { severity: 'High', zone_name: 'Cold Store', occurred_at: '2026-07-08T04:00:00.000Z', createdAt: '2026-07-08T04:00:00.000Z' },
      { severity: 'Medium', zone_name: 'Loading Bay', occurred_at: '2026-07-09T04:00:00.000Z', createdAt: '2026-07-09T04:00:00.000Z' },
      { severity: 'Critical', zone_name: null, occurred_at: null, createdAt: '2026-07-07T04:00:00.000Z' }
    ];
    const { alertTrend7Days } = await buildAlertAnalytics(modelWith(rows), { now: NOW });
    const byDate = Object.fromEntries(alertTrend7Days.map((d) => [d.date, d]));
    expect(byDate['2026-07-10']).toMatchObject({ high: 1, critical: 1 });
    expect(byDate['2026-07-08']).toMatchObject({ high: 1, critical: 0 });
    expect(byDate['2026-07-07']).toMatchObject({ high: 0, critical: 1 }); // fell back to createdAt
    expect(byDate['2026-07-09']).toMatchObject({ high: 0, critical: 0 }); // Medium is not counted in the trend
  });

  test('returns top alert zones in descending order, all severities counted, unassigned labelled', async () => {
    const rows = [
      { severity: 'High', zone_name: 'Loading Bay', occurred_at: '2026-07-10T02:00:00.000Z' },
      { severity: 'Critical', zone_name: 'Loading Bay', occurred_at: '2026-07-10T05:00:00.000Z' },
      { severity: 'Medium', zone_name: 'Loading Bay', occurred_at: '2026-07-09T04:00:00.000Z' },
      { severity: 'High', zone_name: 'Cold Store', occurred_at: '2026-07-08T04:00:00.000Z' },
      { severity: 'Critical', zone_name: null, occurred_at: '2026-07-07T04:00:00.000Z' }
    ];
    const { topAlertZones7Days } = await buildAlertAnalytics(modelWith(rows), { now: NOW });
    expect(topAlertZones7Days[0]).toEqual({ zone: 'Loading Bay', count: 3 });
    expect(topAlertZones7Days.map((z) => z.count)).toEqual([...topAlertZones7Days.map((z) => z.count)].sort((a, b) => b - a));
    expect(topAlertZones7Days.find((z) => z.zone === 'Unassigned Zone')).toEqual({ zone: 'Unassigned Zone', count: 1 });
  });

  test('limits top zones to five', async () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].flatMap((z, i) =>
      Array.from({ length: 7 - i }, () => ({ severity: 'High', zone_name: `Zone ${z}`, occurred_at: '2026-07-10T02:00:00.000Z' }))
    );
    const { topAlertZones7Days } = await buildAlertAnalytics(modelWith(rows), { now: NOW });
    expect(topAlertZones7Days).toHaveLength(5);
    expect(topAlertZones7Days[0].zone).toBe('Zone A'); // most alerts
  });

  test('empty database yields seven zeroed days and no zones', async () => {
    const { alertTrend7Days, topAlertZones7Days } = await buildAlertAnalytics(modelWith([]), { now: NOW });
    expect(alertTrend7Days).toHaveLength(7);
    expect(alertTrend7Days.every((d) => d.high === 0 && d.critical === 0)).toBe(true);
    expect(topAlertZones7Days).toEqual([]);
  });
});

// --- Route wiring: FM gets analytics, Tenant/Staff never get org-wide analytics -------
const mockAttendance = { findAll: jest.fn() };
const mockUser = { findByPk: jest.fn(), count: jest.fn() };
const mockCamera = { count: jest.fn() };
const mockDetectionAlert = { count: jest.fn(), findAll: jest.fn() };
const mockBooking = { count: jest.fn(), findOne: jest.fn(), findAll: jest.fn() };
const mockIncidentLog = { count: jest.fn() };
const mockSupportTicket = { count: jest.fn() };
const mockSecurityLog = { findAll: jest.fn() };

jest.mock('../models', () => ({
  Attendance: mockAttendance,
  User: mockUser,
  Camera: mockCamera,
  DetectionAlert: mockDetectionAlert,
  Booking: mockBooking,
  IncidentLog: mockIncidentLog,
  SupportTicket: mockSupportTicket,
  SecurityLog: mockSecurityLog
}));

process.env.APP_SECRET = 'test-secret';
const dashboardRouter = require('../routes/dashboard');
const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

const tokenFor = (role, id) => jwt.sign({ id, role, tokenVersion: 0 }, process.env.APP_SECRET);
const authAccount = (id, role) => ({ id, role, isActive: true, tokenVersion: 0, isEnrolled: true });

describe('GET /api/dashboard/summary analytics wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAttendance.findAll.mockResolvedValue([]);
    mockCamera.count.mockResolvedValue(0);
    mockDetectionAlert.count.mockResolvedValue(0);
    mockDetectionAlert.findAll.mockResolvedValue([]);
    mockBooking.count.mockResolvedValue(0);
    mockBooking.findOne.mockResolvedValue(null);
    mockBooking.findAll.mockResolvedValue([]);
    mockIncidentLog.count.mockResolvedValue(0);
    mockSupportTicket.count.mockResolvedValue(0);
    mockUser.count.mockResolvedValue(0);
  });

  test('FM receives seven-day trend and top-zones analytics', async () => {
    mockUser.findByPk.mockResolvedValue(authAccount(1, 'FM'));
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokenFor('FM', 1)}`);
    expect(res.status).toBe(200);
    expect(res.body.analytics).toBeDefined();
    expect(res.body.analytics.alertTrend7Days).toHaveLength(7);
    expect(Array.isArray(res.body.analytics.topAlertZones7Days)).toBe(true);
  });

  test('Tenant does not receive organisation-wide analytics', async () => {
    mockUser.findByPk.mockResolvedValue(authAccount(50, 'Tenant'));
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokenFor('Tenant', 50)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Tenant');
    expect(res.body.analytics).toBeUndefined();
  });

  test('Staff does not receive organisation-wide analytics', async () => {
    mockUser.findByPk.mockResolvedValue(authAccount(60, 'Staff'));
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokenFor('Staff', 60)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Staff');
    expect(res.body.analytics).toBeUndefined();
  });
});
