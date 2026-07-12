// Frontend tests — real-time face tracking + baseline-movement head-turn
// liveness (Gate Scanner / V-Patrol).
//
// Architecture under test:
//   A. Tracking loop  -> POST /api/facial-recognition/track (detection only,
//      no identity) moves the box + samples head-turn movement every ~250 ms.
//   B. Recognition loop -> POST /api/facial-recognition/recognize identifies
//      the candidate at ~1 s, and stops once a candidate is secured.
//   C. Liveness passes on CHANGE from the person's own baseline ratio (median
//      of recent tracking samples), never on a fixed absolute band.
//   D. Access is granted ONLY after a final full recognition returns the SAME
//      user ID as the original candidate (same-identity binding).
import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";

import { smoothBox, BOX_SMOOTHING_PREV_WEIGHT } from "../../src/constants/faceBox";
import {
  TRACK_INTERVAL_MS,
  TRACK_MAX_WIDTH,
  TRACK_JPEG_QUALITY,
  BOX_CLEAR_TIMEOUT_MS,
  SCAN_INTERVAL_MS,
} from "../../src/constants/scanControl";
import {
  createHeadTurnChallenge,
  CHALLENGE_STATE,
  LIVENESS_MOVEMENT_THRESHOLD,
  LIVENESS_CONSECUTIVE_SAMPLES,
  LIVENESS_TIMEOUT_MS,
  median,
  isValidRatio,
} from "../../src/constants/liveness";

const readPage = (name) =>
  fs.readFileSync(path.resolve(__dirname, `../../src/pages/${name}`), "utf8");

const PAGES = ["GateScanner.jsx", "VPatrol.jsx"];

/** Source slice between two markers (for scoping structural assertions). */
const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("separate tracking and recognition loops", () => {
  test("tracking and recognition use two independent in-flight guards", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/trackingInFlightRef\s*=\s*useRef\(false\)/);
      expect(source).toMatch(/recognitionInFlightRef\s*=\s*useRef\(createScanGate\(\)\)/);
      // The tracking loop toggles ONLY its own boolean guard.
      const trackingLoop = sliceBetween(source, "const performTrackingScan", "const handleTrackingResult");
      expect(trackingLoop).toMatch(/trackingInFlightRef\.current = true/);
      expect(trackingLoop).toMatch(/trackingInFlightRef\.current = false/);
      expect(trackingLoop).not.toMatch(/recognitionInFlightRef\.current\.(begin|end)/);
    }
  });

  test("tracking runs at ~200-300 ms with small cheap frames; recognition keeps its own cadence", () => {
    expect(TRACK_INTERVAL_MS).toBeGreaterThanOrEqual(200);
    expect(TRACK_INTERVAL_MS).toBeLessThanOrEqual(300);
    expect(TRACK_MAX_WIDTH).toBe(256);
    expect(TRACK_JPEG_QUALITY).toBeGreaterThanOrEqual(0.45);
    expect(TRACK_JPEG_QUALITY).toBeLessThanOrEqual(0.55);
    expect(SCAN_INTERVAL_MS).toBeGreaterThanOrEqual(500);
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/setInterval\([\s\S]*?,\s*TRACK_INTERVAL_MS\)/);
      expect(source).toMatch(/setInterval\([\s\S]*?,\s*SCAN_INTERVAL_MS\)/);
      expect(source).toMatch(/captureFrom\(canvas,\s*TRACK_MAX_WIDTH,\s*TRACK_JPEG_QUALITY\)/);
    }
  });

  test("tracking loop calls ONLY the identity-free /track endpoint and updates the box itself", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/\/api\/facial-recognition\/track/);
      const trackingLoop = sliceBetween(source, "const performTrackingScan", "const handleTrackingResult");
      expect(trackingLoop).toMatch(/axios\.post\(TRACK_URL/);
      expect(trackingLoop).not.toMatch(/RECOGNIZE_URL/);
      // The box overlay is driven from tracking results, not from the sparse
      // full-recognition loop.
      const trackingHandler = sliceBetween(source, "const handleTrackingResult", "const abortAuthorizationForMultipleFaces");
      expect(trackingHandler).toMatch(/setFaceBox\(faceBoxStyle\(/);
      const recognitionLoop = sliceBetween(source, "const performRecognitionScan", "const resolveCandidateDecision");
      expect(recognitionLoop).not.toMatch(/setFaceBox\(/);
      expect(recognitionLoop).toMatch(/axios\.post\(RECOGNIZE_URL/);
    }
  });

  test("stale tracking responses are ignored after a source switch or unmount", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      const trackingLoop = sliceBetween(source, "const performTrackingScan", "const handleTrackingResult");
      expect(trackingLoop).toMatch(/const scanSession = scanSessionRef\.current/);
      expect(trackingLoop).toMatch(/if \(scanSession !== scanSessionRef\.current\) return;/);
    }
  });
});

