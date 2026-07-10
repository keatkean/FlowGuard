import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/FacialEvaluation.css';
import {
  SCENARIOS,
  IDENTITY_LABELS,
  NO_FACE,
  CONDITIONS,
  loadRecords,
  saveRecords,
  createRecord,
  filterRecords,
  computeConfusionMatrix,
  toCsv,
} from '../constants/evaluation';

// FM-only Facial Evaluation Lab.
// SIMULATION-ONLY page: it never calls /api/attendance/scan,
// /api/facial-recognition/access-event, SecurityLog creation, or any user
// suspension/deletion endpoint. Evaluation records live in localStorage under
// a namespaced key and contain only anonymised labels (P01–P05 / Unknown) —
// never real names, images, snapshots, vectors or biometric templates.
const FacialEvaluation = () => {
  const [activeTab, setActiveTab] = useState('sim'); // 'sim' | 'records' | 'matrix'
  const [records, setRecords] = useState(() => loadRecords());
  const [lastResult, setLastResult] = useState(null);
  const [simCondition, setSimCondition] = useState('front');

  // Manual live-result entry (FM types what the real scan showed — labels only).
  const [liveForm, setLiveForm] = useState({
    actualLabel: 'P01', predictedLabel: 'P01', confidence: '', condition: 'front', latencyMs: '', notes: '',
  });

  // Records-tab filters (also drive the confusion matrix).
  const [filters, setFilters] = useState({ source: 'All', condition: 'All', date: '' });

  // Inline row editing (actual/predicted label, condition, notes).
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const persist = (next) => {
    setRecords(next);
    saveRecords(next);
  };

  const runScenario = (scenario) => {
    setLastResult({ title: scenario.title, ...scenario.run() });
  };

  const logLastResult = () => {
    if (!lastResult?.recordable) return;
    const rec = createRecord({
      actualLabel: lastResult.actualLabel,
      predictedLabel: lastResult.predictedLabel,
      confidence: lastResult.confidence,
      condition: simCondition,
      latencyMs: lastResult.latencyMs,
      source: 'Simulated',
      notes: lastResult.title,
    });
    persist([rec, ...records]);
  };

  const addLiveRecord = (e) => {
    e.preventDefault();
    const rec = createRecord({
      actualLabel: liveForm.actualLabel,
      predictedLabel: liveForm.predictedLabel,
      confidence: liveForm.confidence === '' ? null : Number(liveForm.confidence),
      condition: liveForm.condition,
      latencyMs: liveForm.latencyMs === '' ? null : Number(liveForm.latencyMs),
      source: 'Live',
      notes: liveForm.notes,
    });
    persist([rec, ...records]);
    setLiveForm((f) => ({ ...f, confidence: '', latencyMs: '', notes: '' }));
  };

  const startEdit = (rec) => {
    setEditingId(rec.id);
    setEditDraft({
      actualLabel: rec.actualLabel,
      predictedLabel: rec.predictedLabel,
      condition: rec.condition,
      notes: rec.notes || '',
    });
  };

  const saveEdit = (id) => {
    persist(records.map((r) => (r.id === id ? { ...r, ...editDraft } : r)));
    setEditingId(null);
  };

  const deleteRecord = (id) => {
    persist(records.filter((r) => r.id !== id));
  };

  const clearSimulated = () => {
    if (!window.confirm('Delete ALL simulated evaluation records? Live records are kept.')) return;
    persist(records.filter((r) => r.source !== 'Simulated'));
  };

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
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  const labelOptions = [...IDENTITY_LABELS, NO_FACE];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main eval-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Facial Evaluation Lab</h1>
            <p>FM-only accuracy evaluation — anonymised labels only (P01–P05 / Unknown)</p>
          </div>
        </header>

        {/* Always-visible safety banner */}
        <div className="eval-banner" role="status">
          ⚠️ SIMULATION MODE — Production users, attendance and security logs are not modified.
        </div>

        {/* Links to the REAL live pages — the live camera is not duplicated here */}
        <div className="eval-live-links">
          <span>Run a real scan on the live pages, then record its outcome below:</span>
          <Link to="/enrollment" className="eval-link-btn">Open Face Enrollment</Link>
          <Link to="/vpatrol" className="eval-link-btn">Open V-Patrol</Link>
          <Link to="/gate-scanner" className="eval-link-btn">Open Gate Scanner</Link>
        </div>

        <div className="eval-tabs" role="tablist">
          <button role="tab" aria-selected={activeTab === 'sim'} className={`eval-tab ${activeTab === 'sim' ? 'active' : ''}`} onClick={() => setActiveTab('sim')}>
            Simulation Scenarios
          </button>
          <button role="tab" aria-selected={activeTab === 'records'} className={`eval-tab ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>
            Evaluation Records
          </button>
          <button role="tab" aria-selected={activeTab === 'matrix'} className={`eval-tab ${activeTab === 'matrix' ? 'active' : ''}`} onClick={() => setActiveTab('matrix')}>
            Confusion Matrix
          </button>
        </div>

        {/* ------------------------------------------------ A. Simulations */}
        {activeTab === 'sim' && (
          <section className="eval-card">
            <h2>Workflow Simulations</h2>
            <p className="eval-muted">
              Each scenario replays the recognition pipeline's decision logic locally.
              Nothing is sent to the attendance, security-log or user endpoints.
            </p>
            <div className="eval-scenario-grid">
              {SCENARIOS.map((s) => (
                <button key={s.key} className="eval-scenario-btn" onClick={() => runScenario(s)}>
                  <strong>{s.title}</strong>
                  <span>{s.description}</span>
                </button>
              ))}
            </div>

            {lastResult && (
              <div className="eval-result" data-testid="sim-result">
                <h3>{lastResult.title}</h3>
                <dl className="eval-result-grid">
                  <div><dt>Person</dt><dd>{lastResult.personLabel}</dd></div>
                  <div><dt>Role</dt><dd>{lastResult.role}</dd></div>
                  <div><dt>Confidence</dt><dd>{lastResult.confidence.toFixed(2)}</dd></div>
                  <div><dt>Account State</dt><dd>{lastResult.accountState}</dd></div>
                  <div>
                    <dt>Decision</dt>
                    <dd className={lastResult.access === 'Access Granted' ? 'eval-granted' : 'eval-denied'}>
                      {lastResult.access}
                    </dd>
                  </div>
                  <div><dt>Latency</dt><dd>{lastResult.latencyMs} ms</dd></div>
                </dl>
                <p className="eval-action">{lastResult.action}</p>
                {lastResult.recordable && (
                  <div className="eval-result-actions">
                    <label>
                      Condition:
                      <select value={simCondition} onChange={(e) => setSimCondition(e.target.value)}>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <button className="eval-primary-btn" onClick={logLastResult}>
                      Log to evaluation records
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------- B. Evaluation records */}
        {activeTab === 'records' && (
          <section className="eval-card">
            <h2>Evaluation Records</h2>

            {/* Manual entry of a REAL live-scan outcome (labels only, no names) */}
            <form className="eval-live-form" onSubmit={addLiveRecord} aria-label="Record live result">
              <h3>Record a live scan result</h3>
              <div className="eval-form-row">
                <label>Actual
                  <select value={liveForm.actualLabel} onChange={(e) => setLiveForm({ ...liveForm, actualLabel: e.target.value })}>
                    {labelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label>Predicted
                  <select value={liveForm.predictedLabel} onChange={(e) => setLiveForm({ ...liveForm, predictedLabel: e.target.value })}>
                    {labelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label>Confidence
                  <input type="number" step="0.01" min="0" max="1" placeholder="0.00–1.00"
                    value={liveForm.confidence} onChange={(e) => setLiveForm({ ...liveForm, confidence: e.target.value })} />
                </label>
                <label>Condition
                  <select value={liveForm.condition} onChange={(e) => setLiveForm({ ...liveForm, condition: e.target.value })}>
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>Latency (ms)
                  <input type="number" min="0" placeholder="e.g. 420"
                    value={liveForm.latencyMs} onChange={(e) => setLiveForm({ ...liveForm, latencyMs: e.target.value })} />
                </label>
                <label className="eval-notes-field">Notes
                  <input type="text" placeholder="optional"
                    value={liveForm.notes} onChange={(e) => setLiveForm({ ...liveForm, notes: e.target.value })} />
                </label>
                <button type="submit" className="eval-primary-btn">Add Live Result</button>
              </div>
            </form>

            {/* Filters + bulk actions */}
            <div className="eval-filter-bar">
              <label>Source
                <select aria-label="Filter by source" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
                  {['All', 'Live', 'Simulated'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Condition
                <select aria-label="Filter by condition" value={filters.condition} onChange={(e) => setFilters({ ...filters, condition: e.target.value })}>
                  {['All', ...CONDITIONS].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>Date
                <input type="date" aria-label="Filter by date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
              </label>
              <button className="eval-secondary-btn" onClick={exportCsv}>Export CSV</button>
              <button className="eval-danger-btn" onClick={clearSimulated}>Clear Simulated Results</button>
            </div>

            <div className="eval-table-wrap">
              <table className="eval-table">
                <thead>
                  <tr>
                    <th>Actual</th><th>Predicted</th><th>Confidence</th><th>Condition</th>
                    <th>Latency</th><th>Source</th><th>Notes</th><th>Time</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="eval-muted">No evaluation records match the current filters.</td></tr>
                  ) : filtered.map((r) => (
                    <tr key={r.id} data-testid={`eval-row-${r.id}`}>
                      {editingId === r.id ? (
                        <>
                          <td>
                            <select aria-label="Edit actual label" value={editDraft.actualLabel} onChange={(e) => setEditDraft({ ...editDraft, actualLabel: e.target.value })}>
                              {labelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </td>
                          <td>
                            <select aria-label="Edit predicted label" value={editDraft.predictedLabel} onChange={(e) => setEditDraft({ ...editDraft, predictedLabel: e.target.value })}>
                              {labelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </td>
                          <td>{r.confidence ?? '—'}</td>
                          <td>
                            <select aria-label="Edit condition" value={editDraft.condition} onChange={(e) => setEditDraft({ ...editDraft, condition: e.target.value })}>
                              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td>{r.latencyMs ?? '—'}</td>
                          <td>{r.source}</td>
                          <td>
                            <input aria-label="Edit notes" value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} />
                          </td>
                          <td>{(r.timestamp || '').slice(0, 16).replace('T', ' ')}</td>
                          <td>
                            <button className="eval-primary-btn" onClick={() => saveEdit(r.id)}>Save</button>
                            <button className="eval-secondary-btn" onClick={() => setEditingId(null)}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{r.actualLabel}</td>
                          <td>{r.predictedLabel}</td>
                          <td>{r.confidence == null ? '—' : Number(r.confidence).toFixed(2)}</td>
                          <td>{r.condition}</td>
                          <td>{r.latencyMs == null ? '—' : `${r.latencyMs} ms`}</td>
                          <td><span className={`eval-source-tag ${r.source.toLowerCase()}`}>{r.source}</span></td>
                          <td className="eval-notes-cell">{r.notes}</td>
                          <td>{(r.timestamp || '').slice(0, 16).replace('T', ' ')}</td>
                          <td>
                            <button className="eval-secondary-btn" onClick={() => startEdit(r)}>Edit</button>
                            <button className="eval-danger-btn" onClick={() => deleteRecord(r.id)}>Delete</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ------------------------------------------------ C. Confusion matrix */}
        {activeTab === 'matrix' && (
          <section className="eval-card">
            <h2>Confusion Matrix</h2>
            <p className="eval-muted">
              Rows = actual label, columns = predicted label. Filters from the Records tab apply
              (source: {filters.source}, condition: {filters.condition}{filters.date ? `, date: ${filters.date}` : ''}).
            </p>

            <div className="eval-stat-row">
              <div className="eval-stat"><span>Samples</span><strong data-testid="stat-samples">{stats.sampleCount}</strong></div>
              <div className="eval-stat"><span>Accuracy</span><strong data-testid="stat-accuracy">{pct(stats.accuracy)}</strong></div>
              <div className="eval-stat"><span>Macro Precision</span><strong data-testid="stat-precision">{pct(stats.macroPrecision)}</strong></div>
              <div className="eval-stat"><span>Macro Recall</span><strong data-testid="stat-recall">{pct(stats.macroRecall)}</strong></div>
              <div className="eval-stat"><span>Macro F1</span><strong data-testid="stat-f1">{pct(stats.macroF1)}</strong></div>
              <div className="eval-stat"><span>FAR</span><strong data-testid="stat-far">{pct(stats.far)}</strong></div>
              <div className="eval-stat"><span>FRR</span><strong data-testid="stat-frr">{pct(stats.frr)}</strong></div>
              <div className="eval-stat"><span>Avg Latency</span><strong data-testid="stat-latency">{Math.round(stats.avgLatencyMs)} ms</strong></div>
            </div>

            <p className="eval-muted" data-testid="no-face-stat">
              Detection quality: {stats.noFaceCount} “No Face” sample(s) ({pct(stats.noFaceRate)} of filtered records) —
              tracked separately, never as an identity class.
            </p>

            <div className="eval-table-wrap">
              <table className="eval-table eval-matrix" data-testid="confusion-matrix">
                <thead>
                  <tr>
                    <th>Actual \ Predicted</th>
                    {stats.labels.map((l) => <th key={l}>{l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stats.labels.map((rowLabel, i) => (
                    <tr key={rowLabel}>
                      <th>{rowLabel}</th>
                      {stats.labels.map((colLabel, j) => (
                        <td key={colLabel} className={i === j ? 'eval-diagonal' : stats.matrix[i][j] > 0 ? 'eval-offdiag' : ''}>
                          {stats.matrix[i][j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="eval-muted">
              FAR = Unknown samples predicted as an enrolled P01–P05 ÷ all Unknown samples.
              FRR = enrolled samples predicted as Unknown ÷ all enrolled samples. Both are 0 when
              their denominator is 0.
            </p>
          </section>
        )}
      </main>
    </div>
  );
};

export default FacialEvaluation;
