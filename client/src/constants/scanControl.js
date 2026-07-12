// Recognition scan tuning + control for Gate Scanner / V-Patrol.
// Performance-tuned WITHOUT weakening security: liveness verification, the
// no-overlap guard, and Pi snapshot fallback logic all stay in place.

// Scan cadence (was 1200 ms) and target-lock delay (was 1800 ms).
export const SCAN_INTERVAL_MS = 1000;
export const TARGET_LOCK_MS = 600;

// Recognition capture width (was 420 px) — smaller frames cut encode/upload/
// inference time; InsightFace still detects comfortably at this size.
export const CAPTURE_MAX_WIDTH = 352;

// JPEG quality for recognition frames. Never full quality (payload size), but
// high enough that compression artefacts don't degrade face embeddings.
export const CAPTURE_JPEG_QUALITY = 0.62;

// --- Lightweight tracking loop (face box + head-turn sampling) --------------
// Independent of the full recognition loop: it calls the detection-only
// /api/facial-recognition/track endpoint, which returns no identity data.

// Tracking cadence — fast enough for a live-feeling box, slow enough to keep
// one request in flight at a time on CPU-only detection.
export const TRACK_INTERVAL_MS = 250;

// Tracking frames are small + heavily compressed: the detector only needs
// coarse geometry, not embedding-grade image quality.
export const TRACK_MAX_WIDTH = 256;
export const TRACK_JPEG_QUALITY = 0.5;

// The box survives one brief missed detection, then clears after this long
// without a face so a stale box never hovers over an empty frame.
export const BOX_CLEAR_TIMEOUT_MS = 800;

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

/** Wall-clock milliseconds (kept out of component bodies for hook purity). */
export const nowMs = () => Date.now();

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

/**
 * Dev-only tracking-loop telemetry: capture/request/detector durations ONLY —
 * never images, frames, or biometric data. No-op in production builds.
 */
export const logTrackingTimings = ({ captureMs, requestMs, inferenceMs }) => {
  if (!import.meta.env.DEV) return;
  const parts = [
    captureMs != null ? `capture ${captureMs}ms` : null,
    requestMs != null ? `request ${requestMs}ms` : null,
    inferenceMs != null ? `detector ${inferenceMs}ms` : null,
  ].filter(Boolean);
  console.debug(`[tracking timing] ${parts.join(' | ')}`);
};

/**
 * Dev-only head-turn liveness telemetry: baseline/current/delta ratios and the
 * consecutive-valid-sample count ONLY — never images or biometric templates.
 */
export const logLivenessTelemetry = ({ baseline, current, delta, consecutive }) => {
  if (!import.meta.env.DEV) return;
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(3) : 'n/a');
  console.debug(
    `[liveness] baseline ${fmt(baseline)} | current ${fmt(current)} | delta ${fmt(delta)} | consecutive ${consecutive ?? 0}`
  );
};
