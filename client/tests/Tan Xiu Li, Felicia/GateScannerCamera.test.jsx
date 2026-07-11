// Frontend tests — Gate Scanner camera source behaviour.
// Raspberry Pi Gate Camera stays the primary source; the laptop webcam is the
// automatic fallback when the Pi is unreachable.
import React from "react";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import GateScanner from "../../src/pages/GateScanner";
import { PI_CAMERA_STREAM_URL } from "../../src/constants/piCamera";

const mockGetUserMedia = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
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
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
  });

  test("decision card starts in the idle awaiting-scan state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<GateScanner />);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    // Shared decision card: idle state reports no recognition decision yet.
    expect(screen.getByText(/Awaiting scan — no recognition decision yet/)).toBeTruthy();
  });

  test("page never renders raw biometric vector data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const { container } = render(<GateScanner />);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    expect(container.textContent).not.toMatch(/faceVector|embedding|\[\s*-?0\.\d+\s*,/);
  });
});

describe("GateScanner evaluation analytics visibility", () => {
  const renderScanner = () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    return render(<GateScanner />);
  };

  test("Operational Mode (default) hides all evaluation analytics", () => {
    renderScanner();
    expect(screen.getByRole("button", { name: "Operational Mode" }).getAttribute("aria-pressed")).toBe("true");
    // No ground-truth selector, no evaluation summary, no matrix.
    expect(screen.queryByText(/Select ground-truth identity/)).toBeNull();
    expect(screen.queryByText(/Recognition Evaluation Summary/)).toBeNull();
    expect(screen.queryByTestId("live-matrix-gatescanner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Advanced Matrix Details" })).toBeNull();
  });

  test("Live Evaluation Mode shows the compact summary with the detailed matrix collapsed", () => {
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Live Evaluation Mode" }));

    // Ground-truth, condition and auto-record controls appear.
    expect(screen.getByText("Select ground-truth identity")).toBeTruthy();
    expect(screen.getByText(/Auto-record completed scans/)).toBeTruthy();

    // Compact Recognition Evaluation Summary is visible without a click…
    const panel = screen.getByTestId("live-matrix-gatescanner");
    expect(within(panel).getByText(/Recognition Evaluation Summary/)).toBeTruthy();
    // …while the detailed matrix table stays hidden until manually expanded.
    expect(within(panel).queryByTestId("live-matrix-gatescanner-table")).toBeNull();

    // Switching back to Operational Mode hides the analytics again.
    fireEvent.click(screen.getByRole("button", { name: "Operational Mode" }));
    expect(screen.queryByTestId("live-matrix-gatescanner")).toBeNull();
  });
});