describe("box smoothing and lifecycle", () => {
  test("boxes are blended 0.55 previous / 0.45 current on every axis", () => {
    expect(BOX_SMOOTHING_PREV_WEIGHT).toBe(0.55);
    const prev = { x: 0, y: 100, width: 200, height: 100 };
    const next = { x: 100, y: 0, width: 100, height: 200 };
    const blended = smoothBox(prev, next);
    expect(blended.x).toBeCloseTo(45);
    expect(blended.y).toBeCloseTo(55);
    expect(blended.width).toBeCloseTo(155);
    expect(blended.height).toBeCloseTo(145);
  });

  test("the first box passes through unsmoothed (no lag from a phantom origin)", () => {
    const first = { x: 10, y: 20, width: 30, height: 40 };
    expect(smoothBox(null, first)).toEqual(first);
    expect(smoothBox(first, null)).toBeNull();
  });

  test("pages smooth the tracking box and animate it with a short CSS transition", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/smoothBox\(smoothedBoxRef\.current,\s*clampBoxToFrame\(/);
      // ~80-120 ms transition so 250 ms updates glide instead of teleporting.
      expect(source).toMatch(/transition: 'top 1[0-2]0ms linear/);
    }
  });

  test("the box survives a brief miss, then clears after ~700-900 ms without a face", () => {
    expect(BOX_CLEAR_TIMEOUT_MS).toBeGreaterThanOrEqual(700);
    expect(BOX_CLEAR_TIMEOUT_MS).toBeLessThanOrEqual(900);
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/lastFaceSeenAtRef\.current >= BOX_CLEAR_TIMEOUT_MS/);
      // Clearing wipes both the rendered box and the smoothing memory.
      const clear = sliceBetween(source, "const clearTrackingState", "// Primary source");
      expect(clear).toMatch(/smoothedBoxRef\.current = null/);
      expect(clear).toMatch(/setFaceBox\(null\)/);
    }
  });

  test("a camera-source switch resets the box immediately (no stale box from the old source)", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/scanSessionRef\.current \+= 1; \/\/ invalidate responses captured from the old source\s*\n\s*(resetTurnstileKiosk|resetScanner)\(\);\s*\n\s*clearTrackingState\(\);/);
    }
  });
});

describe("multiple faces stop authorization", () => {
  test("more than one face aborts the candidate/challenge and warns the operator", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/faceCount > 1/);
      expect(source).toMatch(/MULTIPLE FACES DETECTED — ONE PERSON AT A TIME/);
      const abort = sliceBetween(source, "const abortAuthorizationForMultipleFaces", "// ---");
      expect(abort).toMatch(/candidateUserRef\.current = null/);
      expect(abort).toMatch(/challengeRef\.current = null/);
      expect(abort).not.toMatch(/processAttendanceTransaction|grantFinalAccess/);
    }
  });
});

