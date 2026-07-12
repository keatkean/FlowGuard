// Server-owned security audit logging for facial-recognition outcomes.
// Stores audit metadata only — never snapshots or biometric template data.
const { randomUUID } = require('crypto');
const { SecurityLog } = require('../models');

// Repeated events at ~1 scan/sec would flood the table: one log per
// (event, identity, location) per cooldown window.
const LOG_COOLDOWN_MS = 30 * 1000;
const recentLogKeys = new Map(); // key -> last logged epoch ms

const shouldWriteLog = (key, now = Date.now()) => {
  const last = recentLogKeys.get(key) || 0;
  if (now - last < LOG_COOLDOWN_MS) return false;
  recentLogKeys.set(key, now);
  // Opportunistic cleanup so the map never grows unbounded.
  if (recentLogKeys.size > 500) {
    for (const [k, t] of recentLogKeys) {
      if (now - t > LOG_COOLDOWN_MS) recentLogKeys.delete(k);
    }
  }
  return true;
};

// Test hook — clears the dedup window.
const resetLogCooldowns = () => recentLogKeys.clear();

// Audit information only — never the snapshot or protected biometric template.
// Returns the created row (for callers that must echo the real database record)
// or null on failure.
const createSecurityLogRecord = async ({ type, desc, severity, icon, personnelName, matchedUserId, confidence, cameraLocation }) => {
  try {
    return await SecurityLog.create({
      id: randomUUID(),
      time: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      type,
      desc,
      severity,
      icon,
      personnelName,
      matchedUserId: matchedUserId ?? null,
      confidence: confidence ?? null,
      cameraLocation: cameraLocation || 'Main Gate',
      reviewStatus: severity === 'safe' ? 'Resolved' : 'Pending Review'
    });
  } catch (err) {
    // Logging must never break the recognition/attendance response.
    console.error('Security log write failed:', err.message);
    return null;
  }
};

// Boolean wrapper kept for existing callers (/recognize, /access-event,
// attendance) — their `logged` contract stays true/false.
const createSecurityLog = async (fields) => Boolean(await createSecurityLogRecord(fields));

module.exports = { shouldWriteLog, createSecurityLog, createSecurityLogRecord, resetLogCooldowns, LOG_COOLDOWN_MS };
