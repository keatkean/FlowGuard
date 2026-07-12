// Motion-liveness head-turn challenge (Gate Scanner + V-Patrol).
//
// The old check compared one absolute single-frame ratio against fixed bands
// (e.g. ratio < 0.35 || ratio > 0.65), which stays stuck for anyone whose
// resting pose already sits mid-band. This module instead measures CHANGE from
// the person's own baseline pose using the lightweight tracking samples:
//
//   1. Baseline = median of up to three recent valid tracking ratios.
//   2. delta = currentRatio - baselineRatio.
//   3. Pass when |delta| >= LIVENESS_MOVEMENT_THRESHOLD for
//      LIVENESS_CONSECUTIVE_SAMPLES consecutive tracking samples.
//   4. Time out (fail closed) after LIVENESS_TIMEOUT_MS.
//
// This is motion liveness / head-turn verification — NOT full presentation-
// attack detection, and it never grants access by itself: the caller must run
// a final full recognition and require the same matched user ID.

export const LIVENESS_MOVEMENT_THRESHOLD = 0.08;
export const LIVENESS_CONSECUTIVE_SAMPLES = 2;
export const LIVENESS_TIMEOUT_MS = 15000;
export const LIVENESS_BASELINE_SAMPLES = 3;

export const CHALLENGE_STATE = {
  COLLECTING_BASELINE: 'COLLECTING_BASELINE',
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  TIMED_OUT: 'TIMED_OUT',
};

/** True for a finite numeric head-turn ratio (nullish/NaN samples are invalid). */
export const isValidRatio = (ratio) =>
  typeof ratio === 'number' && Number.isFinite(ratio);

/** Median of a non-empty numeric array. */
export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Create one head-turn challenge. `initialSamples` should be the recent valid
 * tracking ratios observed just before the candidate was recognised (up to
 * three are used); if none are available yet, the challenge collects its
 * baseline from the first valid samples it observes.
 *
 * observe(ratio, now) -> { state, baseline, delta, consecutive }
 * Callers must pass `ratio ?? null` — never a fake default like `ratio || 0.5`.
 */
export function createHeadTurnChallenge({
  movementThreshold = LIVENESS_MOVEMENT_THRESHOLD,
  requiredConsecutiveSamples = LIVENESS_CONSECUTIVE_SAMPLES,
  timeoutMs = LIVENESS_TIMEOUT_MS,
  baselineSampleTarget = LIVENESS_BASELINE_SAMPLES,
  initialSamples = [],
  startedAt = Date.now(),
} = {}) {
  const baselineSamples = initialSamples.filter(isValidRatio).slice(-baselineSampleTarget);
  let baseline = baselineSamples.length > 0 ? median(baselineSamples) : null;
  let consecutive = 0;

  return {
    get baseline() { return baseline; },
    get consecutive() { return consecutive; },
    requiredConsecutiveSamples,

    observe(ratio, now = Date.now()) {
      if (now - startedAt >= timeoutMs) {
        return { state: CHALLENGE_STATE.TIMED_OUT, baseline, delta: null, consecutive };
      }

      const current = isValidRatio(ratio) ? ratio : null;

      if (baseline === null) {
        if (current !== null) {
          baselineSamples.push(current);
          if (baselineSamples.length >= baselineSampleTarget) {
            baseline = median(baselineSamples);
          }
        }
        return { state: CHALLENGE_STATE.COLLECTING_BASELINE, baseline, delta: null, consecutive };
      }

      if (current === null) {
        // Face lost / no keypoints this sample — movement streak resets.
        consecutive = 0;
        return { state: CHALLENGE_STATE.PENDING, baseline, delta: null, consecutive };
      }

      const delta = current - baseline;
      if (Math.abs(delta) >= movementThreshold) {
        consecutive += 1;
      } else {
        consecutive = 0; // tiny jitter never accumulates toward a pass
      }

      return {
        state: consecutive >= requiredConsecutiveSamples
          ? CHALLENGE_STATE.PASSED
          : CHALLENGE_STATE.PENDING,
        baseline,
        delta,
        consecutive,
      };
    },
  };
}
