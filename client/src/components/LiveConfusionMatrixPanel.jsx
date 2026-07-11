import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SafeMuiIcon from './SafeMuiIcon';
import '../css/LiveConfusionMatrixPanel.css';
import {
  EVAL_RECORDS_UPDATED_EVENT,
  loadRecords,
  computeConfusionMatrix,
  normalizeOriginKey,
} from '../constants/evaluation';

const formatPct = (v) => `${(v * 100).toFixed(1)}%`;

const EMPTY_STATE_MESSAGE =
  'No confirmed live evaluation records yet. Complete a live scan and record its ground-truth result to generate this matrix.';

// Reusable, origin-scoped LIVE confusion matrix. Reads only the confirmed
// ground-truth evaluation records in localStorage — it never runs recognition
// and never touches Attendance, SecurityLogs or Users.
const LiveConfusionMatrixPanel = ({ origin, title, defaultExpanded = false }) => {
  const [records, setRecords] = useState(() => loadRecords());
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [highlighted, setHighlighted] = useState(false);
  const highlightTimerRef = useRef(null);

  const reload = useCallback(() => setRecords(loadRecords()), []);

  useEffect(() => {
    const onUpdated = (event) => {
      if (event.detail?.origin && normalizeOriginKey(event.detail.origin) !== normalizeOriginKey(origin)) return;
      reload();
      // A new confirmed record: surface the panel so the tester sees the
      // matrix change without a page refresh.
      setExpanded(true);
      setHighlighted(true);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlighted(false), 2500);
    };
    window.addEventListener(EVAL_RECORDS_UPDATED_EVENT, onUpdated);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(EVAL_RECORDS_UPDATED_EVENT, onUpdated);
      window.removeEventListener('storage', reload);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [reload]);

  // Strictly Live records from THIS origin only; small case/spacing
  // differences are normalised, other origins and Simulated records excluded.
  const originRecords = useMemo(() => {
    const originKey = normalizeOriginKey(origin);
    return records.filter((r) => normalizeOriginKey(r.source) === 'live' && normalizeOriginKey(r.origin) === originKey);
  }, [records, origin]);

  const stats = useMemo(() => computeConfusionMatrix(originRecords), [originRecords]);
  const hasData = stats.sampleCount > 0 || stats.noFaceCount > 0;

  const metrics = [
    ['Confirmed Live Samples', stats.sampleCount],
    ['Accuracy', formatPct(stats.accuracy)],
    ['Macro Precision', formatPct(stats.macroPrecision)],
    ['Macro Recall', formatPct(stats.macroRecall)],
    ['Macro F1', formatPct(stats.macroF1)],
    ['FAR', formatPct(stats.far)],
    ['FRR', formatPct(stats.frr)],
    ['Average Latency', `${Math.round(stats.avgLatencyMs)} ms`],
    ['No Face Tests', stats.noFaceCount]
  ];

  const panelId = `live-matrix-${normalizeOriginKey(origin)}`;

  return (
    <section
      className={`live-matrix-panel ${highlighted ? 'live-matrix-highlight' : ''}`}
      aria-label={title}
      data-testid={panelId}
    >
      <button
        type="button"
        className="live-matrix-toggle"
        aria-expanded={expanded}
        aria-controls={`${panelId}-body`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="live-matrix-title">{title}</span>
        <SafeMuiIcon icon={expanded ? ExpandLessIcon : ExpandMoreIcon} aria-hidden="true" />
      </button>

      {expanded && (
        <div className="live-matrix-body" id={`${panelId}-body`}>
          {!hasData ? (
            <p className="live-matrix-empty">{EMPTY_STATE_MESSAGE}</p>
          ) : (
            <>
              <div className="live-matrix-stats">
                {metrics.map(([label, value]) => (
                  <div className="live-matrix-stat" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="live-matrix-note">
                No Face tests are tracked separately from the identity matrix and never affect identity metrics.
                Only confirmed Live records from {origin} are counted here.
              </p>
              {stats.sampleCount > 0 && (
                <div className="live-matrix-table-wrap">
                  <table className="live-matrix-table" data-testid={`${panelId}-table`}>
                    <thead>
                      <tr>
                        <th>Actual \ Predicted</th>
                        {stats.labels.map((label) => <th key={label}>{label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.labels.map((rowLabel, i) => (
                        <tr key={rowLabel}>
                          <th>{rowLabel}</th>
                          {stats.labels.map((colLabel, j) => (
                            <td
                              key={colLabel}
                              className={i === j ? 'live-matrix-diagonal' : stats.matrix[i][j] > 0 ? 'live-matrix-offdiag' : ''}
                            >
                              {stats.matrix[i][j]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <a
            className="live-matrix-full-link"
            href={`/facial-evaluation?tab=matrix&source=Live&origin=${encodeURIComponent(origin)}`}
          >
            View Full Live Confusion Matrix
          </a>
        </div>
      )}
    </section>
  );
};

export default LiveConfusionMatrixPanel;