describe("baseline-movement liveness (replaces absolute single-frame bands)", () => {
  test("challenge baseline is the median of up to three recent valid tracking ratios", () => {
    const challenge = createHeadTurnChallenge({
      initialSamples: [0.9 /* older, beyond window */, 0.48, 0.52, 0.5],
      startedAt: 0,
    });
    expect(challenge.baseline).toBe(0.5);
    expect(median([0.4, 0.6])).toBeCloseTo(0.5);
    expect(isValidRatio(null)).toBe(false);
    expect(isValidRatio(0.5)).toBe(true);
  });

  test("passes only when |delta from baseline| >= threshold for two consecutive samples", () => {
    expect(LIVENESS_MOVEMENT_THRESHOLD).toBeGreaterThanOrEqual(0.07);
    expect(LIVENESS_MOVEMENT_THRESHOLD).toBeLessThanOrEqual(0.1);
    expect(LIVENESS_CONSECUTIVE_SAMPLES).toBe(2);

    const challenge = createHeadTurnChallenge({ initialSamples: [0.5], startedAt: 0 });
    // Tiny jitter never accumulates.
    expect(challenge.observe(0.53, 100).state).toBe(CHALLENGE_STATE.PENDING);
    // First big movement: pending (1 of 2)...
    const first = challenge.observe(0.62, 200);
    expect(first.state).toBe(CHALLENGE_STATE.PENDING);
    expect(first.consecutive).toBe(1);
    // ...held for a second consecutive sample: passed.
    const second = challenge.observe(0.63, 300);
    expect(second.state).toBe(CHALLENGE_STATE.PASSED);
    expect(second.consecutive).toBe(2);
  });

  test("a bounce back to baseline (or a lost face) resets the consecutive counter", () => {
    const challenge = createHeadTurnChallenge({ initialSamples: [0.5], startedAt: 0 });
    expect(challenge.observe(0.62, 100).consecutive).toBe(1);
    expect(challenge.observe(0.5, 200).consecutive).toBe(0); // returned to baseline
    expect(challenge.observe(0.62, 300).consecutive).toBe(1);
    expect(challenge.observe(null, 400).consecutive).toBe(0); // invalid sample — never `|| 0.5`
    expect(challenge.observe(0.62, 500).state).toBe(CHALLENGE_STATE.PENDING);
    expect(challenge.observe(0.62, 600).state).toBe(CHALLENGE_STATE.PASSED);
  });

  test("a person whose resting pose sits outside the old fixed band no longer auto-passes", () => {
    // Old rule: ratio < 0.35 || ratio > 0.65 passed instantly. A person whose
    // steady pose reads 0.3 must now still MOVE relative to their own baseline.
    const challenge = createHeadTurnChallenge({ initialSamples: [0.3, 0.3, 0.3], startedAt: 0 });
    expect(challenge.observe(0.3, 100).state).toBe(CHALLENGE_STATE.PENDING);
    expect(challenge.observe(0.31, 200).state).toBe(CHALLENGE_STATE.PENDING);
    expect(challenge.observe(0.4, 300).consecutive).toBe(1);
    expect(challenge.observe(0.4, 400).state).toBe(CHALLENGE_STATE.PASSED);
  });

  test("challenge times out (fails closed) after ~15 s", () => {
    expect(LIVENESS_TIMEOUT_MS).toBe(15000);
    const challenge = createHeadTurnChallenge({ initialSamples: [0.5], startedAt: 0 });
    const result = challenge.observe(0.9, LIVENESS_TIMEOUT_MS);
    expect(result.state).toBe(CHALLENGE_STATE.TIMED_OUT);
  });

  test("with no pre-collected samples the challenge collects its baseline first", () => {
    const challenge = createHeadTurnChallenge({ startedAt: 0 });
    expect(challenge.observe(0.5, 100).state).toBe(CHALLENGE_STATE.COLLECTING_BASELINE);
    expect(challenge.observe(0.51, 200).state).toBe(CHALLENGE_STATE.COLLECTING_BASELINE);
    expect(challenge.observe(0.49, 300).state).toBe(CHALLENGE_STATE.COLLECTING_BASELINE);
    expect(challenge.baseline).toBe(0.5);
    expect(challenge.observe(0.6, 400).consecutive).toBe(1);
  });

  test("pages use the baseline challenge and nullish ratio handling — no absolute bands, no `|| 0.5`", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).toMatch(/createHeadTurnChallenge\(\{/);
      expect(source).toMatch(/initialSamples: recentRatiosRef\.current/);
      expect(source).toMatch(/headTurnRatio \?\? null/);
      expect(source).not.toMatch(/livenessRatio\s*<\s*0\.35/);
      expect(source).not.toMatch(/livenessRatio\s*<\s*0\.45/);
      expect(source).not.toMatch(/liveness_ratio\s*\|\|\s*0\.5/);
    }
  });

  test("liveness timeout fails closed: candidate cleared, no access transaction fired", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      const timeoutHandler = sliceBetween(source, "const failLivenessTimeout", "// ---");
      expect(timeoutHandler).toMatch(/candidateUserRef\.current = null/);
      expect(timeoutHandler).not.toMatch(/processAttendanceTransaction|grantFinalAccess|ATTENDANCE_SCAN_URL|ACCESS_EVENT_URL/);
    }
    // Gate specifically keeps the turnstile locked.
    expect(readPage("GateScanner.jsx")).toMatch(/Turnstile remains locked/);
  });
});

