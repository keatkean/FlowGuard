// Embedded "Facial Recognition Evaluation" accordion (Gate Scanner / V-Patrol):
// collapsed by default, origin-scoped LIVE metrics, No Face excluded from the
// scanner-side compact view, Advanced Matrix Details behind its own toggle.
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

const renderPanel = (origin = "Gate Scanner", children = null) =>
  render(<MemoryRouter><LiveConfusionMatrixPanel origin={origin}>{children}</LiveConfusionMatrixPanel></MemoryRouter>);

const header = () => screen.getByRole("button", { name: /Facial Recognition Evaluation/ });
const expandPanel = () => fireEvent.click(header());

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("Facial Recognition Evaluation accordion", () => {
  test("is collapsed by default: header shows title + confirmed sample count, body hidden", () => {
    seed([rec(), rec({ actualLabel: "P02", predictedLabel: "P02" })]);
    renderPanel();

    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(within(header()).getByText("Confirmed samples: 2")).toBeTruthy();
    // No metrics, controls, banner or matrix until the evaluator expands it.
    expect(screen.queryByText("Accuracy")).toBeNull();
    expect(screen.queryByText(/compares evaluator-confirmed ground truth/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Advanced Matrix Details" })).toBeNull();
  });

  test("expanding shows the banner, children (controls slot) and compact metrics", () => {
    seed([rec()]);
    renderPanel("Gate Scanner", <div data-testid="page-controls">controls-slot</div>);
    expandPanel();

    expect(screen.getByText("Live Evaluation Mode compares evaluator-confirmed ground truth against the real AI prediction. Attendance and SecurityLog writes are disabled.")).toBeTruthy();
    expect(screen.getByTestId("page-controls")).toBeTruthy();
    for (const label of ["Confirmed Samples", "Accuracy", "FAR", "FRR", "Average Latency"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  test("scanner compact view hides No Face Tests (calculation still excludes No Face from identity stats)", () => {
    seed([
      rec(),
      rec({ detectionOutcome: "NO_FACE", actualLabel: null, predictedLabel: null }),
    ]);
    renderPanel();
    expandPanel();

    // No Face metric is absent from the scanner-side view…
    expect(screen.queryByText("No Face Tests")).toBeNull();
    // …and the No Face record never joins the identity sample count.
    const panel = screen.getByTestId("live-matrix-gatescanner");
    const samples = within(panel).getByText("Confirmed Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("1");
    expect(within(header()).getByText("Confirmed samples: 1")).toBeTruthy();
  });

  test("Gate Scanner accordion counts ONLY Gate Scanner Live records", () => {
    seed([
      rec(),                                                                            // counted
      rec({ origin: "gate scanner", actualLabel: "P03", predictedLabel: "Unknown" }),   // counted (normalised)
      rec({ origin: "V-Patrol", actualLabel: "P02", predictedLabel: "P02" }),           // other origin — excluded
      rec({ source: "Simulated", origin: "Gate Scanner" }),                             // simulated — excluded
    ]);
    renderPanel();
    expect(within(header()).getByText("Confirmed samples: 2")).toBeTruthy();
  });

  test("V-Patrol accordion excludes Gate Scanner and Simulated records", () => {
    seed([
      rec({ origin: "V-Patrol", actualLabel: "P02", predictedLabel: "P02" }),
      rec(), // Gate Scanner — excluded here
      rec({ source: "Simulated", origin: "V-Patrol" }),
    ]);
    renderPanel("V-Patrol");
    expect(screen.getByTestId("live-matrix-vpatrol")).toBeTruthy();
    expect(within(header()).getByText("Confirmed samples: 1")).toBeTruthy();
  });

  test("Advanced Matrix Details is collapsed initially, expandable and re-collapsible; matrix has Unknown but no No Face class", () => {
    seed([
      rec(),
      rec({ detectionOutcome: "NO_FACE", actualLabel: null, predictedLabel: null }),
    ]);
    renderPanel();
    expandPanel();

    const advanced = screen.getByRole("button", { name: "Advanced Matrix Details" });
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("live-matrix-gatescanner-table")).toBeNull();

    fireEvent.click(advanced);
    expect(screen.getByText("Rows represent the actual identity. Columns represent the AI prediction.")).toBeTruthy();
    const table = screen.getByTestId("live-matrix-gatescanner-table");
    expect(table.textContent).toMatch(/P01/);
    expect(table.textContent).toMatch(/Unknown/);
    expect(table.textContent).not.toMatch(/No Face/);

    fireEvent.click(advanced);
    expect(screen.queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("empty state explains how to generate the matrix instead of showing fake 0% metrics", () => {
    renderPanel();
    expandPanel();
    expect(screen.getByText(/No confirmed live evaluation records yet\. Complete a live scan and record its ground-truth result/)).toBeTruthy();
    expect(screen.queryByText("Accuracy")).toBeNull();
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  test("a record-saved event refreshes the count WITHOUT auto-expanding the accordion", () => {
    renderPanel();
    expect(within(header()).getByText("Confirmed samples: 0")).toBeTruthy();

    act(() => {
      saveRecords([createRecord({ actualLabel: "P01", predictedLabel: "P01", source: "Live", origin: "Gate Scanner", latencyMs: 150 }), ...loadRecords()]);
      notifyEvaluationRecordsUpdated({ origin: "Gate Scanner" });
    });

    expect(within(header()).getByText("Confirmed samples: 1")).toBeTruthy();
    // Neither accordion opens automatically.
    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Accuracy")).toBeNull();
    expect(screen.queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("a record-saved event while expanded refreshes metrics but leaves Advanced Matrix Details closed", () => {
    seed([rec()]);
    renderPanel();
    expandPanel();

    act(() => {
      saveRecords([createRecord({ actualLabel: "P02", predictedLabel: "P02", source: "Live", origin: "Gate Scanner", latencyMs: 180 }), ...loadRecords()]);
      notifyEvaluationRecordsUpdated({ origin: "Gate Scanner" });
    });

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const samples = within(panel).getByText("Confirmed Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("2");
    expect(screen.getByRole("button", { name: "Advanced Matrix Details" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("live-matrix-gatescanner-table")).toBeNull();
  });

  test("panel never displays names, emails or user IDs", () => {
    seed([rec({ notes: "confirmed at gate" })]);
    renderPanel();
    expandPanel();
    expect(document.body.textContent).not.toMatch(/@|userId|faceVector|embedding|Alice/i);
  });
});
