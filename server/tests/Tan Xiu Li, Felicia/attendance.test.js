const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockAttendance = { findAll: jest.fn() };
jest.mock('../../models', () => ({ Attendance: mockAttendance, User: {} }));

process.env.APP_SECRET = 'test-secret';

const attendanceRouter = require('../../routes/attendance');

const app = express();
app.use(express.json());
app.use('/api/attendance', attendanceRouter);

const tokenFor = (role, id) => jwt.sign({ id, role }, process.env.APP_SECRET);
const staff = (id, managerId, name = `Staff ${id}`) => ({ id, name, role: 'Staff', managerId });
const rec = (user, type, timestamp) => ({ userId: user.id, type, timestamp, User: user });

describe('GET /api/attendance/logs - Phase 2 role-aware summaries', () => {
  beforeEach(() => jest.clearAllMocks());

  test('no token -> 401', async () => {
    const res = await request(app).get('/api/attendance/logs');
    expect(res.status).toBe(401);
  });

  test('FM receives aggregates without individual late details', async () => {
    mockAttendance.findAll.mockResolvedValue([
      rec(staff(1, 50, 'Late One'), 'IN', '2026-07-10T01:30:00.000Z')
    ]);
    const res = await request(app).get('/api/attendance/logs?filter=today&now=2026-07-10T03:00:00.000Z').set('Authorization', `Bearer ${tokenFor('FM', 1)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('FM');
    expect(res.body.summary).toMatchObject({ peopleOnSite: 1, checkedInToday: 1, checkedOutToday: 0 });
    expect(res.body.records).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/Late One|LATE|lateToday/i);
  });

  test('Tenant receives only linked Staff and cards derive from same filtered summary set', async () => {
    const linkedA = staff(10, 50, 'Linked Late A');
    const linkedB = staff(11, 50, 'Linked Late B');
    mockAttendance.findAll.mockResolvedValue([
      rec(linkedA, 'IN', '2026-07-10T01:30:00.000Z'),
      rec(linkedB, 'IN', '2026-07-10T02:00:00.000Z')
    ]);
    const res = await request(app).get('/api/attendance/logs?filter=today&now=2026-07-10T03:00:00.000Z').set('Authorization', `Bearer ${tokenFor('Tenant', 50)}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.lateToday).toBe(2);
    expect(res.body.records.filter((r) => r.punctuality === 'LATE')).toHaveLength(2);
    expect(mockAttendance.findAll.mock.calls[0][0].include[0].where).toMatchObject({ role: 'Staff', managerId: 50 });
  });

  test('Tenant cannot retrieve another Tenant Staff through client-supplied parameters', async () => {
    mockAttendance.findAll.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/attendance/logs?filter=today&tenantId=999&userId=999&role=FM')
      .set('Authorization', `Bearer ${tokenFor('Tenant', 50)}`);
    expect(res.status).toBe(200);
    expect(mockAttendance.findAll.mock.calls[0][0].include[0].where).toMatchObject({ role: 'Staff', managerId: 50 });
  });

  test('Staff receives only own records', async () => {
    const self = staff(60, 50, 'Own Staff');
    mockAttendance.findAll.mockResolvedValue([rec(self, 'IN', '2026-07-10T00:30:00.000Z')]);
    const res = await request(app).get('/api/attendance/logs?filter=today&now=2026-07-10T03:00:00.000Z').set('Authorization', `Bearer ${tokenFor('Staff', 60)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Staff');
    expect(res.body.records).toHaveLength(1);
    expect(mockAttendance.findAll.mock.calls[0][0].where).toMatchObject({ userId: 60 });
    expect(res.body.summary.punctuality).toBe('ON_TIME');
  });
});