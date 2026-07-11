export const EVAL_STORAGE_KEY = 'flowguard_facial_evaluation_records';
export const EVAL_RECORDS_UPDATED_EVENT = 'flowguard:evaluation-records-updated';
export const EVAL_LABEL_MAP_KEY = 'flowguard_facial_evaluation_label_map';
export const SIM_USERS_KEY = 'flowguard_facial_simulation_users';

export const ENROLLED_LABELS = ['P01', 'P02', 'P03', 'P04', 'P05'];
export const UNKNOWN_LABEL = 'Unknown';
export const IDENTITY_LABELS = [...ENROLLED_LABELS, UNKNOWN_LABEL];
export const NO_FACE = 'No Face';
export const DETECTION_OUTCOMES = { NO_FACE: 'NO_FACE' };

export const CONDITIONS = ['Front', 'Left Angle', 'Right Angle', 'Normal Lighting', 'Low Lighting', 'Glasses', 'Other'];
export const SOURCES = ['Live', 'Simulated'];
export const ORIGINS = ['Manual', 'Gate Scanner', 'V-Patrol', 'Live Model Evaluation', 'Simulated CRUD'];
export const LEGACY_CONDITION_MAP = {
  front: 'Front',
  left: 'Left Angle',
  right: 'Right Angle',
  'normal-light': 'Normal Lighting',
  'low-light': 'Low Lighting'
};

