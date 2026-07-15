const { Op } = require('sequelize');
const { getSingaporeWindow, sgDateKey } = require('./attendanceSummary');

// Operational Object-Detection analytics for the FM dashboard. Everything here is
// aggregate-only: it returns per-day High/Critical counts and per-zone alert totals,
// never individual alert rows and never any personal/biometric field. Singapore
// calendar days are used throughout (reusing the attendance summary's SG helpers) so
// the charts line up with how the factory actually reports its days.

const HIGH = 'High';
const CRITICAL = 'Critical';
const UNASSIGNED_ZONE = 'Unassigned Zone';
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_ZONE_LIMIT = 5;
const TREND_DAYS = 7;

// "2026-07-08" -> "8 Jul". Built from the date-key parts at noon UTC so the label is
// purely calendar-based and never shifts across a timezone boundary.
const labelFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const labelForKey = (dateKey) => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return String(dateKey);
  return labelFormatter.format(new Date(Date.UTC(y, m - 1, d, 12)));
};

// The seven Singapore calendar day-keys ending today (chronological), plus the
// matching UTC [start, end) window so a single indexed query can fetch the rows.
const sevenDayContext = (now) => {
  const window = getSingaporeWindow({ filter: 'last7', now });
  const [y, m, d] = window.startKey.split('-').map(Number);
  let cursor = Date.UTC(y, m - 1, d, 12); // noon avoids any edge rounding; SG has no DST
  const keys = [];
  for (let i = 0; i < TREND_DAYS; i += 1) {
    const dt = new Date(cursor);
    keys.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`);
    cursor += DAY_MS;
  }
  return { keys, window };
};

// Aggregates the last seven Singapore days of DetectionAlerts into:
//   alertTrend7Days   - High/Critical counts per day (all seven days always present)
//   topAlertZones7Days - the five busiest zones by total alert count, descending
// Uses DetectionAlert.severity, DetectionAlert.occurred_at (falling back to createdAt
// when occurred_at is null), and DetectionAlert.zone_name.
const buildAlertAnalytics = async (DetectionAlert, { now = new Date() } = {}) => {
  const { keys, window } = sevenDayContext(now);
  const trend = new Map(keys.map((key) => [key, { high: 0, critical: 0 }]));

  let alerts = [];
  if (DetectionAlert && typeof DetectionAlert.findAll === 'function') {
    // occurred_at drives the day when present; rows without it fall back to createdAt.
    // Both branches are constrained to the same 7-day window so the query stays indexed.
    alerts = await DetectionAlert.findAll({
      where: {
        [Op.or]: [
          { occurred_at: { [Op.gte]: window.start, [Op.lt]: window.end } },
          { occurred_at: null, createdAt: { [Op.gte]: window.start, [Op.lt]: window.end } }
        ]
      },
      attributes: ['severity', 'zone_name', 'occurred_at', 'createdAt']
    }) || [];
  }

  const zoneCounts = new Map();
  for (const alert of alerts) {
    const row = typeof alert?.toJSON === 'function' ? alert.toJSON() : alert;
    if (!row) continue;

    const when = row.occurred_at || row.createdAt;
    const dayKey = when ? sgDateKey(when) : null;
    if (dayKey && trend.has(dayKey)) {
      if (row.severity === CRITICAL) trend.get(dayKey).critical += 1;
      else if (row.severity === HIGH) trend.get(dayKey).high += 1;
    }

    // "Unassigned Zone" only stands in for a real alert that genuinely has no zone_name.
    const zoneName = (row.zone_name && String(row.zone_name).trim())
      ? String(row.zone_name).trim()
      : UNASSIGNED_ZONE;
    zoneCounts.set(zoneName, (zoneCounts.get(zoneName) || 0) + 1);
  }

  const alertTrend7Days = keys.map((key) => ({
    date: key,
    label: labelForKey(key),
    high: trend.get(key).high,
    critical: trend.get(key).critical
  }));

  const topAlertZones7Days = [...zoneCounts.entries()]
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => (b.count - a.count) || a.zone.localeCompare(b.zone))
    .slice(0, TOP_ZONE_LIMIT);

  return { alertTrend7Days, topAlertZones7Days };
};

module.exports = { buildAlertAnalytics, UNASSIGNED_ZONE, TOP_ZONE_LIMIT, TREND_DAYS };
