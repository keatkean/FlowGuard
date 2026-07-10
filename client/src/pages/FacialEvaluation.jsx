import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/FacialEvaluation.css';
import { API_BASE_URL } from '../constants/api';
import { CAMERA_SOURCES, CAMERA_STATUS_MESSAGES, isPiCameraReachable, fetchPiSnapshotBitmap } from '../constants/piCamera';
import {
  SCENARIOS,
  ENROLLED_LABELS,
  IDENTITY_LABELS,
  NO_FACE,
  UNKNOWN_LABEL,
  CONDITIONS,
  SOURCES,
  ORIGINS,
  EVAL_STORAGE_KEY,
  EVAL_LABEL_MAP_KEY,
  SIM_USERS_KEY,
  DETECTION_OUTCOMES,
  loadRecords,
  saveRecords,
  createRecord,
  filterRecords,
  computeConfusionMatrix,
  toCsv,
  loadLabelMap,
  saveLabelMap,
  assignLabel,
  removeMappedUser,
  labelForUserId,
  loadSimUsers,
  saveSimUsers,
  buildEvaluationDraftFromRecognition,
  saveEvaluationRecordFromDraft,
} from '../constants/evaluation';

const formatPct = (v) => `${(v * 100).toFixed(1)}%`;
const nowIso = () => new Date().toISOString();

