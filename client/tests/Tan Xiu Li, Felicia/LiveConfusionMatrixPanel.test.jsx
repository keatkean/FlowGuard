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

const expandPanel = () => fireEvent.click(screen.getByRole("button", { name: /Live Recognition Performance/ }));

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
    expandPanel();

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
    expandPanel();

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
    expandPanel();

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const noFace = within(panel).getByText("No Face Tests").parentElement;
    expect(noFace.querySelector("strong").textContent).toBe("1");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("1");
    // The compact matrix never includes a "No Face" row or column.
    const table = within(panel).getByTestId("live-matrix-gatescanner-table");
    expect(table.textContent).not.toMatch(/No Face/);
  });

  test("empty state explains how to generate the matrix instead of showing fake 0% metrics", () => {
    renderPanel();
    expandPanel();
    expect(screen.getByText(/No confirmed live evaluation records yet\. Complete a live scan and record its ground-truth result/)).toBeTruthy();
    expect(screen.queryByText("Accuracy")).toBeNull();
    expect(screen.queryByText("0.0%")).toBeNull();
  });

  test("updates immediately (and expands) when a record-saved event fires — no page refresh", () => {
    renderPanel();
    // collapsed by default so it never obstructs scanning
    expect(screen.queryByText(/No confirmed live evaluation records yet/)).toBeNull();

    act(() => {
      saveRecords([createRecord({ actualLabel: "P01", predictedLabel: "P01", source: "Live", origin: "Gate Scanner", latencyMs: 150 }), ...loadRecords()]);
      notifyEvaluationRecordsUpdated({ origin: "Gate Scanner" });
    });

    const panel = screen.getByTestId("live-matrix-gatescanner");
    const samples = within(panel).getByText("Confirmed Live Samples").parentElement;
    expect(samples.querySelector("strong").textContent).toBe("1");
  });

  test("panel never displays names, emails or user IDs", () => {
    seed([rec({ notes: "confirmed at gate" })]);
    renderPanel();
    expandPanel();
    expect(document.body.textContent).not.toMatch(/@|userId|faceVector|embedding|Alice/i);
  });
});
