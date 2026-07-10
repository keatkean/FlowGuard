// Facial Evaluation Lab — pure logic (no React, no network).
//
// SIMULATION-ONLY module: nothing in here calls the backend, and evaluation
// records deliberately live in localStorage under a namespaced key so they can
// never contaminate production User / Attendance / SecurityLog data.
//
// Privacy: records hold ONLY anonymised labels (P01–P05 / Unknown), numeric
// scores and free-text notes. No names, no images, no snapshots, no vectors,
// no biometric templates — and nothing here ever reads them.

export const EVAL_STORAGE_KEY = 'flowguard_facial_evaluation_records';

// Anonymised identity classes used by the confusion matrix.
export const ENROLLED_LABELS = ['P01', 'P02', 'P03', 'P04', 'P05'];
export const IDENTITY_LABELS = [...ENROLLED_LABELS, 'Unknown'];
// 'No Face' is a DETECTION outcome, tracked separately — never a person class.
export const NO_FACE = 'No Face';

export const CONDITIONS = ['front', 'left', 'right', 'normal-light', 'low-light'];
export const SOURCES = ['Live', 'Simulated'];

// ---------------------------------------------------------------------------
// Storage (localStorage-backed, injectable for tests)
// ---------------------------------------------------------------------------
const defaultStorage = () => (typeof window !== 'undefined' ? window.localStorage : null);

