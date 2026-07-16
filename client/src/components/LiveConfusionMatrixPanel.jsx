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

const EVALUATION_BANNER =
  'Live Evaluation Mode compares evaluator-confirmed ground truth against the real AI prediction. Attendance and SecurityLog writes are disabled.';

// "Facial Recognition Evaluation" accordion for Gate Scanner / V-Patrol.
// Rendered only in Live Evaluation Mode, COLLAPSED by default so the
// operational camera stays unobstructed. It reads only the confirmed
// ground-truth evaluation records in localStorage — it never runs recognition
// and never touches Attendance, SecurityLogs or Users. The page passes its
// evaluation controls (participant / condition / auto-record / last result)
// as children, shown only when the evaluator expands the section.
const LiveConfusionMatrixPanel = ({ origin, participantLabels = [], children }) => {
  const [records, setRecords] = useState(() => loadRecords());
  const [expanded, setExpanded] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const highlightTimerRef = useRef(null);

  const reload = useCallback(() => setRecords(loadRecords()), []);

  useEffect(() => {
    const onUpdated = (event) => {
      if (event.detail?.origin && normalizeOriginKey(event.detail.origin) !== normalizeOriginKey(origin)) return;
      // A new confirmed record refreshes the count and metrics in place, but
      // NEVER auto-expands this accordion or the Advanced Matrix Details.
      reload();
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

  const stats = useMemo(() => computeConfusionMatrix(originRecords, participantLabels), [originRecords, participantLabels]);
  const hasData = stats.sampleCount > 0;

  // Scanner-side compact metrics only. No Face tracking stays in the
  // underlying calculation and on the dedicated Facial Evaluation page.
  const metrics = [
    ['Confirmed Samples', stats.sampleCount],
    ['Accuracy', formatPct(stats.accuracy)],
    ['FAR', formatPct(stats.far)],
    ['FRR', formatPct(stats.frr)],
    ['Average Latency', `${Math.round(stats.avgLatencyMs)} ms`]
  ];

  const panelId = `live-matrix-${normalizeOriginKey(origin)}`;

  return (
    <section
      className={`live-matrix-panel ${highlighted ? 'live-matrix-highlight' : ''}`}
      aria-label="Facial Recognition Evaluation"
      data-testid={panelId}
    >
      <button
        type="button"
        className="live-matrix-toggle"
        aria-expanded={expanded}
        aria-controls={`${panelId}-body`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="live-matrix-title">Facial Recognition Evaluation</span>
        <span className="live-matrix-count">Confirmed samples: {stats.sampleCount}</span>
        <SafeMuiIcon icon={expanded ? ExpandLessIcon : ExpandMoreIcon} aria-hidden="true" />
      </button>

      {expanded && (
        <div className="live-matrix-body" id={`${panelId}-body`}>
          <p className="live-matrix-banner">{EVALUATION_BANNER}</p>

          {children}

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
                Only confirmed Live records from {origin} are counted here.
              </p>
              <div className="live-matrix-advanced"><button type="button" aria-expanded={advancedExpanded} onClick={() => setAdvancedExpanded((value) => !value)}>Advanced Matrix Details</button>{advancedExpanded && <><p>Rows represent the actual identity. Columns represent the AI prediction.</p><div className="live-matrix-table-wrap">
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
              </div></>}</div>
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