describe("final same-identity confirmation gates all access", () => {
  test("both pages require the final matched ID to equal the original candidate ID", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      const finalBlock = sliceBetween(source, "const runFinalConfirmation", "const failFinalConfirmation");
      expect(finalBlock).toMatch(/finalUser\.id === candidate\.id/);
      expect(finalBlock).toMatch(/RECOGNITION_STATUS\.AUTHORIZED/);
      expect(finalBlock).toMatch(/failFinalConfirmation\(\)/);
    }
  });

  test("Gate attendance is triggered ONLY from the final same-ID confirmation", () => {
    const source = readPage("GateScanner.jsx");
    const finalBlock = sliceBetween(source, "const runFinalConfirmation", "const failFinalConfirmation");
    expect(finalBlock).toMatch(/await processAttendanceTransaction\(candidate\)/);
    // No other call site anywhere in the page.
    const callSites = source.match(/processAttendanceTransaction\(/g) || [];
    expect(callSites.length).toBe(1); // the definition is `= async (…)`; the ONLY call is in runFinalConfirmation
    // The tracking handler itself can never fire the transaction.
    const trackingHandler = sliceBetween(source, "const handleTrackingResult", "const abortAuthorizationForMultipleFaces");
    expect(trackingHandler).not.toMatch(/processAttendanceTransaction\(/);
  });

  test("V-Patrol access-event is triggered ONLY from the final same-ID confirmation", () => {
    const source = readPage("VPatrol.jsx");
    const finalBlock = sliceBetween(source, "const runFinalConfirmation", "const failFinalConfirmation");
    expect(finalBlock).toMatch(/grantFinalAccess\(candidate\)/);
    const callSites = source.match(/grantFinalAccess\(/g) || [];
    expect(callSites.length).toBe(1); // the definition is `= (…)`; the ONLY call is in runFinalConfirmation
    // ACCESS_EVENT_URL is posted only inside grantFinalAccess.
    const grantBlock = sliceBetween(source, "const grantFinalAccess", "// Capture one frame");
    expect(grantBlock).toMatch(/axios\.post\(ACCESS_EVENT_URL/);
    expect((source.match(/axios\.post\(ACCESS_EVENT_URL/g) || []).length).toBe(1);
  });
});

describe("honest security wording", () => {
  test("no anti-spoof / presentation-attack claims; motion-liveness wording instead", () => {
    for (const page of PAGES) {
      const source = readPage(page);
      expect(source).not.toMatch(/ANTI-SPOOF|anti-spoof|presentation.attack/i);
      expect(source).toMatch(/MOTION LIVENESS ACTIVE/);
      expect(source).toMatch(/HEAD-TURN VERIFICATION/);
      expect(source).toMatch(/TURN HEAD SLIGHTLY AND HOLD/);
    }
  });
});
