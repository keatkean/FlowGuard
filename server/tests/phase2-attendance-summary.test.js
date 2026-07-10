const { deriveDailySummaries, getSingaporeWindow, summarizeForDate } = require('../services/attendanceSummary');

const staff = (id, managerId = 50, name = `Staff ${id}`) => ({ id, name, role: 'Staff', managerId });
const rec = (user, type, timestamp) => ({ userId: user.id, type, timestamp, User: user });

describe('Phase 2 attendance summary derivation', () => {
  test('two visible late daily summaries produce lateToday = 2', () => {
    const records = [
      rec(staff(1), 'IN', '2026-07-10T01:30:00.000Z'),
      rec(staff(2), 'IN', '2026-07-10T02:00:00.000Z')
    ];
    const summaries = deriveDailySummaries(records);
    expect(summarizeForDate(summaries, '2026-07-10').late).toBe(2);
  });

  test('two IN scans for the same user/date count as one daily summary', () => {
    const user = staff(1);
    const summaries = deriveDailySummaries([
      rec(user, 'IN', '2026-07-10T00:45:00.000Z'),
      rec(user, 'IN', '2026-07-10T02:30:00.000Z')
    ]);
    expect(summaries).toHaveLength(1);
  });

  test('first IN controls punctuality even when later duplicate IN is after 09:00', () => {
    const user = staff(1);
    const [summary] = deriveDailySummaries([
      rec(user, 'IN', '2026-07-10T00:45:00.000Z'),
      rec(user, 'IN', '2026-07-10T02:30:00.000Z')
    ]);
    expect(summary.punctuality).toBe('ON_TIME');
    expect(summary.firstCheckIn).toBe(new Date('2026-07-10T00:45:00.000Z').toISOString());
  });

  test('latest OUT controls the final clock-out time', () => {
    const user = staff(1);
    const [summary] = deriveDailySummaries([
      rec(user, 'IN', '2026-07-10T00:45:00.000Z'),
      rec(user, 'OUT', '2026-07-10T08:00:00.000Z'),
      rec(user, 'OUT', '2026-07-10T10:30:00.000Z')
    ]);
    expect(summary.latestCheckOut).toBe(new Date('2026-07-10T10:30:00.000Z').toISOString());
  });

  test('Singapore dates are handled near UTC midnight', () => {
    const user = staff(1);
    const [summary] = deriveDailySummaries([
      rec(user, 'IN', '2026-07-09T16:30:00.000Z')
    ]);
    expect(summary.date).toBe('2026-07-10');
  });

  test('Today, Yesterday and Last 7 Days use Singapore boundaries', () => {
    const now = new Date('2026-07-10T15:00:00.000Z');
    const today = getSingaporeWindow({ filter: 'today', now });
    const yesterday = getSingaporeWindow({ filter: 'yesterday', now });
    const last7 = getSingaporeWindow({ filter: 'last7', now });

    expect(today.start.toISOString()).toBe('2026-07-09T16:00:00.000Z');
    expect(yesterday.start.toISOString()).toBe('2026-07-08T16:00:00.000Z');
    expect(last7.start.toISOString()).toBe('2026-07-03T16:00:00.000Z');
    expect(last7.end.toISOString()).toBe('2026-07-10T16:00:00.000Z');
  });
});