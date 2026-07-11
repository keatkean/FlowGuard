// Shared live evaluation recorder modal — saving must be pure local storage
// with zero production side effects (no recognition rerun, no API calls).
import React from "react";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import EvaluationRecorderModal from "../../src/components/EvaluationRecorderModal";
import {
  EVAL_STORAGE_KEY,
  DETECTION_OUTCOMES,
  buildEvaluationDraftFromRecognition,
} from "../../src/constants/evaluation";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => cleanup());

const matchedDraft = () => buildEvaluationDraftFromRecognition({
  result: { user: { id: 7, confidence: 0.88 }, timings: { totalRequestMs: 190 }, box: [1, 2, 3, 4] },
  labelMap: { 7: "P02" },
  origin: "Gate Scanner",
});

const noFaceDraft = () => buildEvaluationDraftFromRecognition({
  result: { detectionOutcome: DETECTION_OUTCOMES.NO_FACE, confidence: 0 },
  labelMap: {},
  origin: "V-Patrol",
});

describe("EvaluationRecorderModal", () => {
  test("shows predicted label, confidence, latency and origin; Save stores one record and closes", () => {
    const onSaved = vi.fn();
    render(<EvaluationRecorderModal open draft={matchedDraft()} onSaved={onSaved} onClose={() => {}} />);

    const telemetry = within(document.querySelector(".eval-recorder-telemetry"));
    expect(telemetry.getByText("P02")).toBeTruthy();
    expect(telemetry.getByText("88%")).toBeTruthy();
    expect(telemetry.getByText("190 ms")).toBeTruthy();
    expect(telemetry.getByText("Gate Scanner (Live)")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Actual label/), { target: { value: "P02" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Evaluation" }));

    expect(onSaved).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ actualLabel: "P02", predictedLabel: "P02", source: "Live", origin: "Gate Scanner" });
  });

  test("saving produces NO production side effects (no recognition rerun, attendance, security or user calls)", () => {
    render(<EvaluationRecorderModal open draft={matchedDraft()} onSaved={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Evaluation" }));

    expect(mockAxios.get).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(mockAxios.put).not.toHaveBeenCalled();
    expect(mockAxios.delete).not.toHaveBeenCalled();
  });

  test("No-Face drafts omit the actual identity field and record the detection outcome separately", () => {
    render(<EvaluationRecorderModal open draft={noFaceDraft()} onSaved={() => {}} onClose={() => {}} />);

    expect(screen.queryByLabelText(/Actual label/)).toBeNull();
    expect(screen.getByText("No Face")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save Evaluation" }));
    const stored = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY));
    expect(stored[0]).toMatchObject({ detectionOutcome: DETECTION_OUTCOMES.NO_FACE, actualLabel: null, predictedLabel: null, origin: "V-Patrol" });
  });

  test("unmapped users cannot be saved until a P-label mapping exists", () => {
    const draft = buildEvaluationDraftFromRecognition({
      result: { user: { id: 99, confidence: 0.7 }, box: [1, 2, 3, 4] },
      labelMap: {},
      origin: "Gate Scanner",
    });
    render(<EvaluationRecorderModal open draft={draft} onSaved={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Save Evaluation" }).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/Assign evaluation label first/);
  });

  test("Cancel closes without writing any record", () => {
    const onClose = vi.fn();
    render(<EvaluationRecorderModal open draft={matchedDraft()} onSaved={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem(EVAL_STORAGE_KEY)).toBeNull();
  });
});
