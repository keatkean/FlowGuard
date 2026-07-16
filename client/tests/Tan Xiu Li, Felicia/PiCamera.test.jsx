// Frontend tests — Raspberry Pi gate camera helper (primary camera source
// for Gate Scanner / V-Patrol, with laptop webcam fallback).
import { describe, test, expect, vi, afterEach } from "vitest";

import {
  PI_CAMERA_STREAM_URL,
  PI_CAMERA_SNAPSHOT_URL,
  CAMERA_SOURCES,
  CAMERA_STATUS_MESSAGES,
  isPiCameraReachable,
} from "../../src/constants/piCamera";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pi camera configuration", () => {
  test("stream and snapshot URLs default to the Pi gate camera endpoints", () => {
    expect(PI_CAMERA_STREAM_URL).toMatch(/\/video_feed$/);
    expect(PI_CAMERA_SNAPSHOT_URL).toMatch(/\/snapshot$/);
  });

  test("exposes the two selectable camera sources", () => {
    expect(CAMERA_SOURCES.PI).toBe("pi");
    expect(CAMERA_SOURCES.WEBCAM).toBe("webcam");
  });

  test("status messages cover connected, fallback and webcam states", () => {
    expect(CAMERA_STATUS_MESSAGES.PI_CONNECTED).toBe("Pi Gate Camera connected");
    expect(CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE).toBe(
      "Pi Camera unavailable — using laptop webcam fallback"
    );
    expect(CAMERA_STATUS_MESSAGES.WEBCAM_ACTIVE).toBe("Laptop webcam active");
  });
});

describe("isPiCameraReachable", () => {
  test("returns true when the snapshot endpoint responds OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(isPiCameraReachable()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(PI_CAMERA_SNAPSHOT_URL),
      expect.objectContaining({ cache: "no-store" })
    );
  });

  test("returns false when the snapshot endpoint errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(isPiCameraReachable()).resolves.toBe(false);
  });

  test("returns false on a non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(isPiCameraReachable()).resolves.toBe(false);
  });
});