const FacialEvaluation = () => {
  const [activeTab, setActiveTab] = useState('sim');
  const [records, setRecords] = useState(() => loadRecords());
  const [filters, setFilters] = useState({ source: 'All', condition: 'All', date: '', origin: 'All' });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const [labelMap, setLabelMap] = useState(() => loadLabelMap());
  const [enrolledUsers, setEnrolledUsers] = useState([]);
  const [mappingDraft, setMappingDraft] = useState({ userId: '', label: 'P01' });
  const [mappingError, setMappingError] = useState('');

  const [liveInput, setLiveInput] = useState({ actualLabel: 'P01', condition: 'Front', notes: '' });
  const [liveResult, setLiveResult] = useState(null);
  const [liveDraft, setLiveDraft] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [cameraSource, setCameraSource] = useState(CAMERA_SOURCES.PI);
  const [cameraStatusMsg, setCameraStatusMsg] = useState('Pi camera is preferred for live evaluation.');
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null);
  const [uploadFrame, setUploadFrame] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [lastResult, setLastResult] = useState(null);
  const [simCondition, setSimCondition] = useState('Front');
  const [simUsers, setSimUsers] = useState(() => loadSimUsers());
  const [simForm, setSimForm] = useState({ participantLabel: 'P01', role: 'Staff', enrolmentSource: 'Pi' });
  const [simScenario, setSimScenario] = useState('active');
  const [simMessage, setSimMessage] = useState('');

  const [liveForm, setLiveForm] = useState({ actualLabel: 'P01', predictedLabel: 'P01', confidence: '', condition: 'Front', latencyMs: '', origin: 'Manual', notes: '' });

  const token = localStorage.getItem('accessToken');

  const persist = (next) => {
    const clean = next.filter(Boolean);
    setRecords(clean);
    saveRecords(clean);
  };
  const persistMap = (next) => { setLabelMap(next); saveLabelMap(next); };
  const persistSimUsers = (next) => { setSimUsers(next); saveSimUsers(next); };

  useEffect(() => () => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    stopWebcam();
  }, [uploadPreviewUrl]);

  const loadEnrolledUsers = async () => {
    setMappingError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/user`, { headers: { Authorization: `Bearer ${token}` } });
      setEnrolledUsers((Array.isArray(res.data) ? res.data : []).filter((u) => u.isEnrolled));
    } catch {
      setMappingError('Could not load enrolled users. Check FM access and server availability.');
    }
  };

  const saveMapping = () => {
    try {
      const next = assignLabel(labelMap, mappingDraft.userId, mappingDraft.label);
      persistMap(next);
      setMappingError('');
    } catch (err) {
      setMappingError(err.message);
    }
  };

  const initLiveCamera = async () => {
    setLiveError('');
    const piReachable = await isPiCameraReachable();
    if (piReachable) {
      stopWebcam();
      setCameraSource(CAMERA_SOURCES.PI);
      setCameraStatusMsg(CAMERA_STATUS_MESSAGES.PI_CONNECTED);
    } else {
      setCameraSource(CAMERA_SOURCES.WEBCAM);
      setCameraStatusMsg(CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE);
      await startWebcam();
    }
  };

  const startWebcam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setLiveError('No webcam is available. Use temporary upload instead.');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (videoRef.current) videoRef.current.srcObject = stream;
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const frameFromCamera = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (cameraSource === CAMERA_SOURCES.PI) {
      const bitmap = await fetchPiSnapshotBitmap();
      const scale = Math.min(1, 640 / bitmap.width);
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg', 0.4);
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.4);
  };

  const handleUpload = (file) => {
    if (!file) return;
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    const url = URL.createObjectURL(file);
    setUploadPreviewUrl(url);
    const reader = new FileReader();
    reader.onload = (event) => setUploadFrame(event.target.result);
    reader.readAsDataURL(file);
  };

  const runLiveEvaluate = async (mode = 'camera') => {
    setLiveError('');
    setLiveResult(null);
    setLiveDraft(null);
    try {
      const frame = mode === 'upload' ? uploadFrame : await frameFromCamera();
      if (!frame) {
        setLiveError('No temporary frame is available. Capture from camera or choose an upload.');
        return;
      }
      const started = Date.now();
      const res = await axios.post(`${API_BASE_URL}/api/facial-recognition/evaluate`, { image: frame }, { headers: { Authorization: `Bearer ${token}` } });
      const result = {
        matchedUserId: res.data.matchedUserId,
        outcome: res.data.outcome,
        confidence: res.data.confidence,
        box: res.data.box,
        liveness: res.data.liveness,
        timings: { ...(res.data.timings || {}), totalRequestMs: res.data.timings?.totalRequestMs ?? Date.now() - started },
        user: res.data.outcome === 'MATCHED' ? { id: res.data.matchedUserId, confidence: res.data.confidence } : res.data.outcome === 'UNKNOWN' ? { id: null, confidence: res.data.confidence } : null,
        detectionOutcome: res.data.outcome === 'NO_FACE' ? DETECTION_OUTCOMES.NO_FACE : null
      };
      setLiveResult(result);
      setLiveDraft(buildEvaluationDraftFromRecognition({ result, labelMap, origin: 'Live Model Evaluation' }));
    } catch (err) {
      setLiveError(err.response?.data?.error || 'Model evaluation failed. Camera source is unchanged; retry when the service is ready.');
    }
  };

  const saveLiveDraft = () => {
    try {
      const rec = saveEvaluationRecordFromDraft(liveDraft, { actualLabel: liveInput.actualLabel, condition: liveInput.condition, notes: liveInput.notes });
      persist([rec, ...records]);
      setLiveInput({ ...liveInput, notes: '' });
      setLiveError('Live evaluation result recorded');
    } catch (err) {
      setLiveError(err.message);
    }
  };

  const runScenario = (scenario) => setLastResult({ title: scenario.title, ...scenario.run() });
  const logLastResult = () => {
    if (!lastResult?.recordable) return;
    const rec = createRecord({
      actualLabel: lastResult.actualLabel,
      predictedLabel: lastResult.predictedLabel,
      detectionOutcome: lastResult.detectionOutcome,
      confidence: lastResult.confidence,
      condition: simCondition,
      latencyMs: lastResult.latencyMs,
      source: 'Simulated',
      origin: 'Simulated CRUD',
      notes: lastResult.title,
    });
    persist([rec, ...records]);
  };

  const createSimParticipant = () => {
    if (simUsers.some((u) => u.participantLabel === simForm.participantLabel)) {
      setSimMessage(`${simForm.participantLabel} is already simulated.`);
      return;
    }
    const participant = {
      id: `SIM-${Date.now().toString(36)}`,
      participantLabel: simForm.participantLabel,
      role: simForm.role,
      status: 'Active',
      enrolled: true,
      enrolmentSource: simForm.enrolmentSource,
      enrolledAngles: ['Front', 'Left Angle', 'Right Angle'],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      audit: [{ at: nowIso(), event: `Simulated enrolment via ${simForm.enrolmentSource}` }]
    };
    persistSimUsers([participant, ...simUsers]);
    setSimMessage(`${participant.participantLabel} created in simulation only.`);
  };

  const updateSimParticipant = (id, patch, event) => {
    persistSimUsers(simUsers.map((u) => u.id === id ? { ...u, ...patch, updatedAt: nowIso(), audit: [...(u.audit || []), { at: nowIso(), event }] } : u));
  };

  const deleteSimParticipant = (id) => {
    const target = simUsers.find((u) => u.id === id);
    if (!window.confirm(`Delete simulated ${target?.participantLabel}? This does not delete a production User.`)) return;
    persistSimUsers(simUsers.filter((u) => u.id !== id));
    persist(records.filter((r) => !(r.source === 'Simulated' && r.notes?.includes(target?.participantLabel))));
    setSimMessage(`Simulated ${target?.participantLabel} removed; production users were not touched.`);
  };

  const scanSimParticipant = () => {
    const participant = simUsers[0];
    if (!participant || simScenario === 'unknown') {
      setLastResult({ title: 'Simulated Unknown Person', personLabel: 'Unknown', role: '-', confidence: 0.22, accountState: 'Unknown', access: 'Access Denied', action: 'Simulated read: unknown person denied.', latencyMs: 210, predictedLabel: 'Unknown', actualLabel: 'Unknown', recordable: true });
      return;
    }
    if (simScenario === 'noface') {
      setLastResult({ title: 'Simulated No Face', personLabel: '-', role: '-', confidence: 0, accountState: '-', access: 'No decision', action: 'Simulated read: no face detected, no production log.', latencyMs: 120, detectionOutcome: DETECTION_OUTCOMES.NO_FACE, predictedLabel: NO_FACE, actualLabel: NO_FACE, recordable: true });
      return;
    }
    const suspended = simScenario === 'suspended' || participant.status === 'Suspended';
    const lowConfidence = simScenario === 'low-confidence';
    const livenessIncomplete = simScenario === 'liveness-incomplete';
    setLastResult({ title: `Simulated Read: ${participant.participantLabel}`, personLabel: participant.participantLabel, role: participant.role, confidence: lowConfidence ? 0.42 : 0.91, accountState: suspended ? 'Suspended' : 'Active', access: suspended || lowConfidence || livenessIncomplete ? 'Access Denied' : 'Access Granted', action: livenessIncomplete ? 'Simulated read: liveness incomplete, retry/backoff.' : 'Simulated read only; no production API called.', latencyMs: 240, predictedLabel: lowConfidence ? 'Unknown' : participant.participantLabel, actualLabel: participant.participantLabel, recordable: true });
  };

  const addLiveRecord = (e) => {
    e.preventDefault();
    const rec = createRecord({ ...liveForm, confidence: liveForm.confidence, latencyMs: liveForm.latencyMs, source: 'Live', origin: liveForm.origin });
    persist([rec, ...records]);
    setLiveForm((f) => ({ ...f, confidence: '', latencyMs: '', notes: '' }));
  };
  const startEdit = (rec) => { setEditingId(rec.id); setEditDraft({ actualLabel: rec.actualLabel || 'P01', predictedLabel: rec.predictedLabel || 'Unknown', condition: rec.condition, notes: rec.notes || '', origin: rec.origin || 'Manual' }); };
  const saveEdit = (id) => { persist(records.map((r) => (r.id === id ? { ...r, ...editDraft, condition: editDraft.condition } : r))); setEditingId(null); };
  const deleteRecord = (id) => persist(records.filter((r) => r.id !== id));
  const clearSimulated = () => { if (window.confirm('Delete ALL simulated evaluation records? Live records are kept.')) persist(records.filter((r) => r.source !== 'Simulated')); };
  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flowguard-facial-evaluation.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const filtered = filterRecords(records, filters);
  const stats = computeConfusionMatrix(filtered);
  const liveStats = computeConfusionMatrix(filterRecords(records, { ...filters, source: 'Live' }));
  const simStats = computeConfusionMatrix(filterRecords(records, { ...filters, source: 'Simulated' }));
  const labelOptions = [...IDENTITY_LABELS, NO_FACE];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main eval-main">
        <header className="dashboard-header"><div className="header-titles"><h1>Facial Evaluation Lab</h1><p>FM-only accuracy evaluation with local P01-P05 anonymisation</p></div></header>
        <div className="eval-banner" role="status">SIMULATION MODE — Production users, Face IDs, attendance and security logs are not modified.</div>
        <div className="eval-banner legacy-warning">SIMULATION MODE — Production users, attendance and security logs are not modified.</div>
        <div className="eval-live-links"><span>Production workflows remain on their live pages:</span><Link to="/enrollment" className="eval-link-btn">Open Face Enrollment</Link><Link to="/vpatrol" className="eval-link-btn">Open V-Patrol</Link><Link to="/gate-scanner" className="eval-link-btn">Open Gate Scanner</Link></div>

        <div className="eval-tabs" role="tablist">
          <button role="tab" aria-selected={activeTab === 'live'} className={`eval-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>Live Model Evaluation</button>
          <button role="tab" aria-selected={activeTab === 'sim'} className={`eval-tab ${activeTab === 'sim' ? 'active' : ''}`} onClick={() => setActiveTab('sim')}>Simulated Facial CRUD</button>
          <button role="tab" aria-selected={activeTab === 'records'} className={`eval-tab ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>Evaluation Records</button>
          <button role="tab" aria-selected={activeTab === 'matrix'} className={`eval-tab ${activeTab === 'matrix' ? 'active' : ''}`} onClick={() => setActiveTab('matrix')}>Confusion Matrix</button>
        </div>

        {activeTab === 'live' && <section className="eval-card"><h2>Live Model Evaluation</h2><p className="eval-muted">Temporary frames go to /api/facial-recognition/evaluate only. No Attendance, SecurityLogs, User updates, enrolment changes, images, templates or vectors are stored.</p>
          <div className="eval-card nested"><h3>Private P01-P05 Mapping</h3><p className="eval-muted">Stored only in this FM browser under {EVAL_LABEL_MAP_KEY}. It is never exported and never saved in evaluation records.</p><button className="eval-secondary-btn" onClick={loadEnrolledUsers}>Load enrolled users</button>{mappingError && <p className="eval-error">{mappingError}</p>}
            <div className="eval-form-row"><label>Enrolled user<select value={mappingDraft.userId} onChange={(e) => setMappingDraft({ ...mappingDraft, userId: e.target.value })}><option value="">Choose user</option>{enrolledUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></label><label>Participant label<select value={mappingDraft.label} onChange={(e) => setMappingDraft({ ...mappingDraft, label: e.target.value })}>{ENROLLED_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label><button className="eval-primary-btn" onClick={saveMapping}>Save mapping</button></div>
            <div className="eval-map-list">{Object.entries(labelMap).length === 0 ? <p className="eval-muted">No local mappings yet.</p> : Object.entries(labelMap).map(([userId, label]) => { const user = enrolledUsers.find((u) => String(u.id) === String(userId)); return <div key={userId} className="eval-map-row"><strong>{label}</strong><span>{user ? user.name : `User #${userId}`}</span><button className="eval-danger-btn" onClick={() => persistMap(removeMappedUser(labelMap, userId))}>Remove</button></div>; })}</div>
          </div>
          <div className="eval-live-grid"><div><h3>Temporary source</h3><button className="eval-secondary-btn" onClick={initLiveCamera}>Use Pi primary / webcam fallback</button><span className="eval-muted"> {cameraStatusMsg}</span><div className="eval-camera-box"><video ref={videoRef} autoPlay playsInline muted /><canvas ref={canvasRef} style={{ display: 'none' }} /></div><button className="eval-primary-btn" onClick={() => runLiveEvaluate('camera')}>Run model on camera frame</button></div><div><h3>Temporary upload</h3><input aria-label="Temporary evaluation upload" type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files[0])} />{uploadPreviewUrl && <img src={uploadPreviewUrl} alt="temporary evaluation preview" className="eval-upload-preview" />}<button className="eval-primary-btn" onClick={() => runLiveEvaluate('upload')}>Run model on upload</button></div></div>
          <div className="eval-form-row"><label>Actual label<select value={liveInput.actualLabel} onChange={(e) => setLiveInput({ ...liveInput, actualLabel: e.target.value })}>{IDENTITY_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label><label>Condition<select value={liveInput.condition} onChange={(e) => setLiveInput({ ...liveInput, condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label><label className="eval-notes-field">Notes<input value={liveInput.notes} onChange={(e) => setLiveInput({ ...liveInput, notes: e.target.value })} /></label></div>
          {liveResult && <div className="eval-result"><h3>Model telemetry</h3><p>Predicted: {liveDraft?.detectionOutcome === DETECTION_OUTCOMES.NO_FACE ? 'No Face' : liveDraft?.predictedLabel || 'Assign evaluation label first'}</p><p>Confidence: {liveDraft?.confidence ?? 0}</p><p>Latency: {liveDraft?.latencyMs ?? 0} ms</p><p>Liveness: {liveResult.liveness?.status || 'unavailable'}</p>{liveDraft?.needsMapping && <p className="eval-error">Assign evaluation label first</p>}<button className="eval-primary-btn" disabled={liveDraft?.needsMapping} onClick={saveLiveDraft}>Save Live Evaluation Record</button></div>}
          {liveError && <p className={liveError.includes('recorded') ? 'eval-success' : 'eval-error'}>{liveError}</p>}
        </section>}

        {activeTab === 'sim' && <section className="eval-card"><h2>Simulated Facial CRUD</h2><p className="eval-muted">SIMULATION MODE — Production users, Face IDs, attendance and security logs are not modified. Uses {SIM_USERS_KEY}; no production APIs are called.</p>
          <div className="eval-form-row"><label>Label<select value={simForm.participantLabel} onChange={(e) => setSimForm({ ...simForm, participantLabel: e.target.value })}>{ENROLLED_LABELS.map((l) => <option key={l}>{l}</option>)}</select></label><label>Role<select value={simForm.role} onChange={(e) => setSimForm({ ...simForm, role: e.target.value })}>{['FM', 'Tenant', 'Staff'].map((r) => <option key={r}>{r}</option>)}</select></label><label>Source<select value={simForm.enrolmentSource} onChange={(e) => setSimForm({ ...simForm, enrolmentSource: e.target.value })}>{['Pi', 'Webcam', 'Upload'].map((s) => <option key={s}>{s}</option>)}</select></label><button className="eval-primary-btn" onClick={createSimParticipant}>Create participant</button></div>{simMessage && <p className="eval-success">{simMessage}</p>}
          <div className="eval-table-wrap"><table className="eval-table"><thead><tr><th>Label</th><th>Role</th><th>Status</th><th>Enrolled</th><th>Source</th><th>Actions</th></tr></thead><tbody>{simUsers.map((u) => <tr key={u.id}><td>{u.participantLabel}</td><td>{u.role}</td><td>{u.status}</td><td>{u.enrolled ? 'Yes' : 'No'}</td><td>{u.enrolmentSource}</td><td><button className="eval-secondary-btn" onClick={() => updateSimParticipant(u.id, { status: u.status === 'Active' ? 'Suspended' : 'Active' }, 'Simulated suspend/reactivate')}>{u.status === 'Active' ? 'Suspend' : 'Reactivate'}</button><button className="eval-secondary-btn" onClick={() => updateSimParticipant(u.id, { enrolled: true, enrolmentSource: 'Webcam', enrolledAngles: ['Front', 'Left Angle', 'Right Angle'] }, 'Simulated re-enrolment')}>Re-enrol</button><button className="eval-danger-btn" onClick={() => deleteSimParticipant(u.id)}>Delete</button></td></tr>)}</tbody></table></div>
          <div className="eval-form-row"><label>Read scenario<select value={simScenario} onChange={(e) => setSimScenario(e.target.value)}>{['active', 'suspended', 'unknown', 'noface', 'low-confidence', 'liveness-incomplete', 'pi-offline', 'service-offline'].map((s) => <option key={s}>{s}</option>)}</select></label><button className="eval-primary-btn" onClick={scanSimParticipant}>Read / scan participant</button></div>
          <div className="eval-scenario-grid">{SCENARIOS.map((s) => <button key={s.key} className="eval-scenario-btn" onClick={() => runScenario(s)}><strong>{s.title}</strong><span>{s.description}</span></button>)}</div>
          {lastResult && <div className="eval-result" data-testid="sim-result"><h3>{lastResult.title}</h3><dl className="eval-result-grid"><div><dt>Person</dt><dd>{lastResult.personLabel}</dd></div><div><dt>Role</dt><dd>{lastResult.role}</dd></div><div><dt>Confidence</dt><dd>{Number(lastResult.confidence || 0).toFixed(2)}</dd></div><div><dt>Account State</dt><dd>{lastResult.accountState}</dd></div><div><dt>Decision</dt><dd className={lastResult.access === 'Access Granted' ? 'eval-granted' : 'eval-denied'}>{lastResult.access}</dd></div><div><dt>Latency</dt><dd>{lastResult.latencyMs} ms</dd></div></dl><p className="eval-action">{lastResult.action}</p>{lastResult.recordable && <div className="eval-result-actions"><label>Condition:<select value={simCondition} onChange={(e) => setSimCondition(e.target.value)}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label><button className="eval-primary-btn" onClick={logLastResult}>Log to evaluation records</button></div>}</div>}
        </section>}

        {activeTab === 'records' && <section className="eval-card"><h2>Evaluation Records</h2><form className="eval-live-form" onSubmit={addLiveRecord} aria-label="Record live result"><h3>Manual live result fallback</h3><div className="eval-form-row"><label>Actual<select value={liveForm.actualLabel} onChange={(e) => setLiveForm({ ...liveForm, actualLabel: e.target.value })}>{labelOptions.map((l) => <option key={l}>{l}</option>)}</select></label><label>Predicted<select value={liveForm.predictedLabel} onChange={(e) => setLiveForm({ ...liveForm, predictedLabel: e.target.value })}>{labelOptions.map((l) => <option key={l}>{l}</option>)}</select></label><label>Confidence<input type="number" step="0.01" min="0" max="1" value={liveForm.confidence} onChange={(e) => setLiveForm({ ...liveForm, confidence: e.target.value })} /></label><label>Condition<select value={liveForm.condition} onChange={(e) => setLiveForm({ ...liveForm, condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label><label>Origin<select value={liveForm.origin} onChange={(e) => setLiveForm({ ...liveForm, origin: e.target.value })}>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</select></label><label>Latency (ms)<input type="number" min="0" value={liveForm.latencyMs} onChange={(e) => setLiveForm({ ...liveForm, latencyMs: e.target.value })} /></label><label className="eval-notes-field">Notes<input value={liveForm.notes} onChange={(e) => setLiveForm({ ...liveForm, notes: e.target.value })} /></label><button type="submit" className="eval-primary-btn">Add Live Result</button></div></form>
          <div className="eval-filter-bar"><label>Source<select aria-label="Filter by source" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>{['All', ...SOURCES].map((s) => <option key={s}>{s}</option>)}</select></label><label>Condition<select aria-label="Filter by condition" value={filters.condition} onChange={(e) => setFilters({ ...filters, condition: e.target.value })}>{['All', ...CONDITIONS].map((c) => <option key={c}>{c}</option>)}</select></label><label>Origin<select aria-label="Filter by origin" value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })}>{['All', ...ORIGINS].map((o) => <option key={o}>{o}</option>)}</select></label><label>Date<input type="date" aria-label="Filter by date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></label><button className="eval-secondary-btn" onClick={exportCsv}>Export CSV</button><button className="eval-danger-btn" onClick={clearSimulated}>Clear Simulated Results</button></div>
          <div className="eval-table-wrap"><table className="eval-table"><thead><tr><th>Actual</th><th>Predicted</th><th>Confidence</th><th>Condition</th><th>Latency</th><th>Source</th><th>Origin</th><th>Notes</th><th>Outcome</th><th>Time</th><th>Actions</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={11} className="eval-muted">No evaluation records match the current filters.</td></tr> : filtered.map((r) => <tr key={r.id} data-testid={`eval-row-${r.id}`}>{editingId === r.id ? <><td><select aria-label="Edit actual label" value={editDraft.actualLabel} onChange={(e) => setEditDraft({ ...editDraft, actualLabel: e.target.value })}>{IDENTITY_LABELS.map((l) => <option key={l}>{l}</option>)}</select></td><td><select aria-label="Edit predicted label" value={editDraft.predictedLabel} onChange={(e) => setEditDraft({ ...editDraft, predictedLabel: e.target.value })}>{IDENTITY_LABELS.map((l) => <option key={l}>{l}</option>)}</select></td><td>{r.confidence ?? '-'}</td><td><select aria-label="Edit condition" value={editDraft.condition} onChange={(e) => setEditDraft({ ...editDraft, condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></td><td>{r.latencyMs ?? '-'}</td><td>{r.source}</td><td><select aria-label="Edit origin" value={editDraft.origin} onChange={(e) => setEditDraft({ ...editDraft, origin: e.target.value })}>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</select></td><td><input aria-label="Edit notes" value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} /></td><td>{r.detectionOutcome || '-'}</td><td>{(r.timestamp || '').slice(0, 16).replace('T', ' ')}</td><td><button className="eval-primary-btn" onClick={() => saveEdit(r.id)}>Save</button><button className="eval-secondary-btn" onClick={() => setEditingId(null)}>Cancel</button></td></> : <><td>{r.actualLabel || '-'}</td><td>{r.predictedLabel || '-'}</td><td>{r.confidence == null ? '-' : Number(r.confidence).toFixed(2)}</td><td>{r.condition}</td><td>{r.latencyMs == null ? '-' : `${r.latencyMs} ms`}</td><td><span className={`eval-source-tag ${r.source.toLowerCase()}`}>{r.source}</span></td><td>{r.origin}</td><td className="eval-notes-cell">{r.notes}</td><td>{r.detectionOutcome || '-'}</td><td>{(r.timestamp || '').slice(0, 16).replace('T', ' ')}</td><td><button className="eval-secondary-btn" onClick={() => startEdit(r)}>Edit</button><button className="eval-danger-btn" onClick={() => deleteRecord(r.id)}>Delete</button></td></>}</tr>)}</tbody></table></div></section>}

        {activeTab === 'matrix' && <section className="eval-card"><h2>Confusion Matrix</h2><p className="eval-muted">Simulation validates workflow behaviour. Only Live records may be used as evidence of actual model accuracy.</p><p className="eval-muted">Live Accuracy: {formatPct(liveStats.accuracy)} | Simulated Workflow Results: {formatPct(simStats.accuracy)}</p><div className="eval-filter-bar"><label>Source<select aria-label="Matrix source filter" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>{['All', 'Live', 'Simulated'].map((s) => <option key={s}>{s}</option>)}</select></label><label>Condition<select aria-label="Matrix condition filter" value={filters.condition} onChange={(e) => setFilters({ ...filters, condition: e.target.value })}>{['All', ...CONDITIONS].map((c) => <option key={c}>{c}</option>)}</select></label><label>Origin<select aria-label="Matrix origin filter" value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })}>{['All', ...ORIGINS].map((o) => <option key={o}>{o}</option>)}</select></label></div><div className="eval-stat-row"><div className="eval-stat"><span>Samples</span><strong data-testid="stat-samples">{stats.sampleCount}</strong></div><div className="eval-stat"><span>Accuracy</span><strong data-testid="stat-accuracy">{formatPct(stats.accuracy)}</strong></div><div className="eval-stat"><span>Macro Precision</span><strong data-testid="stat-precision">{formatPct(stats.macroPrecision)}</strong></div><div className="eval-stat"><span>Macro Recall</span><strong data-testid="stat-recall">{formatPct(stats.macroRecall)}</strong></div><div className="eval-stat"><span>Macro F1</span><strong data-testid="stat-f1">{formatPct(stats.macroF1)}</strong></div><div className="eval-stat"><span>FAR</span><strong data-testid="stat-far">{formatPct(stats.far)}</strong></div><div className="eval-stat"><span>FRR</span><strong data-testid="stat-frr">{formatPct(stats.frr)}</strong></div><div className="eval-stat"><span>Avg Latency</span><strong data-testid="stat-latency">{Math.round(stats.avgLatencyMs)} ms</strong></div></div><p className="eval-muted" data-testid="no-face-stat">Detection quality: {stats.noFaceCount} &ldquo;No Face&rdquo; sample(s) ({formatPct(stats.noFaceRate)} of filtered records) - tracked separately, never as an identity class.</p><div className="eval-table-wrap"><table className="eval-table eval-matrix" data-testid="confusion-matrix"><thead><tr><th>Actual \ Predicted</th>{stats.labels.map((l) => <th key={l}>{l}</th>)}</tr></thead><tbody>{stats.labels.map((rowLabel, i) => <tr key={rowLabel}><th>{rowLabel}</th>{stats.labels.map((colLabel, j) => <td key={colLabel} className={i === j ? 'eval-diagonal' : stats.matrix[i][j] > 0 ? 'eval-offdiag' : ''}>{stats.matrix[i][j]}</td>)}</tr>)}</tbody></table></div><p className="eval-muted">FAR = actual Unknown predicted as P01-P05 / all actual Unknown. FRR = actual P01-P05 predicted as Unknown / all enrolled samples.</p></section>}
      </main>
    </div>
  );
};

export default FacialEvaluation;
