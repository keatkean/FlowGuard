// Frontend tests — Gate Scanner camera source behaviour.
// Raspberry Pi Gate Camera stays the primary source; the laptop webcam is the
// automatic fallback when the Pi is unreachable.
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import GateScanner from "../../src/pages/GateScanner";
import { PI_CAMERA_STREAM_URL, resetPiAvailabilityCache } from "../../src/constants/piCamera";

const mockGetUserMedia = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetPiAvailabilityCache(); // Pi-unavailable cooldown must not leak between tests
  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: mockGetUserMedia },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GateScanner camera source", () => {
  test("Pi Gate Camera is the default source when reachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<GateScanner />);

    await waitFor(() => {
      expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy();
    });
    const preview = screen.getByAltText(/raspberry pi gate camera live preview/i);
    expect(preview.getAttribute("src")).toBe(PI_CAMERA_STREAM_URL);
    // Pi primary → the laptop webcam was never requested.
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  test("automatically falls back to the laptop webcam when the Pi is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [] });
    render(<GateScanner />);

    await waitFor(() => {
      expect(screen.getByText("Pi Camera unavailable — using laptop webcam fallback")).toBeTruthy();
    });
    expect(mockGetUserMedia).toHaveBeenCalled();
    // No Pi preview while on webcam fallback.
    expect(screen.queryByAltText(/raspberry pi gate camera live preview/i)).toBeNull();
  });

  test("manual camera source switch is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<GateScanner />);

    expect(screen.getByRole("button", { name: "Raspberry Pi Gate Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Laptop Webcam" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy(), { timeout: 10000 });
  }, 15000); // generous budget: this file renders live-scan loops and can be slow on a loaded CI machine

  test("the large recognition-result card is removed; camera and gate status remain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<GateScanner />);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    // No big decision card (idle text, detail rows or record button).
    expect(screen.queryByTestId("recognition-decision-card")).toBeNull();
    expect(screen.queryByText(/Awaiting scan — no recognition decision yet/)).toBeNull();
    expect(screen.queryByText("Record for Evaluation")).toBeNull();
    // Recognition feedback still flows through the camera HUD / gate status
    // (displayMessage renders in both the HUD and the status card).
    expect(screen.getByText(/TERMINAL STATE:/)).toBeTruthy();
    expect(screen.getAllByText(/GATE TURNSTILE ONLINE|PLACE FACE IN VIEWPORT/).length).toBeGreaterThan(0);
  });

  test("page never renders raw biometric vector data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const { container } = render(<GateScanner />);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    expect(container.textContent).not.toMatch(/faceVector|embedding|\[\s*-?0\.\d+\s*,/);
  });
});

describe("GateScanner operational-only interface", () => {
  const renderScanner = () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    return render(<GateScanner />);
  };

  test("the Operational / Live Evaluation mode pills are gone", () => {
    renderScanner();
    expect(screen.queryByRole("button", { name: "Operational Mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Live Evaluation Mode" })).toBeNull();
  });

  test("no evaluation accordion or confusion matrix on the scanner page", () => {
    renderScanner();
    expect(screen.queryByText(/Facial Recognition Evaluation/)).toBeNull();
    expect(screen.queryByTestId("live-matrix-gatescanner")).toBeNull();
    expect(screen.queryByText(/Select ground-truth identity/)).toBeNull();
    expect(screen.queryByText("Record for Evaluation")).toBeNull();
    expect(screen.queryByText(/Auto-record completed scans/)).toBeNull();
  });

  test("compact gate status card shows current state and gate action", async () => {
    renderScanner();
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    expect(screen.getByText("Gate Status")).toBeTruthy();
    expect(screen.getByText("Current State")).toBeTruthy();
    expect(screen.getByText("Awaiting target")).toBeTruthy();
    expect(screen.getByText("Gate Action")).toBeTruthy();
    // Fail-closed default: no transaction yet, turnstile stays locked.
    expect(screen.getByText(/Turnstile locked — standby/)).toBeTruthy();
    // The large old recognition card rows never come back.
    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.queryByText("Liveness")).toBeNull();
    expect(screen.queryByText("System Action")).toBeNull();
  });

  test("camera source switching stays available", () => {
    renderScanner();
    expect(screen.getByRole("button", { name: "Raspberry Pi Gate Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Laptop Webcam" })).toBeTruthy();
  });
});
