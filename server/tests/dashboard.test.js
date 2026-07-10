const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

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
const staff = (id, managerId, name = `Staff ${id}`) => ({ id, name, role: 'Staff', managerId });
const rec = (user, type, timestamp) => ({ userId: user.id, type, timestamp, User: user });

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-07-10T03:00:00.000Z'));
  jest.clearAllMocks();
  mockUser.findByPk.mockImplementation((id) => Promise.resolve(authAccount(Number(id), Number(id) === 50 ? 'Tenant' : Number(id) === 60 ? 'Staff' : 'FM')));
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

afterEach(() => {
  jest.useRealTimers();
});

describe('GET /api/dashboard/summary', () => {
  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });

  test('FM response shape includes aggregates and no individual late performance', async () => {
    mockAttendance.findAll.mockResolvedValue([rec(staff(10, 50, 'Late Staff'), 'IN', '2026-07-10T01:30:00.000Z')]);
    mockCamera.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    mockDetectionAlert.count.mockResolvedValue(4);
    mockBooking.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    mockIncidentLog.count.mockResolvedValue(1);
    mockSupportTicket.count.mockResolvedValue(6);

    const res = await request(app).get('/api/dashboard/summary?role=Tenant').set('Authorization', `Bearer ${tokenFor('FM', 1)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('FM');
    expect(res.body.summary.cameras).toMatchObject({ total: 3, online: 2, offline: 1 });
    expect(res.body.summary.attendance.peopleCurrentlyOnSite).toBe(1);
    expect(JSON.stringify(res.body)).not.toMatch(/Late Staff|lateToday|punctuality/i);
  });

  test('client-supplied role cannot override authenticated role', async () => {
    mockUser.findByPk.mockResolvedValue(authAccount(60, 'Staff'));
    const res = await request(app)
      .get('/api/dashboard/summary?role=FM&userId=1')
      .set('Authorization', `Bearer ${tokenFor('Staff', 60)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Staff');
    expect(res.body.summary).toHaveProperty('faceIdEnrolled');
  });

  test('Tenant response is scoped to authenticated Tenant', async () => {
    mockUser.findByPk.mockResolvedValue(authAccount(50, 'Tenant'));
    mockAttendance.findAll.mockResolvedValue([rec(staff(10, 50), 'IN', '2026-07-10T01:30:00.000Z')]);
    mockUser.count.mockResolvedValue(7);
    mockBooking.count.mockResolvedValue(2);
    mockSupportTicket.count.mockResolvedValue(1);

    const res = await request(app).get('/api/dashboard/summary?tenantId=999').set('Authorization', `Bearer ${tokenFor('Tenant', 50)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Tenant');
    expect(res.body.summary).toMatchObject({ staffTotal: 7, staffCurrentlyOnSite: 1, staffLateToday: 1, todaysOwnBookings: 2, ownOpenSupportCases: 1 });
    expect(mockAttendance.findAll.mock.calls[0][0].include[0].where).toMatchObject({ role: 'Staff', managerId: 50 });
    expect(mockBooking.count.mock.calls[0][0].where).toMatchObject({ tenantId: 50 });
  });

  test('Staff response is own-scoped and includes unavailable booking state instead of fake totals', async () => {
    mockUser.findByPk.mockResolvedValue(authAccount(60, 'Staff'));
    mockAttendance.findAll.mockResolvedValue([rec(staff(60, 50), 'IN', '2026-07-10T00:30:00.000Z')]);
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokenFor('Staff', 60)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Staff');
    expect(res.body.summary.currentClockStatus).toBe('IN');
    expect(res.body.nextRelevantBooking).toBeNull();
    expect(res.body.unavailable.nextRelevantBooking).toMatch(/No staff-to-booking/i);
    expect(mockAttendance.findAll.mock.calls[0][0].include[0].where).toMatchObject({ id: 60 });
  });
});