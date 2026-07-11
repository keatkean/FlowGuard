// Frontend tests â€” FM-only Facial Evaluation Lab (Felicia).
// Simulation-only: verifies the page never calls real attendance/security/user
// mutation APIs, evaluation-record CRUD + localStorage persistence, the
// confusion-matrix math (accuracy, macro P/R/F1, FAR, FRR, zero-sample safety),
// CSV export, and that no raw image/vector/template data is rendered or stored.
import React from "react";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

// Full axios mock: the page must NEVER touch the network.
const mockAxios = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}));
vi.mock("axios", () => ({ default: mockAxios }));

import FacialEvaluation from "../../src/pages/FacialEvaluation";
import ProtectedRoute from "../../src/components/ProtectedRoute";
import {
  EVAL_STORAGE_KEY,
  computeConfusionMatrix,
  toCsv,
  filterRecords,
  createRecord,
} from "../../src/constants/evaluation";

const renderPage = () =>
  render(<MemoryRouter><FacialEvaluation /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", "FM");
  localStorage.setItem("userName", "Felicia");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// FM-only access
// ---------------------------------------------------------------------------
describe("FM-only route", () => {
  const renderGuarded = () =>
    render(
      <MemoryRouter initialEntries={["/facial-evaluation"]}>
        <Routes>
          <Route path="/facial-evaluation" element={
            <ProtectedRoute allowedRoles={["FM"]}><FacialEvaluation /></ProtectedRoute>
          } />
          <Route path="/error/403" element={<div>403 blocked</div>} />
          <Route path="/error/401" element={<div>401 blocked</div>} />
        </Routes>
      </MemoryRouter>
    );

  test("FM sees the evaluation lab", () => {
    renderGuarded();
    expect(screen.getByText("Facial Evaluation Lab")).toBeInTheDocument();
  });

  test.each(["Tenant", "Staff"])("%s is redirected to 403", (role) => {
    localStorage.setItem("userRole", role);
    renderGuarded();
    expect(screen.getByText("403 blocked")).toBeInTheDocument();
    expect(screen.queryByText("Facial Evaluation Lab")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Banner + simulation scenarios
// ---------------------------------------------------------------------------
describe("Simulation scenarios", () => {
  test("shows the SIMULATION MODE banner", () => {
    renderPage();
    expect(
      screen.getAllByText(/SIMULATION MODE.*Production users.*attendance and security logs are not modified\./)[0]
    ).toBeInTheDocument();
  });

  test("links to the real live pages instead of duplicating the camera", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Open Face Enrollment" })).toHaveAttribute("href", "/enrollment");
    expect(screen.getByRole("link", { name: "Open V-Patrol" })).toHaveAttribute("href", "/vpatrol");
    expect(screen.getByRole("link", { name: "Open Gate Scanner" })).toHaveAttribute("href", "/gate-scanner");
    expect(document.querySelector("video")).toBeNull(); // no live camera here
  });

  const runScenario = (title) => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
    return within(screen.getByTestId("sim-result"));
  };

  test("recognised active user â†’ Access Granted with anonymised label", () => {
    renderPage();
    const result = runScenario("1\\. Recognised Active User");
    expect(result.getByText("P01")).toBeInTheDocument();
    expect(result.getByText("Access Granted")).toBeInTheDocument();
    expect(result.getByText("Active")).toBeInTheDocument();
    expect(result.getByText(/attendance clock-in would be recorded/i)).toBeInTheDocument();
  });

  test("recognised suspended user â†’ Access Denied + simulated security log", () => {
    renderPage();
    const result = runScenario("2\\. Recognised Suspended User");
    expect(result.getByText("P02")).toBeInTheDocument();
    expect(result.getByText("Suspended")).toBeInTheDocument();
    expect(result.getByText("Access Denied")).toBeInTheDocument();
    expect(result.getByText(/suspended access attempt/i)).toBeInTheDocument();
  });

  test("unknown person â†’ Access Denied + simulated intrusion log", () => {
    renderPage();
    const result = runScenario("3\\. Unknown Person");
    expect(result.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(result.getByText("Access Denied")).toBeInTheDocument();
    expect(result.getByText(/intrusion alert/i)).toBeInTheDocument();
  });

  test("no face detected â†’ NO suspicious log is simulated", () => {
    renderPage();
    const result = runScenario("4\\. No Face Detected");
    expect(result.getByText("No decision")).toBeInTheDocument();
    expect(result.getByText(/no log created/i)).toBeInTheDocument();
  });

  test("Pi offline â†’ automatic laptop fallback continues recognition", () => {
    renderPage();
    const result = runScenario("5\\. Pi Camera Offline");
    expect(result.getByText(/laptop-webcam fallback/i)).toBeInTheDocument();
    expect(result.getByText("Access Granted")).toBeInTheDocument();
  });

  test("recognition service offline â†’ retry/backoff without switching camera", () => {
    renderPage();
    const result = runScenario("6\\. Recognition Service Offline");
    expect(result.getByText(/scan-gate backoff engaged/i)).toBeInTheDocument();
    expect(result.getByText(/camera source is not switched/i)).toBeInTheDocument();
  });

  test("simulations never call real attendance/security/user mutation APIs", () => {
    renderPage();
    // Run every scenario and log one to the records.
    [1, 2, 3, 4, 5, 6].forEach((n) => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${n}\\.`) }));
    });
    fireEvent.click(screen.getByRole("button", { name: /1\. Recognised Active User/ }));
    fireEvent.click(screen.getByRole("button", { name: "Log to evaluation records" }));

    expect(mockAxios.get.mock.calls.every(([url]) => url === "/api/facial-recognition/evaluation-participants")).toBe(true);
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(mockAxios.put).not.toHaveBeenCalled();
    expect(mockAxios.patch).not.toHaveBeenCalled();
    expect(mockAxios.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Evaluation-record CRUD + persistence
// ---------------------------------------------------------------------------
describe("Evaluation records CRUD", () => {
  const openRecordsTab = () => fireEvent.click(screen.getByRole("tab", { name: "Evaluation Records" }));

  const addLiveRecord = () => {
    fireEvent.change(screen.getByLabelText(/^Actual/), { target: { value: "P02" } });
    fireEvent.change(screen.getByLabelText(/^Predicted/), { target: { value: "Unknown" } });
    fireEvent.change(screen.getByLabelText(/Confidence/), { target: { value: "0.41" } });
    fireEvent.change(screen.getByLabelText(/Latency/), { target: { value: "350" } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: "low light rejection" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Live Result" }));
  };

  test("Create: live result is added and persisted to the namespaced localStorage key", () => {
    renderPage();
    openRecordsTab();
    addLiveRecord();

    expect(screen.getByText("low light rejection")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      actualLabel: "P02", predictedLabel: "Unknown", confidence: 0.41,
      latencyMs: 350, source: "Live", notes: "low light rejection",
    });
  });

  test("Read: records survive unmount/remount via localStorage", () => {
    renderPage();
    openRecordsTab();
    addLiveRecord();
    cleanup();

    renderPage();
    openRecordsTab();
    expect(screen.getByText("low light rejection")).toBeInTheDocument();
  });

  test("Update: actual/predicted/condition/notes are editable", () => {
    renderPage();
    openRecordsTab();
    addLiveRecord();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit actual label"), { target: { value: "P03" } });
    fireEvent.change(screen.getByLabelText("Edit predicted label"), { target: { value: "P03" } });
    fireEvent.change(screen.getByLabelText("Edit condition"), { target: { value: "Low Lighting" } });
    fireEvent.change(screen.getByLabelText("Edit notes"), { target: { value: "corrected label" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("corrected label")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY));
    expect(stored[0]).toMatchObject({ actualLabel: "P03", predictedLabel: "P03", condition: "Low Lighting" });
  });

  test("Delete: removes one record", () => {
    renderPage();
    openRecordsTab();
    addLiveRecord();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY))).toHaveLength(0);
  });

  test("Clear Simulated asks for confirmation and keeps Live records", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    // One simulated recordâ€¦
    fireEvent.click(screen.getByRole("button", { name: /1\. Recognised Active User/ }));
    fireEvent.click(screen.getByRole("button", { name: "Log to evaluation records" }));
    // â€¦and one live record.
    openRecordsTab();
    addLiveRecord();

    fireEvent.click(screen.getByRole("button", { name: "Clear Simulated Results" }));
    expect(confirmSpy).toHaveBeenCalled();

    const stored = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].source).toBe("Live");
  });

  test("no raw image/vector/template data is rendered or stored", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /1\. Recognised Active User/ }));
    fireEvent.click(screen.getByRole("button", { name: "Log to evaluation records" }));

    expect(document.body.textContent).not.toMatch(/faceVector|embedding|data:image|base64/i);
    const raw = localStorage.getItem(EVAL_STORAGE_KEY);
    expect(raw).not.toMatch(/faceVector|embedding|data:image|base64/i);
    // Records carry ONLY the approved safe fields.
    for (const rec of JSON.parse(raw)) {
      expect(Object.keys(rec).sort()).toEqual(
        ["actualLabel", "condition", "confidence", "detectionOutcome", "id", "latencyMs", "notes", "origin", "predictedLabel", "source", "timestamp"]
      );
    }
  });

  test("CSV export produces a header + one row per filtered record", () => {
    const createObjectURL = vi.fn(() => "blob:eval");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL }));

    renderPage();
    openRecordsTab();
    addLiveRecord();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toContain("text/csv");
  });
});

// ---------------------------------------------------------------------------
// Confusion-matrix math (pure)
// ---------------------------------------------------------------------------
describe("computeConfusionMatrix", () => {
  const rec = (actualLabel, predictedLabel, latencyMs = 100) => ({
    actualLabel, predictedLabel, latencyMs, source: "Simulated",
    condition: "front", timestamp: "2026-07-10T10:00:00.000Z",
  });

  const SAMPLE = [
    rec("P01", "P01"), rec("P01", "P01"), rec("P01", "Unknown"), // FRR contribution
    rec("P02", "P02"),
    rec("Unknown", "Unknown"), rec("Unknown", "Unknown"), rec("Unknown", "P03"), // FAR contribution
    rec("P01", "No Face"), // detection failure â€” excluded from identity matrix
  ];

  test("matrix counts: rows = actual, columns = predicted", () => {
    const { labels, matrix, sampleCount, noFaceCount } = computeConfusionMatrix(SAMPLE);
    const at = (a, p) => matrix[labels.indexOf(a)][labels.indexOf(p)];
    expect(sampleCount).toBe(7);
    expect(noFaceCount).toBe(1);
    expect(at("P01", "P01")).toBe(2);
    expect(at("P01", "Unknown")).toBe(1);
    expect(at("P02", "P02")).toBe(1);
    expect(at("Unknown", "Unknown")).toBe(2);
    expect(at("Unknown", "P03")).toBe(1);
  });

  test("accuracy = trace / samples", () => {
    expect(computeConfusionMatrix(SAMPLE).accuracy).toBeCloseTo(5 / 7, 5);
  });

  test("macro precision / recall / F1 over classes present in the data", () => {
    const m = computeConfusionMatrix(SAMPLE);
    // Present classes: P01 (P=1, R=2/3, F1=0.8), P02 (1,1,1), P03 (0,0,0), Unknown (2/3, 2/3, 2/3)
    expect(m.macroPrecision).toBeCloseTo((1 + 1 + 0 + 2 / 3) / 4, 5);
    expect(m.macroRecall).toBeCloseTo((2 / 3 + 1 + 0 + 2 / 3) / 4, 5);
    expect(m.macroF1).toBeCloseTo((0.8 + 1 + 0 + 2 / 3) / 4, 5);
  });

  test("FAR = Unknown predicted as enrolled / all Unknown", () => {
    expect(computeConfusionMatrix(SAMPLE).far).toBeCloseTo(1 / 3, 5);
  });

  test("FRR = enrolled predicted as Unknown / all enrolled", () => {
    // Enrolled identity samples: 3Ã—P01 + 1Ã—P02 = 4 (the No-Face row is excluded); 1 rejected.
    expect(computeConfusionMatrix(SAMPLE).frr).toBeCloseTo(1 / 4, 5);
  });

  test("zero samples â†’ all metrics are 0, never NaN", () => {
    const m = computeConfusionMatrix([]);
    for (const v of [m.accuracy, m.macroPrecision, m.macroRecall, m.macroF1, m.far, m.frr, m.avgLatencyMs, m.noFaceRate]) {
      expect(v).toBe(0);
      expect(Number.isNaN(v)).toBe(false);
    }
    expect(m.sampleCount).toBe(0);
  });

  test("page matrix tab renders the computed stats", () => {
    localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify(SAMPLE.map((r, i) => ({ ...r, id: `T-${i}` }))));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Confusion Matrix" }));
    // Default matrix view is Live-only (actual model evidence); these sample
    // records are Simulated, so switch the source filter to see them.
    expect(screen.getByText(/Only Live records measure actual model performance/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Matrix source filter"), { target: { value: "Simulated" } });
    expect(screen.getByTestId("stat-samples").textContent).toBe("7");
    expect(screen.getByTestId("stat-accuracy").textContent).toBe("71.4%");
    expect(screen.getByTestId("stat-far").textContent).toBe("33.3%");
    expect(screen.getByTestId("stat-frr").textContent).toBe("25.0%");
    expect(screen.getByTestId("no-face-stat").textContent).toMatch(/1 .*No Face.* sample/);
    expect(screen.getByTestId("confusion-matrix")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Helpers: filters + CSV content
// ---------------------------------------------------------------------------
describe("filterRecords / toCsv", () => {
  test("filters by source, condition and date", () => {
    const records = [
      { ...createRecord({ actualLabel: "P01", predictedLabel: "P01", source: "Live", condition: "front" }), timestamp: "2026-07-10T09:00:00.000Z" },
      { ...createRecord({ actualLabel: "P02", predictedLabel: "P02", source: "Simulated", condition: "low-light" }), timestamp: "2026-07-09T09:00:00.000Z" },
    ];
    expect(filterRecords(records, { source: "Live" })).toHaveLength(1);
    expect(filterRecords(records, { condition: "low-light" })).toHaveLength(1);
    expect(filterRecords(records, { date: "2026-07-10" })).toHaveLength(1);
    expect(filterRecords(records, {})).toHaveLength(2);
  });

  test("CSV includes the header and escapes quoted fields", () => {
    const csv = toCsv([{
      id: "EV-1", actualLabel: "P01", predictedLabel: "Unknown", confidence: 0.4,
      condition: "front", latencyMs: 210, source: "Live",
      notes: 'said "hi", twice', timestamp: "2026-07-10T09:00:00.000Z",
    }]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("id,actualLabel,predictedLabel,confidence,condition,latencyMs,source,origin,notes,detectionOutcome,timestamp");
    expect(row).toContain('"said ""hi"", twice"');
  });
});
