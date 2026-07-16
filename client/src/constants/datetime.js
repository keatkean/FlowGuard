// Singapore-time timestamp helpers for security/attendance UI.
// Always formats in Asia/Singapore with the en-SG locale, regardless of the
// viewer's machine timezone.

const SG_TIME_ZONE = 'Asia/Singapore';

// YYYY-MM-DD calendar key of a date *in Singapore time* (en-CA gives ISO order).
const sgDateKey = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: SG_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);

const sgTime = (date) =>
  date
    .toLocaleTimeString('en-SG', {
      timeZone: SG_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

const sgDate = (date) =>
  date.toLocaleDateString('en-SG', {
    timeZone: SG_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric',
  });

/**
 * Compact Singapore-time label: "Today, 9:50 PM", "Yesterday, 4:12 PM",
 * or "09 Jul 2026, 9:50 PM". `now` is injectable for tests.
 * Returns '' for missing/invalid input — callers fall back to legacy fields.
 */
export const formatSingaporeTimestamp = (value, now = new Date()) => {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';

  const key = sgDateKey(date);
  const todayKey = sgDateKey(now);
  const yesterdayKey = sgDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  if (key === todayKey) return `Today, ${sgTime(date)}`;
  if (key === yesterdayKey) return `Yesterday, ${sgTime(date)}`;
  return `${sgDate(date)}, ${sgTime(date)}`;
};

/** Full exact Singapore timestamp, e.g. "09 Jul 2026, 9:50:12 PM" (for tooltips/details). */
export const formatSingaporeFull = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const time = date
    .toLocaleTimeString('en-SG', {
      timeZone: SG_TIME_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  return `${sgDate(date)}, ${time}`;
};

/** True if the timestamp falls on today's Singapore calendar date. */
export const isSingaporeToday = (value, now = new Date()) => {
  if (!value) return false;
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  return sgDateKey(date) === sgDateKey(now);
};

/** True if the timestamp falls on yesterday's Singapore calendar date. */
export const isSingaporeYesterday = (value, now = new Date()) => {
  if (!value) return false;
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  return sgDateKey(date) === sgDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
};
