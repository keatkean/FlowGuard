const { Op } = require('sequelize');

const SG_TIME_ZONE = 'Asia/Singapore';
const SHIFT_START_HOUR = 9;
const SG_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const datePartsFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: SG_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const getSingaporeParts = (value) => {
  const parts = datePartsFormatter.formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second)
  };
};

const sgDateKey = (value) => {
  const { year, month, day } = getSingaporeParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseDateKey = (dateKey) => {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const dateKeyFromParts = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const addDaysToDateKey = (dateKey, days) => {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS;
  const shifted = new Date(utcMs);
  return dateKeyFromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  });
};

const sgStartUtcForDateKey = (dateKey) => {
  const parts = parseDateKey(dateKey);
  if (!parts) throw new Error(`Invalid Singapore date: ${dateKey}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - SG_OFFSET_MS);
};

const getSingaporeWindow = ({ filter = 'today', date, now = new Date() } = {}) => {
  const todayKey = sgDateKey(now);
  let startKey = todayKey;
  let days = 1;

  if (filter === 'yesterday') {
    startKey = addDaysToDateKey(todayKey, -1);
  } else if (filter === 'last7') {
    startKey = addDaysToDateKey(todayKey, -6);
    days = 7;
  } else if (filter === 'custom' && date) {
    if (!parseDateKey(date)) throw new Error('Custom date must use YYYY-MM-DD.');
    startKey = date;
  }

  const start = sgStartUtcForDateKey(startKey);
  const end = new Date(start.getTime() + days * DAY_MS);
  return { filter, start, end, startKey, endExclusiveKey: addDaysToDateKey(startKey, days), todayKey };
};

const isLateCheckIn = (timestamp) => {
  const parts = getSingaporeParts(timestamp);
  return parts.hour > SHIFT_START_HOUR || (parts.hour === SHIFT_START_HOUR && (parts.minute > 0 || parts.second >= 0));
};

const toPlain = (record) => (typeof record?.toJSON === 'function' ? record.toJSON() : record);

const safeUser = (user) => user ? {
  id: user.id,
  name: user.name,
  role: user.role,
  managerId: user.managerId
} : null;

const deriveDailySummaries = (attendanceRecords = []) => {
  const summaries = new Map();
  const sorted = attendanceRecords.map(toPlain).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sorted.forEach((record) => {
    const user = safeUser(record.User || record.user);
    const userId = record.userId || user?.id;
    if (!userId || !record.timestamp) return;

    const date = sgDateKey(record.timestamp);
    const key = `${userId}:${date}`;
    if (!summaries.has(key)) {
      summaries.set(key, {
        user,
        userId,
        date,
        firstCheckIn: null,
        latestCheckOut: null,
        currentStatus: 'OUT',
        punctuality: 'NO_IN',
        scanCount: 0
      });
    }

    const summary = summaries.get(key);
    const timestamp = new Date(record.timestamp).toISOString();
    summary.scanCount += 1;
    summary.currentStatus = record.type === 'IN' ? 'IN' : 'OUT';

    if (record.type === 'IN' && (!summary.firstCheckIn || new Date(timestamp) < new Date(summary.firstCheckIn))) {
      summary.firstCheckIn = timestamp;
      summary.punctuality = isLateCheckIn(timestamp) ? 'LATE' : 'ON_TIME';
    }

    if (record.type === 'OUT' && (!summary.latestCheckOut || new Date(timestamp) > new Date(summary.latestCheckOut))) {
      summary.latestCheckOut = timestamp;
    }
  });

  return Array.from(summaries.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(a.user?.name || '').localeCompare(String(b.user?.name || ''));
  });
};

const summarizeForDate = (dailySummaries, dateKey) => {
  const visible = dailySummaries.filter((summary) => summary.date === dateKey);
  return {
    summaries: visible,
    onSite: visible.filter((summary) => summary.currentStatus === 'IN').length,
    checkedIn: visible.filter((summary) => Boolean(summary.firstCheckIn)).length,
    checkedOut: visible.filter((summary) => Boolean(summary.latestCheckOut)).length,
    onTime: visible.filter((summary) => summary.punctuality === 'ON_TIME').length,
    late: visible.filter((summary) => summary.punctuality === 'LATE').length
  };
};

const buildAttendanceWhere = (window) => ({
  timestamp: { [Op.gte]: window.start, [Op.lt]: window.end }
});

module.exports = {
  SG_TIME_ZONE,
  SHIFT_START_HOUR,
  getSingaporeWindow,
  sgDateKey,
  deriveDailySummaries,
  summarizeForDate,
  buildAttendanceWhere
};