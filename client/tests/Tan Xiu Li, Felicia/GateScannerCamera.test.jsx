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
  localStorage.clear();
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

  test("the large recognition-result card is removed; camera and gate status remain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<GateScanner />);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    // No big decision card (idle text, detail rows or record button).
    expect(screen.queryByTestId("recognition-decision-card")).toBeNull();
    expect(screen.queryByText(/Awaiting scan — no recognition decision yet/)).toBeNull();
    expect(screen.queryByText("Record for Evaluation")).toBeNull();
    // Recognition feedback still flows through the camera HUD / gate status.
    expect(screen.getByText(/TERMINAL STATE:/)).toBeTruthy();
    expect(screen.getByText(/GATE TURNSTILE ONLINE|PLACE FACE IN VIEWPORT/)).toBeTruthy();
  });

  test("page never renders raw biometric vector data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const { container } = render(<GateScanner />);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    expect(container.textContent).not.toMatch(/faceVector|embedding|\[\s*-?0\.\d+\s*,/);
  });
});

describe("GateScanner evaluation accordion", () => {
  const renderScanner = () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    return render(<GateScanner />);
  };

  test("Operational Mode (default) hides the entire evaluation section", () => {
    renderScanner();
    expect(screen.getByRole("button", { name: "Operational Mode" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Facial Recognition Evaluation")).toBeNull();
    expect(screen.queryByText(/Select ground-truth identity/)).toBeNull();
    expect(screen.queryByTestId("live-matrix-gatescanner")).toBeNull();
    expect(screen.queryByText("Record for Evaluation")).toBeNull();
  });

  test("Live Evaluation Mode shows a COLLAPSED Facial Recognition Evaluation accordion", () => {
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Live Evaluation Mode" }));

    const accordion = screen.getByRole("button", { name: /Facial Recognition Evaluation/ });
    expect(accordion.getAttribute("aria-expanded")).toBe("false");
    expect(within(accordion).getByText(/Confirmed samples: \d+/)).toBeTruthy();
    // Controls and metrics stay hidden until the evaluator expands it.
    expect(screen.queryByText("Select ground-truth identity")).toBeNull();
    expect(screen.queryByText("Accuracy")).toBeNull();
  });

  test("expanding the accordion shows banner, controls, last result and metrics; Advanced Matrix stays collapsed", () => {
    localStorage.setItem(
      "flowguard_facial_evaluation_records",
      JSON.stringify([{ id: "GS-1", actualLabel: "P01", predictedLabel: "P01", condition: "Front", latencyMs: 200, source: "Live", origin: "Gate Scanner", timestamp: "2026-07-10T02:00:00.000Z" }])
    );
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Live Evaluation Mode" }));
    fireEvent.click(screen.getByRole("button", { name: /Facial Recognition Evaluation/ }));

    expect(screen.getByText(/compares evaluator-confirmed ground truth against the real AI prediction/)).toBeTruthy();
    expect(screen.getByText("Select ground-truth identity")).toBeTruthy();
    expect(screen.getByText(/Auto-record completed scans/)).toBeTruthy();
    expect(screen.getByText(/No evaluation result yet/)).toBeTruthy();
    for (const label of ["Confirmed Samples", "Accuracy", "FAR", "FRR", "Average Latency"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Scanner compact view never shows the No Face metric.
    expect(screen.queryByText("No Face Tests")).toBeNull();
    // Advanced Matrix Details starts collapsed.
    expect(screen.getByRole("button", { name: "Advanced Matrix Details" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("live-matrix-gatescanner-table")).toBeNull();

    // Switching back to Operational Mode removes the whole section.
    fireEvent.click(screen.getByRole("button", { name: "Operational Mode" }));
    expect(screen.queryByTestId("live-matrix-gatescanner")).toBeNull();
  });

  test("camera source switching stays available in both modes", () => {
    renderScanner();
    expect(screen.getByRole("button", { name: "Raspberry Pi Gate Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Laptop Webcam" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Live Evaluation Mode" }));
    expect(screen.getByRole("button", { name: "Raspberry Pi Gate Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Laptop Webcam" })).toBeTruthy();
  });
});
