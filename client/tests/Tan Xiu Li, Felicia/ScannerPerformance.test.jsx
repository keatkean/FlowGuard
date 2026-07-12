// Frontend tests — live-camera recognition performance cleanup.
// Frontend-only: no AI-model, threshold or liveness-rule changes are covered
// here — only capture sizing, request throttling and Pi fallback caching.
import fs from "node:fs";
import path from "node:path";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import {
  CAPTURE_MAX_WIDTH,
  CAPTURE_JPEG_QUALITY,
  SCAN_INTERVAL_MS,
  createScanGate,
} from "../../src/constants/scanControl";
import {
  PI_UNAVAILABLE_COOLDOWN_MS,
  isPiCameraReachableCached,
  markPiUnavailable,
  isPiInCooldown,
  resetPiAvailabilityCache,
} from "../../src/constants/piCamera";

const readPage = (name) =>
  fs.readFileSync(path.resolve(__dirname, `../../src/pages/${name}`), "utf8");

beforeEach(() => {
  resetPiAvailabilityCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frame capture optimisation", () => {
  test("frames are resized to a bounded width, not full webcam resolution", () => {
    expect(CAPTURE_MAX_WIDTH).toBeLessThanOrEqual(640);
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      const source = readPage(page);
      expect(source).toMatch(/CAPTURE_MAX_WIDTH/);
      // Both canvas dimensions derive from the scaled-down width.
      expect(source).toMatch(/Math\.min\(1,\s*(MAX_WIDTH|maxWidth)\s*\/\s*(bitmap|video)\.(width|videoWidth)\)/);
    }
  });

  test("JPEG quality is reduced (never full quality) and shared by both scanners", () => {
    expect(CAPTURE_JPEG_QUALITY).toBeGreaterThanOrEqual(0.55);
    expect(CAPTURE_JPEG_QUALITY).toBeLessThanOrEqual(0.7);
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      const source = readPage(page);
      expect(source).toMatch(/toDataURL\('image\/jpeg',\s*CAPTURE_JPEG_QUALITY\)/);
      // No hardcoded full-quality (or stray) JPEG encodes remain.
      expect(source).not.toMatch(/toDataURL\('image\/jpeg',\s*[01]?\.?\d*\)/);
      expect(source).not.toMatch(/toDataURL\('image\/jpeg'\)/);
    }
  });

  test("both scanners reuse one hidden canvas ref instead of creating canvases per frame", () => {
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      const source = readPage(page);
      expect(source).toMatch(/canvasRef\s*=\s*useRef/);
      expect(source).not.toMatch(/document\.createElement\(['"]canvas['"]\)/);
    }
  });
});

describe("recognition request throttling", () => {
  test("scan gate blocks overlapping recognition requests", () => {
    const gate = createScanGate();
    gate.begin();
    expect(gate.canScan()).toBe(false); // second request cannot start while one is in flight
    gate.end();
    expect(gate.canScan()).toBe(true);
  });

  test("operational scans run on a throttled interval, not per video frame", () => {
    expect(SCAN_INTERVAL_MS).toBeGreaterThanOrEqual(500);
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      expect(readPage(page)).toMatch(/setInterval\([\s\S]*?,\s*SCAN_INTERVAL_MS\)/);
    }
  });

  test("both scanners guard the loop with the scan gate", () => {
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      const source = readPage(page);
      expect(source).toMatch(/createScanGate\(\)/);
      expect(source).toMatch(/canScan\(\)/);
      expect(source).toMatch(/\.begin\(\)/);
      expect(source).toMatch(/\.end\(\)/);
    }
  });
});

describe("stale-response protection", () => {
  test("responses are dropped after a camera source switch or unmount", () => {
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      const source = readPage(page);
      // Session token captured before the request...
      expect(source).toMatch(/scanSession(Ref)?\s*=\s*scanSessionRef\.current/);
      // ...checked after the response...
      expect(source).toMatch(/scanSession !== scanSessionRef\.current\) return/);
      // ...and invalidated on source switch and unmount.
      expect(source.match(/scanSessionRef\.current \+= 1/g)?.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Pi fallback caching", () => {
  test("a failed Pi probe is cached — no re-probe on every recognition cycle", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("pi offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(isPiCameraReachableCached()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // While in cooldown, further checks return false WITHOUT touching the network.
    await expect(isPiCameraReachableCached()).resolves.toBe(false);
    await expect(isPiCameraReachableCached()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isPiInCooldown()).toBe(true);
  });

  test("Pi health is retried only after the ~10 s cooldown expires", async () => {
    expect(PI_UNAVAILABLE_COOLDOWN_MS).toBe(10000);
    const now = 5_000_000;
    markPiUnavailable(now);
    expect(isPiInCooldown(now + 9999)).toBe(true);
    expect(isPiInCooldown(now + PI_UNAVAILABLE_COOLDOWN_MS)).toBe(false);

    // After the cooldown, a fresh probe is allowed again.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await expect(isPiCameraReachableCached(now + PI_UNAVAILABLE_COOLDOWN_MS)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("scanner pages use the cached probe and mark the Pi unavailable on snapshot failure", () => {
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      const source = readPage(page);
      expect(source).toMatch(/isPiCameraReachableCached/);
      expect(source).toMatch(/markPiUnavailable\(\)/);
    }
  });
});

describe("dev-only telemetry", () => {
  test("scan timing telemetry logs only in development builds", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/constants/scanControl.js"), "utf8"
    );
    expect(source).toMatch(/if \(!import\.meta\.env\.DEV\) return;/);
    for (const page of ["VPatrol.jsx", "GateScanner.jsx"]) {
      expect(readPage(page)).toMatch(/logScanTimings\(/);
    }
  });
});