const defaultStorage = () => (typeof window !== 'undefined' ? window.localStorage : null);
const safeJson = (raw, fallback) => {
  try {
    const parsed = raw ? JSON.parse(raw) : fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export function normalizeCondition(condition = 'Front') {
  return LEGACY_CONDITION_MAP[condition] || condition || 'Front';
}

export function normalizeLabel(label) {
  if (label === NO_FACE) return NO_FACE;
  return IDENTITY_LABELS.includes(label) ? label : UNKNOWN_LABEL;
}

export function loadRecords(storage = defaultStorage()) {
  if (!storage) return [];
  const parsed = safeJson(storage.getItem(EVAL_STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed.map(sanitizeRecord).filter(Boolean) : [];
}

export function saveRecords(records, storage = defaultStorage()) {
  if (!storage) return;
  storage.setItem(EVAL_STORAGE_KEY, JSON.stringify(records.map(sanitizeRecord).filter(Boolean)));
}

export function loadLabelMap(storage = defaultStorage()) {
  if (!storage) return {};
  const parsed = safeJson(storage.getItem(EVAL_LABEL_MAP_KEY), {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function saveLabelMap(map, storage = defaultStorage()) {
  if (!storage) return;
  const clean = {};
  Object.entries(map || {}).forEach(([userId, label]) => {
    if (ENROLLED_LABELS.includes(label)) clean[String(userId)] = label;
  });
  storage.setItem(EVAL_LABEL_MAP_KEY, JSON.stringify(clean));
}

export function labelForUserId(userId, map = loadLabelMap()) {
  if (userId == null) return null;
  return map[String(userId)] || null;
}

export function assignLabel(map, userId, label) {
  if (!userId || !ENROLLED_LABELS.includes(label)) throw new Error('Choose an enrolled user and a P01-P05 label.');
  const next = { ...(map || {}) };
  const duplicate = Object.entries(next).find(([existingUserId, existingLabel]) => existingUserId !== String(userId) && existingLabel === label);
  if (duplicate) throw new Error(`${label} is already assigned. Remove it before reusing the label.`);
  next[String(userId)] = label;
  return next;
}

export function removeMappedUser(map, userId) {
  const next = { ...(map || {}) };
  delete next[String(userId)];
  return next;
}

let idSeq = 0;
export function createRecord({
  actualLabel,
  predictedLabel,
  confidence = null,
  condition = 'Front',
  latencyMs = null,
  source = 'Simulated',
  origin = source === 'Live' ? 'Manual' : 'Simulated CRUD',
  notes = '',
  detectionOutcome = null,
  timestamp = new Date().toISOString()
}) {
  idSeq += 1;
  const isNoFace = detectionOutcome === DETECTION_OUTCOMES.NO_FACE || actualLabel === NO_FACE || predictedLabel === NO_FACE;
  return sanitizeRecord({
    id: `EV-${Date.now().toString(36)}-${idSeq}`,
    actualLabel: isNoFace ? null : normalizeLabel(actualLabel),
    predictedLabel: isNoFace ? null : normalizeLabel(predictedLabel),
    confidence: confidence == null || confidence === '' ? null : Number(confidence),
    condition: normalizeCondition(condition),
    latencyMs: latencyMs == null || latencyMs === '' ? null : Math.round(Number(latencyMs)),
    source: SOURCES.includes(source) ? source : 'Simulated',
    origin: origin || 'Manual',
    notes: String(notes || '').slice(0, 500),
    detectionOutcome: isNoFace ? DETECTION_OUTCOMES.NO_FACE : null,
    timestamp
  });
}

export function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const allowed = {
    id: record.id || `EV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    actualLabel: record.detectionOutcome === DETECTION_OUTCOMES.NO_FACE ? null : normalizeLabel(record.actualLabel),
    predictedLabel: record.detectionOutcome === DETECTION_OUTCOMES.NO_FACE ? null : normalizeLabel(record.predictedLabel),
    confidence: record.confidence == null || record.confidence === '' ? null : Number(record.confidence),
    condition: normalizeCondition(record.condition),
    latencyMs: record.latencyMs == null || record.latencyMs === '' ? null : Math.round(Number(record.latencyMs)),
    source: SOURCES.includes(record.source) ? record.source : 'Simulated',
    origin: record.origin || (record.source === 'Live' ? 'Manual' : 'Simulated CRUD'),
    notes: String(record.notes || '').slice(0, 500),
    detectionOutcome: record.detectionOutcome === DETECTION_OUTCOMES.NO_FACE ? DETECTION_OUTCOMES.NO_FACE : null,
    timestamp: record.timestamp || new Date().toISOString()
  };
  if (allowed.detectionOutcome !== DETECTION_OUTCOMES.NO_FACE && (!allowed.actualLabel || !allowed.predictedLabel)) return null;
  return allowed;
}

export function loadSimUsers(storage = defaultStorage()) {
  if (!storage) return [];
  const parsed = safeJson(storage.getItem(SIM_USERS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveSimUsers(users, storage = defaultStorage()) {
  if (!storage) return;
  const clean = (users || []).map((user) => ({
    id: user.id,
    participantLabel: user.participantLabel,
    role: user.role,
    status: user.status,
    enrolled: Boolean(user.enrolled),
    enrolmentSource: user.enrolmentSource,
    enrolledAngles: Array.isArray(user.enrolledAngles) ? user.enrolledAngles : [],
    audit: Array.isArray(user.audit) ? user.audit.slice(-20) : [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }));
  storage.setItem(SIM_USERS_KEY, JSON.stringify(clean));
}

// Tolerant key for matching origins/sources: ignores case, spacing and
// punctuation so "gate scanner" / "Gate-Scanner" both match "Gate Scanner".
export function normalizeOriginKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Notify any embedded live-matrix panels that the stored records changed —
// pure UI refresh signal; never triggers recognition or production writes.
export function notifyEvaluationRecordsUpdated(detail = {}) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(EVAL_RECORDS_UPDATED_EVENT, { detail }));
  }
}

export function filterRecords(records, { source = 'All', condition = 'All', date = '', origin = 'All' } = {}) {
  return records.filter((r) => {
    if (source !== 'All' && normalizeOriginKey(r.source) !== normalizeOriginKey(source)) return false;
    if (condition !== 'All' && normalizeCondition(r.condition) !== normalizeCondition(condition)) return false;
    if (origin !== 'All' && normalizeOriginKey(r.origin) !== normalizeOriginKey(origin)) return false;
    if (date && !(r.timestamp || '').startsWith(date)) return false;
    return true;
  });
}

const safeDiv = (num, den) => (den > 0 ? num / den : 0);

export function computeConfusionMatrix(records) {
  const labels = IDENTITY_LABELS;
  const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => labels.map(() => 0));
  let noFaceCount = 0;
  const identityRecords = [];

  for (const r of records) {
    if (r.detectionOutcome === DETECTION_OUTCOMES.NO_FACE || r.actualLabel === NO_FACE || r.predictedLabel === NO_FACE) {
      noFaceCount += 1;
      continue;
    }
    const actual = normalizeLabel(r.actualLabel);
    const predicted = normalizeLabel(r.predictedLabel);
    if (idx[actual] == null || idx[predicted] == null) continue;
    matrix[idx[actual]][idx[predicted]] += 1;
    identityRecords.push({ ...r, actualLabel: actual, predictedLabel: predicted });
  }

  const sampleCount = identityRecords.length;
  let correct = 0;
  for (let i = 0; i < labels.length; i++) correct += matrix[i][i];
  const accuracy = safeDiv(correct, sampleCount);

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

  const withLatency = records.filter((r) => typeof r.latencyMs === 'number' && Number.isFinite(r.latencyMs));
  const avgLatencyMs = safeDiv(withLatency.reduce((s, r) => s + r.latencyMs, 0), withLatency.length);

  return { labels, matrix, sampleCount, accuracy, macroPrecision, macroRecall, macroF1, far, frr, avgLatencyMs, noFaceCount, noFaceRate: safeDiv(noFaceCount, records.length), perClass };
}

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(records) {
  const header = ['id', 'actualLabel', 'predictedLabel', 'confidence', 'condition', 'latencyMs', 'source', 'origin', 'notes', 'detectionOutcome', 'timestamp'];
  const rows = records.map((r) => header.map((h) => csvEscape(r[h])).join(','));
  return [header.join(','), ...rows].join('\n');
}

export function buildEvaluationDraftFromRecognition({ result, labelMap = {}, source = 'Live', origin = 'Manual' }) {
  const user = result?.user || null;
  const timings = result?.timings || {};
  const noFace = result?.detectionOutcome === DETECTION_OUTCOMES.NO_FACE || (result && !result.box && !user);
  if (noFace) {
    return {
      detectionOutcome: DETECTION_OUTCOMES.NO_FACE,
      actualLabel: null,
      predictedLabel: null,
      confidence: result?.confidence ?? user?.confidence ?? 0,
      latencyMs: timings.totalRequestMs ?? timings.nodeToAiMs ?? result?.latencyMs ?? null,
      source,
      origin,
      notes: ''
    };
  }
  const mapped = labelForUserId(user?.id, labelMap);
  return {
    actualLabel: UNKNOWN_LABEL,
    predictedLabel: user?.id == null ? UNKNOWN_LABEL : mapped,
    needsMapping: Boolean(user?.id != null && !mapped),
    matchedUserId: user?.id ?? result?.matchedUserId ?? null,
    confidence: user?.confidence ?? result?.confidence ?? null,
    latencyMs: timings.totalRequestMs ?? timings.nodeToAiMs ?? result?.latencyMs ?? null,
    source,
    origin,
    notes: ''
  };
}

export function saveEvaluationRecordFromDraft(draft, { actualLabel, condition, notes = '' }) {
  if (draft.needsMapping) throw new Error('Assign evaluation label first.');
  if (draft.detectionOutcome === DETECTION_OUTCOMES.NO_FACE) {
    return createRecord({ detectionOutcome: DETECTION_OUTCOMES.NO_FACE, condition, confidence: draft.confidence, latencyMs: draft.latencyMs, source: draft.source, origin: draft.origin, notes });
  }
  if (!IDENTITY_LABELS.includes(actualLabel)) throw new Error('Choose the actual ground-truth label.');
  return createRecord({ actualLabel, predictedLabel: draft.predictedLabel || UNKNOWN_LABEL, confidence: draft.confidence, condition, latencyMs: draft.latencyMs, source: draft.source, origin: draft.origin, notes });
}

const jitter = (base, spread) => Math.round(base + Math.random() * spread);
export const SCENARIOS = [
  { key: 'active', title: '1. Recognised Active User', description: 'Enrolled, active account passes recognition and liveness.', run: () => ({ personLabel: 'P01', role: 'Staff', confidence: 0.93, accountState: 'Active', access: 'Access Granted', action: 'Simulated: attendance clock-in would be recorded (Gate Scanner only).', latencyMs: jitter(220, 180), predictedLabel: 'P01', actualLabel: 'P01', recordable: true }) },
  { key: 'suspended', title: '2. Recognised Suspended User', description: 'Face matches, but the database says the account is suspended.', run: () => ({ personLabel: 'P02', role: 'Staff', confidence: 0.89, accountState: 'Suspended', access: 'Access Denied', action: 'Simulated: deduplicated Suspended Access Attempt security log would be created.', latencyMs: jitter(240, 180), predictedLabel: 'P02', actualLabel: 'P02', recordable: true }) },
  { key: 'unknown', title: '3. Unknown Person', description: 'A face is detected but matches no enrolled template.', run: () => ({ personLabel: 'Unknown', role: '-', confidence: 0.31, accountState: 'Unknown', access: 'Access Denied', action: 'Simulated: deduplicated Intrusion Alert security log would be created.', latencyMs: jitter(260, 200), predictedLabel: 'Unknown', actualLabel: 'Unknown', recordable: true }) },
  { key: 'noface', title: '4. No Face Detected', description: 'Empty frame; correct behaviour is no suspicious production log.', run: () => ({ personLabel: '-', role: '-', confidence: 0, accountState: '-', access: 'No decision', action: 'Simulated: no log created; no-face frames never generate suspicious entries.', latencyMs: jitter(140, 120), detectionOutcome: DETECTION_OUTCOMES.NO_FACE, predictedLabel: NO_FACE, actualLabel: NO_FACE, recordable: true }) },
  { key: 'pi-offline', title: '5. Pi Camera Offline -> Laptop Fallback', description: 'Snapshot probe fails; the page switches to the webcam and continues.', run: () => ({ personLabel: 'P03', role: 'Staff', confidence: 0.9, accountState: 'Active', access: 'Access Granted', action: 'Simulated: Pi probe failed x3 -> automatic laptop-webcam fallback -> recognition continued.', latencyMs: jitter(480, 250), predictedLabel: 'P03', actualLabel: 'P03', recordable: true }) },
  { key: 'service-offline', title: '6. Recognition Service Offline -> Retry/Backoff', description: 'Node answers 503; the scan gate backs off instead of flooding the endpoint.', run: () => ({ personLabel: '-', role: '-', confidence: 0, accountState: '-', access: 'No decision', action: 'Simulated: 503 from Node -> scan-gate backoff engaged, camera preview keeps running, retry after cooldown. Camera source is not switched.', latencyMs: jitter(60, 60), predictedLabel: null, actualLabel: null, recordable: false }) }
];