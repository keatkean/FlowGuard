import { describe, test, expect, beforeEach } from "vitest";
import {
  EVAL_STORAGE_KEY,
  EVAL_LABEL_MAP_KEY,
  SIM_USERS_KEY,
  DETECTION_OUTCOMES,
  assignLabel,
  removeMappedUser,
  saveLabelMap,
  loadLabelMap,
  saveRecords,
  loadRecords,
  saveSimUsers,
  loadSimUsers,
  buildEvaluationDraftFromRecognition,
  saveEvaluationRecordFromDraft,
  computeConfusionMatrix,
  toCsv,
} from "../../src/constants/evaluation";

beforeEach(() => {
  localStorage.clear();
});

describe("Phase 3 anonymised mapping", () => {
  test("FM can assign P01-P05 and duplicate labels are prevented", () => {
    const first = assignLabel({}, "25", "P01");
    expect(first).toEqual({ 25: "P01" });
    expect(() => assignLabel(first, "31", "P01")).toThrow(/already assigned/i);
  });

  test("mapping can be saved, loaded, updated and removed without exporting identity", () => {
    saveLabelMap({ 25: "P01", 31: "P02" });
    expect(loadLabelMap()).toEqual({ 25: "P01", 31: "P02" });
    saveLabelMap(assignLabel(loadLabelMap(), "25", "P03"));
    expect(loadLabelMap()[25]).toBe("P03");
    saveLabelMap(removeMappedUser(loadLabelMap(), "25"));
    expect(loadLabelMap()).toEqual({ 31: "P02" });
    expect(localStorage.getItem(EVAL_LABEL_MAP_KEY)).not.toMatch(/Alice|alice@example\.com|User ID/i);
  });
});

describe("Phase 3 live recognition draft recording", () => {
  test("mapped recognised users save only anonymised labels and safe telemetry", () => {
    const draft = buildEvaluationDraftFromRecognition({
      result: { user: { id: 25, name: "Alice", email: "alice@example.com", confidence: 0.91 }, timings: { totalRequestMs: 188 }, box: [1, 2, 3, 4] },
      labelMap: { 25: "P01" },
      origin: "Gate Scanner",
    });
    expect(draft).toMatchObject({ predictedLabel: "P01", confidence: 0.91, origin: "Gate Scanner" });
    const rec = saveEvaluationRecordFromDraft(draft, { actualLabel: "P02", condition: "Front", notes: "confirmed by FM" });
    saveRecords([rec]);
    const stored = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY))[0];
    expect(stored).toMatchObject({ actualLabel: "P02", predictedLabel: "P01", source: "Live", origin: "Gate Scanner" });
    expect(JSON.stringify(stored)).not.toMatch(/Alice|alice@example\.com|25|data:image|embedding|vector|template/i);
  });

  test("unmapped recognised users cannot be saved until a P-label is assigned", () => {
    const draft = buildEvaluationDraftFromRecognition({ result: { user: { id: 31, confidence: 0.8 } }, labelMap: {}, origin: "V-Patrol" });
    expect(draft.needsMapping).toBe(true);
    expect(() => saveEvaluationRecordFromDraft(draft, { actualLabel: "P01", condition: "Front" })).toThrow(/Assign evaluation label first/i);
  });

  test("unknown and no-face outcomes are distinct", () => {
    const unknown = buildEvaluationDraftFromRecognition({ result: { user: null, box: [1, 2, 3, 4], confidence: 0.2 }, labelMap: {}, origin: "Gate Scanner" });
    expect(unknown.predictedLabel).toBe("Unknown");
    const noFace = buildEvaluationDraftFromRecognition({ result: { detectionOutcome: DETECTION_OUTCOMES.NO_FACE, confidence: 0 }, labelMap: {}, origin: "V-Patrol" });
    const rec = saveEvaluationRecordFromDraft(noFace, { actualLabel: "P01", condition: "Other" });
    expect(rec).toMatchObject({ detectionOutcome: DETECTION_OUTCOMES.NO_FACE, actualLabel: null, predictedLabel: null });
  });
});

describe("Phase 3 matrix and CSV privacy", () => {
  test("No Face is excluded from identity matrix while FAR/FRR remain correct", () => {
    const stats = computeConfusionMatrix([
      { actualLabel: "P01", predictedLabel: "P01", latencyMs: 100 },
      { actualLabel: "P02", predictedLabel: "Unknown", latencyMs: 200 },
      { actualLabel: "Unknown", predictedLabel: "P03", latencyMs: 300 },
      { detectionOutcome: DETECTION_OUTCOMES.NO_FACE, latencyMs: 50 },
    ]);
    expect(stats.sampleCount).toBe(3);
    expect(stats.noFaceCount).toBe(1);
    expect(stats.accuracy).toBeCloseTo(1 / 3);
    expect(stats.far).toBe(1);
    expect(stats.frr).toBeCloseTo(0.5);
    expect(Number.isNaN(stats.macroF1)).toBe(false);
  });

  test("CSV exports safe evaluation fields only, never the private mapping or production identity", () => {
    saveLabelMap({ 25: "P01" });
    const csv = toCsv([{ id: "EV-1", actualLabel: "P01", predictedLabel: "P02", confidence: 0.7, condition: "Front", latencyMs: 123, source: "Live", origin: "V-Patrol", notes: "said \"hi\"", timestamp: "2026-07-10T00:00:00.000Z" }]);
    expect(csv.split("\n")[0]).toBe("id,actualLabel,predictedLabel,confidence,condition,latencyMs,source,origin,notes,detectionOutcome,timestamp");
    expect(csv).toContain('"said ""hi"""');
    expect(csv).not.toMatch(/flowguard_facial_evaluation_label_map|25|Alice|alice@example\.com/i);
  });
});

describe("Phase 3 simulated users", () => {
  test("simulated CRUD storage strips uploaded image and biometric material", () => {
    saveSimUsers([{ id: "SIM-1", participantLabel: "P01", role: "Staff", status: "Active", enrolled: true, enrolmentSource: "Upload", enrolledAngles: ["Front"], audit: [{ action: "created" }], image: "data:image/jpeg;base64,abc", embedding: [1, 2], vector: [3], email: "x@example.com" }]);
    const stored = localStorage.getItem(SIM_USERS_KEY);
    expect(stored).not.toMatch(/data:image|embedding|vector|x@example\.com/i);
    expect(loadSimUsers()[0]).toMatchObject({ participantLabel: "P01", enrolled: true, enrolmentSource: "Upload" });
  });

  test("loadRecords sanitizes away production identity and raw biometric fields", () => {
    localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify([{ id: "EV-2", actualLabel: "P01", predictedLabel: "P01", condition: "Front", source: "Live", origin: "Gate Scanner", userId: 25, name: "Alice", image: "data:image/png;base64,x", vector: [1] }]));
    const records = loadRecords();
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records[0])).not.toMatch(/Alice|userId|data:image|vector/i);
  });
});
