// Frontend tests — recognition scan tuning, no-overlap guard, and AI-error backoff.
import { describe, test, expect } from "vitest";

import {
  SCAN_INTERVAL_MS,
  TARGET_LOCK_MS,
  CAPTURE_MAX_WIDTH,
  AI_ERROR_BACKOFF_MS,
  createScanGate,
} from "../../src/constants/scanControl";

describe("scan tuning values", () => {
  test("scan interval is ~900–1000 ms (was 1200 ms)", () => {
    expect(SCAN_INTERVAL_MS).toBeGreaterThanOrEqual(900);
    expect(SCAN_INTERVAL_MS).toBeLessThanOrEqual(1000);
  });

  test("target-lock delay is ~600 ms (was 1800 ms)", () => {
    expect(TARGET_LOCK_MS).toBe(600);
  });

  test("capture width is 320–360 px (was 420 px)", () => {
    expect(CAPTURE_MAX_WIDTH).toBeGreaterThanOrEqual(320);
    expect(CAPTURE_MAX_WIDTH).toBeLessThanOrEqual(360);
  });

  test("AI-error backoff is a short pause (~5 s)", () => {
    expect(AI_ERROR_BACKOFF_MS).toBe(5000);
  });
});

describe("createScanGate — no-overlapping-request guard", () => {
  test("a scan in flight blocks a second scan until it ends", () => {
    const gate = createScanGate();
    expect(gate.canScan()).toBe(true);

    gate.begin();
    expect(gate.canScan()).toBe(false); // overlapping request blocked

    gate.end();
    expect(gate.canScan()).toBe(true);
  });
});

describe("createScanGate — AI-error retry backoff", () => {
  test("after a failure, scanning pauses for the backoff window then resumes", () => {
    const gate = createScanGate();
    const now = 1_000_000;

    gate.applyBackoff(5000, now);
    expect(gate.canScan(now)).toBe(false);
    expect(gate.canScan(now + 4999)).toBe(false); // still backing off
    expect(gate.isBackingOff(now + 1000)).toBe(true);
    expect(gate.canScan(now + 5000)).toBe(true); // retry after ~5 s
  });

  test("backoff does not stack with the busy flag incorrectly", () => {
    const gate = createScanGate();
    const now = 2_000_000;
    gate.begin();
    gate.applyBackoff(5000, now);
    gate.end();
    expect(gate.canScan(now + 100)).toBe(false); // backoff still applies after end()
    expect(gate.canScan(now + 6000)).toBe(true);
  });
});
