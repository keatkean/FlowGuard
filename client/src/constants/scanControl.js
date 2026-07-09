// Recognition scan tuning + control for Gate Scanner / V-Patrol.
// Performance-tuned WITHOUT weakening security: liveness verification, the
// no-overlap guard, and Pi snapshot fallback logic all stay in place.

// Scan cadence (was 1200 ms) and target-lock delay (was 1800 ms).
export const SCAN_INTERVAL_MS = 1000;
export const TARGET_LOCK_MS = 600;

// Recognition capture width (was 420 px) — smaller frames cut encode/upload/
// inference time; InsightFace still detects comfortably at this size.
export const CAPTURE_MAX_WIDTH = 352;

// When Node/FastAPI is unreachable, pause scanning briefly instead of flooding
// the endpoint every second. The camera preview keeps running.
export const AI_ERROR_BACKOFF_MS = 5000;

export const SERVICE_UNAVAILABLE_MSG = 'Recognition service unavailable — retrying shortly…';

/**
 * Scan gate: enforces the no-overlapping-request guard and the AI-error
 * retry backoff. One instance per scanner page (kept in a ref).
 */
export const createScanGate = () => {
  let busy = false;
  let backoffUntil = 0;

  return {
    /** True when a new scan may start (not busy, not backing off). */
    canScan(now = Date.now()) {
      return !busy && now >= backoffUntil;
    },
    begin() { busy = true; },
    end() { busy = false; },
    /** Pause scanning after a recognition-service failure. */
    applyBackoff(ms = AI_ERROR_BACKOFF_MS, now = Date.now()) {
      backoffUntil = now + ms;
    },
    clearBackoff() { backoffUntil = 0; },
    isBackingOff(now = Date.now()) {
      return now < backoffUntil;
    },
  };
};

/** Millisecond stopwatch: `const t = startTimer(); ... const ms = t();` */
export const startTimer = () => {
  const startedAt = Date.now();
  return () => Date.now() - startedAt;
};

/**
 * Dev-only timing telemetry. Logs durations ONLY — never images, frames,
 * or biometric data. No-op in production builds.
 */
export const logScanTimings = ({ captureMs, apiMs, totalMs, serverTimings }) => {
  if (!import.meta.env.DEV) return;
  const parts = [
    captureMs != null ? `capture(Pi/webcam) ${captureMs}ms` : null,
    apiMs != null ? `frontend→Node ${apiMs}ms` : null,
    serverTimings?.nodeToAiMs != null ? `Node→FastAPI ${serverTimings.nodeToAiMs}ms` : null,
    serverTimings?.inferenceMs != null ? `inference ${serverTimings.inferenceMs}ms` : null,
    totalMs != null ? `total ${totalMs}ms` : null,
  ].filter(Boolean);
  console.debug(`[recognition timing] ${parts.join(' | ')}`);
};
