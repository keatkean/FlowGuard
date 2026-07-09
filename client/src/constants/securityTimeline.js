// Presentation + filtering helpers for the V-Patrol Security Timeline.
// Works only with audit fields (event type, person, role, confidence, camera
// location, review status, timestamps) — never biometric data.
import { isSingaporeToday, isSingaporeYesterday } from './datetime';

export const ACCESS_RESULTS = {
  GRANTED: 'Granted',
  DENIED: 'Denied',
  SUSPICIOUS: 'Suspicious',
};

export const DATE_FILTERS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7days', label: 'Last 7 Days' },
  { value: 'all', label: 'All' },
];

export const EVENT_FILTERS = [
  { value: 'all', label: 'All Events' },
  { value: 'granted', label: 'Access Granted' },
  { value: 'denied', label: 'Access Denied' },
  { value: 'suspicious', label: 'Unknown / Suspicious' },
];

/** Access outcome for a security log: Granted / Denied / Suspicious. */
export const deriveAccessResult = (log) => {
  if (!log) return ACCESS_RESULTS.SUSPICIOUS;
  if (log.severity === 'safe') return ACCESS_RESULTS.GRANTED;
  const type = String(log.type || '');
  if (/suspended/i.test(type)) return ACCESS_RESULTS.DENIED;
  return ACCESS_RESULTS.SUSPICIOUS;
};

/**
 * Real event timestamp of a log. Prefers the backend's occurredAt, then
 * createdAt, then updatedAt as a final fallback. Never invents a new
 * timestamp for an existing database log — returns null when absent.
 */
export const getLogTimestamp = (log) =>
  log?.occurredAt || log?.createdAt || log?.updatedAt || null;

/**
 * Frontend filtering of loaded security logs (PoC).
 * filters: { dateRange: 'today'|'yesterday'|'7days'|'all',
 *            eventType: 'all'|'granted'|'denied'|'suspicious',
 *            search: string }  — search matches person name, role, camera location.
 */
export const filterSecurityLogs = (logs, filters = {}, now = new Date()) => {
  const { dateRange = 'all', eventType = 'all', search = '' } = filters;
  const query = search.trim().toLowerCase();

  return (logs || []).filter((log) => {
    const ts = getLogTimestamp(log);

    if (dateRange === 'today' && !isSingaporeToday(ts, now)) return false;
    if (dateRange === 'yesterday' && !isSingaporeYesterday(ts, now)) return false;
    if (dateRange === '7days') {
      if (!ts) return false;
      const time = new Date(ts).getTime();
      if (isNaN(time) || time < now.getTime() - 7 * 24 * 60 * 60 * 1000 || time > now.getTime() + 60 * 1000) {
        return false;
      }
    }

    if (eventType !== 'all') {
      const result = deriveAccessResult(log);
      if (eventType === 'granted' && result !== ACCESS_RESULTS.GRANTED) return false;
      if (eventType === 'denied' && result !== ACCESS_RESULTS.DENIED) return false;
      if (eventType === 'suspicious' && result !== ACCESS_RESULTS.SUSPICIOUS) return false;
    }

    if (query) {
      const haystack = [log.personnelName || 'Unknown Person', log.role, log.cameraLocation, log.type]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
};

export const hasActiveFilters = (filters = {}) =>
  (filters.dateRange && filters.dateRange !== 'all') ||
  (filters.eventType && filters.eventType !== 'all') ||
  Boolean(filters.search && filters.search.trim());
