// Embedded origin-scoped LIVE confusion matrix panels (Gate Scanner / V-Patrol).
import React from "react";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

import LiveConfusionMatrixPanel from "../../src/components/LiveConfusionMatrixPanel";
import {
  EVAL_STORAGE_KEY,
  saveRecords,
  loadRecords,
  createRecord,
  notifyEvaluationRecordsUpdated,
} from "../../src/constants/evaluation";

const rec = (overrides) => ({
  actualLabel: "P01",
  predictedLabel: "P01",
  confidence: 0.9,
  condition: "Front",
  latencyMs: 200,
  source: "Live",
  origin: "Gate Scanner",
  notes: "",
  timestamp: "2026-07-10T02:00:00.000Z",
  ...overrides,
});

const seed = (records) => localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify(records.map((r, i) => ({ id: `LM-${i}`, ...r }))));

const renderPanel = (origin = "Gate Scanner", title = "Gate Scanner — Live Recognition Performance") =>
  render(<MemoryRouter><LiveConfusionMatrixPanel origin={origin} title={title} /></MemoryRouter>);

// The compact summary is visible by default; this collapses/re-opens it.
const togglePanel = () => fireEvent.click(screen.getByRole("button", { name: /Live Recognition Performance/ }));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("LiveConfusionMatrixPanel — origin filtering", () => {
  test("Gate Scanner panel counts ONLY Gate Scanner Live records", () => {
    seed([
      rec(),                                                        // counted
      rec({ origin: "gate scanner", actualLabel: "P03", predictedLabel: "Unknown" }), // counted (normalised)
      rec({ origin: "V-Patrol", actualLabel: "P02", predictedLabel: "P02" }),         // other origin — excluded
      rec({ source: "Simulated", origin: "Gate Scanner" }),                            // simulated — excluded
    ]);
    renderPanel();

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("2");
  });

  test("V-Patrol panel excludes Gate Scanner and Simulated records", () => {
    seed([
      rec({ origin: "V-Patrol", actualLabel: "P02", predictedLabel: "P02" }),
      rec(), // Gate Scanner — excluded here
      rec({ source: "Simulated", origin: "V-Patrol" }),
    ]);
    renderPanel("V-Patrol", "V-Patrol — Live Recognition Performance");

    const panel = screen.getByTestId("live-matrix-vpatrol");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("1");
  });

  test("No Face records are counted separately and never join the identity matrix", () => {
    seed([
      rec(),
      rec({ detectionOutcome: "NO_FACE", actualLabel: null, predictedLabel: null }),
    ]);
    renderPanel();

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const noFace = within(panel).getByText("No Face Tests").parentElement;
    expect(noFace.querySelector("strong").textContent).toBe("1");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("1");
    // The compact matrix never includes a "No Face" row or column.
    fireEvent.click(within(panel).getByRole("button", { name: "Advanced Matrix Details" }));
    const table = within(panel).getByTestId("live-matrix-gatescanner-table");
    expect(table.textContent).not.toMatch(/No Face/);
  });

  test("empty state explains how to generate the matrix instead of showing fake 0% metrics", () => {
    renderPanel();
    expect(screen.getByText(/No confirmed live evaluation records yet\. Complete a live scan and record its ground-truth result/)).toBeTruthy();
    expect(screen.queryByText("Accuracy")).toBeNull();
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  test("compact summary is visible by default; the detailed matrix is not", () => {
    seed([rec()]);
    renderPanel();
    const panel = screen.getByTestId("live-matrix-gatescanner");
    // Compact metrics render without any click…
    for (const label of ["Confirmed Live Samples", "Accuracy", "FAR", "FRR", "Average Latency", "No Face Tests"]) {
      expect(within(panel).getByText(label)).toBeTruthy();
    }
    // …but the detailed table stays behind the collapsed Advanced control.
    expect(within(panel).getByRole("button", { name: "Advanced Matrix Details" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(panel).queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("user can manually expand and re-collapse Advanced Matrix Details", () => {
    seed([rec()]);
    renderPanel();
    const panel = screen.getByTestId("live-matrix-gatescanner");
    const advanced = within(panel).getByRole("button", { name: "Advanced Matrix Details" });
    fireEvent.click(advanced);
    expect(within(panel).getByTestId("live-matrix-gatescanner-table")).toBeTruthy();
    fireEvent.click(advanced);
    expect(within(panel).queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("a record-saved event refreshes the summary immediately WITHOUT opening the detailed matrix", () => {
    renderPanel();
    // No records yet: the always-visible summary shows the empty state.
    expect(screen.getByText(/No confirmed live evaluation records yet/)).toBeTruthy();

    act(() => {
      saveRecords([createRecord({ actualLabel: "P01", predictedLabel: "P01", source: "Live", origin: "Gate Scanner", latencyMs: 150 }), ...loadRecords()]);
      notifyEvaluationRecordsUpdated({ origin: "Gate Scanner" });
    });

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("1");
    // The advanced details element is never forced open by update events.
    expect(within(panel).getByRole("button", { name: "Advanced Matrix Details" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(panel).queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("a record-saved event re-surfaces the summary even after the user collapsed the panel, details stay closed", () => {
    seed([rec()]);
    renderPanel();
    togglePanel(); // user collapses the summary
    expect(screen.queryByText("Confirmed Live Samples")).toBeNull();

    act(() => {
      saveRecords([createRecord({ actualLabel: "P02", predictedLabel: "P02", source: "Live", origin: "Gate Scanner", latencyMs: 180 }), ...loadRecords()]);
      notifyEvaluationRecordsUpdated({ origin: "Gate Scanner" });
    });

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("2");
    expect(within(panel).queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("panel never displays names, emails or user IDs", () => {
    seed([rec({ notes: "confirmed at gate" })]);
    renderPanel();
    expect(document.body.textContent).not.toMatch(/@|userId|faceVector|embedding|Alice/i);
  });
});
