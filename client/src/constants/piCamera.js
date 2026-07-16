// Raspberry Pi Camera Module 3 — gate camera node configuration.
// URLs come from Vite env (VITE_PI_CAMERA_STREAM_URL / VITE_PI_CAMERA_SNAPSHOT_URL)
// with demo-network fallbacks so the kiosk works out of the box.

export const PI_CAMERA_STREAM_URL =
  import.meta.env.VITE_PI_CAMERA_STREAM_URL || "http://172.20.10.4:8081/video_feed";

export const PI_CAMERA_SNAPSHOT_URL =
  import.meta.env.VITE_PI_CAMERA_SNAPSHOT_URL || "http://172.20.10.4:8081/snapshot";

export const CAMERA_SOURCES = {
  PI: "pi",
  WEBCAM: "webcam",
};

export const CAMERA_STATUS_MESSAGES = {
  PI_CONNECTED: "Pi Gate Camera connected",
  PI_UNAVAILABLE: "Pi Camera unavailable — using laptop webcam fallback",
  WEBCAM_ACTIVE: "Laptop webcam active",
};

// While the Pi is known-unavailable, don't re-probe it on every recognition
// cycle — cache the failure and only allow a fresh probe after this cooldown.
// Laptop-webcam recognition is never blocked by a pending Pi timeout.
export const PI_UNAVAILABLE_COOLDOWN_MS = 10000;

let piUnavailableUntil = 0;

/** Record a Pi failure so probes are throttled for the cooldown window. */
export function markPiUnavailable(now = Date.now()) {
  piUnavailableUntil = now + PI_UNAVAILABLE_COOLDOWN_MS;
}

/** True while a recent Pi failure is cached (probing would be wasted time). */
export function isPiInCooldown(now = Date.now()) {
  return now < piUnavailableUntil;
}

/** Clear the cached Pi failure (tests / explicit user retry). */
export function resetPiAvailabilityCache() {
  piUnavailableUntil = 0;
}

/**
 * Cooldown-aware reachability check: while a recent Pi failure is cached,
 * returns false immediately WITHOUT a network probe, so scanner pages fall
 * back to the laptop webcam fast instead of waiting out a Pi timeout.
 */
export async function isPiCameraReachableCached(now = Date.now()) {
  if (isPiInCooldown(now)) return false;
  const reachable = await isPiCameraReachable();
  if (!reachable) markPiUnavailable();
  else piUnavailableUntil = 0;
  return reachable;
}

/**
 * Probe the Pi snapshot endpoint to decide if the gate camera is reachable.
 * Any network error, CORS block, or timeout counts as unreachable so the
 * caller can fall back to the laptop webcam.
 */
export async function isPiCameraReachable(timeoutMs = 3500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${PI_CAMERA_SNAPSHOT_URL}?probe=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch one frame from the Pi snapshot endpoint as an ImageBitmap that can be
 * drawn onto the existing capture canvas (blob-backed, so the canvas is not
 * tainted and toDataURL keeps working for the recognition API).
 */
export async function fetchPiSnapshotBitmap(timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PI_CAMERA_SNAPSHOT_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Pi snapshot HTTP ${res.status}`);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } finally {
    clearTimeout(timer);
  }
}