export function loadRecords(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(EVAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecords(records, storage = defaultStorage()) {
  if (!storage) return;
  storage.setItem(EVAL_STORAGE_KEY, JSON.stringify(records));
}

let idSeq = 0;
export function createRecord({
  actualLabel,
  predictedLabel,
  confidence = null,
  condition = 'front',
  latencyMs = null,
  source = 'Simulated',
  notes = '',
}) {
  idSeq += 1;
  return {
    id: `EV-${Date.now().toString(36)}-${idSeq}`,
    actualLabel,
    predictedLabel,
    confidence: confidence == null ? null : Number(confidence),
    condition,
    latencyMs: latencyMs == null ? null : Math.round(Number(latencyMs)),
    source,
    notes,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
export function filterRecords(records, { source = 'All', condition = 'All', date = '' } = {}) {
  return records.filter((r) => {
    if (source !== 'All' && r.source !== source) return false;
    if (condition !== 'All' && r.condition !== condition) return false;
    if (date && !(r.timestamp || '').startsWith(date)) return false; // date = YYYY-MM-DD
    return true;
  });
}

// ---------------------------------------------------------------------------
// Confusion matrix + metrics
// ---------------------------------------------------------------------------
const safeDiv = (num, den) => (den > 0 ? num / den : 0);

/**
 * rows = actual label, columns = predicted label, over IDENTITY_LABELS.
 * Records whose prediction is 'No Face' are excluded from the identity matrix
 * and reported separately as a detection-quality statistic.
 *
 * FAR = Unknown samples predicted as any enrolled P01–P05 / all Unknown samples
 * FRR = enrolled samples predicted as Unknown / all enrolled samples
 * All divisions are zero-safe (0 when the denominator is 0).
 */
export function computeConfusionMatrix(records) {
  const labels = IDENTITY_LABELS;
  const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => labels.map(() => 0));

  let noFaceCount = 0;
  const identityRecords = [];
  for (const r of records) {
    if (r.predictedLabel === NO_FACE || r.actualLabel === NO_FACE) {
      noFaceCount += 1;
      continue;
    }
    if (idx[r.actualLabel] == null || idx[r.predictedLabel] == null) continue;
    matrix[idx[r.actualLabel]][idx[r.predictedLabel]] += 1;
    identityRecords.push(r);
  }

  const sampleCount = identityRecords.length;
  let correct = 0;
  for (let i = 0; i < labels.length; i++) correct += matrix[i][i];
  const accuracy = safeDiv(correct, sampleCount);

  // Per-class precision/recall/F1, macro-averaged over classes that actually
  // appear in the data (as an actual or a prediction) — zero-safe throughout.
  const perClass = labels.map((label, i) => {
    const tp = matrix[i][i];
    const actualTotal = matrix[i].reduce((a, b) => a + b, 0);
    const predictedTotal = matrix.reduce((sum, row) => sum + row[i], 0);
    const precision = safeDiv(tp, predictedTotal);
    const recall = safeDiv(tp, actualTotal);
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, tp, actualTotal, predictedTotal, precision, recall, f1 };
  });
  const present = perClass.filter((c) => c.actualTotal > 0 || c.predictedTotal > 0);
  const macroPrecision = safeDiv(present.reduce((s, c) => s + c.precision, 0), present.length);
  const macroRecall = safeDiv(present.reduce((s, c) => s + c.recall, 0), present.length);
  const macroF1 = safeDiv(present.reduce((s, c) => s + c.f1, 0), present.length);

  // FAR / FRR
  const unknownRow = matrix[idx.Unknown];
  const unknownTotal = unknownRow.reduce((a, b) => a + b, 0);
  const falseAccepts = ENROLLED_LABELS.reduce((s, l) => s + unknownRow[idx[l]], 0);
  const far = safeDiv(falseAccepts, unknownTotal);

  let enrolledTotal = 0;
  let falseRejects = 0;
  for (const l of ENROLLED_LABELS) {
    const row = matrix[idx[l]];
    enrolledTotal += row.reduce((a, b) => a + b, 0);
    falseRejects += row[idx.Unknown];
  }
  const frr = safeDiv(falseRejects, enrolledTotal);

  const withLatency = records.filter((r) => typeof r.latencyMs === 'number');
  const avgLatencyMs = safeDiv(withLatency.reduce((s, r) => s + r.latencyMs, 0), withLatency.length);

  return {
    labels,
    matrix,
    sampleCount,
    accuracy,
    macroPrecision,
    macroRecall,
    macroF1,
    far,
    frr,
    avgLatencyMs,
    noFaceCount,
    noFaceRate: safeDiv(noFaceCount, records.length),
    perClass,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(records) {
  const header = ['id', 'actualLabel', 'predictedLabel', 'confidence', 'condition', 'latencyMs', 'source', 'notes', 'timestamp'];
  const rows = records.map((r) => header.map((h) => csvEscape(r[h])).join(','));
  return [header.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Simulation scenarios — pure, deterministic apart from latency jitter.
// They mimic the REAL pipeline's decisions without touching any endpoint.
// ---------------------------------------------------------------------------
const jitter = (base, spread) => Math.round(base + Math.random() * spread);

export const SCENARIOS = [
  {
    key: 'active',
    title: '1. Recognised Active User',
    description: 'Enrolled, active account passes recognition + liveness.',
    run: () => ({
      personLabel: 'P01',
      role: 'Staff',
      confidence: 0.93,
      accountState: 'Active',
      access: 'Access Granted',
      action: 'Simulated: attendance clock-in would be recorded (Gate Scanner only).',
      latencyMs: jitter(220, 180),
      predictedLabel: 'P01',
      actualLabel: 'P01',
      recordable: true,
    }),
  },
  {
    key: 'suspended',
    title: '2. Recognised Suspended User',
    description: 'Face matches, but the DATABASE says the account is suspended.',
    run: () => ({
      personLabel: 'P02',
      role: 'Staff',
      confidence: 0.89,
      accountState: 'Suspended',
      access: 'Access Denied',
      action: 'Simulated: deduplicated "Suspended Access Attempt" security log would be created.',
      latencyMs: jitter(240, 180),
      predictedLabel: 'P02',
      actualLabel: 'P02',
      recordable: true,
    }),
  },
  {
    key: 'unknown',
    title: '3. Unknown Person',
    description: 'A face is detected but matches no enrolled template.',
    run: () => ({
      personLabel: 'Unknown',
      role: '—',
      confidence: 0.31,
      accountState: 'Unknown',
      access: 'Access Denied',
      action: 'Simulated: deduplicated "Intrusion Alert" security log would be created.',
      latencyMs: jitter(260, 200),
      predictedLabel: 'Unknown',
      actualLabel: 'Unknown',
      recordable: true,
    }),
  },
  {
    key: 'noface',
    title: '4. No Face Detected',
    description: 'Empty frame — correct behaviour is NO suspicious log at all.',
    run: () => ({
      personLabel: '—',
      role: '—',
      confidence: 0,
      accountState: '—',
      access: 'No decision',
      action: 'Simulated: no log created — no-face frames never generate suspicious entries.',
      latencyMs: jitter(140, 120),
      predictedLabel: NO_FACE,
      actualLabel: NO_FACE,
      recordable: true,
    }),
  },
  {
    key: 'pi-offline',
    title: '5. Pi Camera Offline → Laptop Fallback',
    description: 'Snapshot probe fails 3×; the page switches to the webcam and continues.',
    run: () => ({
      personLabel: 'P03',
      role: 'Staff',
      confidence: 0.9,
      accountState: 'Active',
      access: 'Access Granted',
      action: 'Simulated: Pi probe failed ×3 → automatic laptop-webcam fallback → recognition continued.',
      latencyMs: jitter(480, 250),
      predictedLabel: 'P03',
      actualLabel: 'P03',
      recordable: true,
    }),
  },
  {
    key: 'service-offline',
    title: '6. Recognition Service Offline → Retry/Backoff',
    description: 'Node answers 503; the scan gate backs off instead of flooding the endpoint.',
    run: () => ({
      personLabel: '—',
      role: '—',
      confidence: 0,
      accountState: '—',
      access: 'No decision',
      action: 'Simulated: 503 from Node → scan-gate backoff engaged, camera preview keeps running, retry after cooldown. Camera source is NOT switched.',
      latencyMs: jitter(60, 60),
      predictedLabel: null, // no recognition attempt — excluded from the matrix
      actualLabel: null,
      recordable: false,
    }),
  },
];
