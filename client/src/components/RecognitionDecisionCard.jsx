import React from 'react';
import FaceRetouchingOffIcon from '@mui/icons-material/FaceRetouchingOff';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import BlockIcon from '@mui/icons-material/Block';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { Link } from 'react-router-dom';
import SafeMuiIcon from './SafeMuiIcon';
import '../css/RecognitionDecisionCard.css';

export const DECISION_STATES = {
  NO_FACE: 'NO_FACE',
  GRANTED: 'GRANTED',
  SUSPENDED: 'SUSPENDED',
  UNKNOWN: 'UNKNOWN'
};

const PAGE_ACTIONS = {
  gate: {
    NO_FACE: 'No Attendance or suspicious SecurityLog was created.',
    GRANTED: 'Attendance updated and access audit recorded.'
  },
  vpatrol: {
    NO_FACE: 'No suspicious SecurityLog was created. Attendance remains unchanged.',
    GRANTED: 'Access audit recorded. Attendance unchanged.'
  }
};

const formatConfidence = (value) => (value == null ? 'N/A' : `${Math.round(Number(value) * 100)}%`);
const formatLatency = (value) => (value == null ? 'N/A' : `${Math.round(Number(value))} ms`);

// Shared Gate Scanner / V-Patrol decision card. Displays SAFE recognition
// fields only (identity label, account state, confidence, latency) — never
// biometric data — and offers the ground-truth evaluation recorder.
const RecognitionDecisionCard = ({
  decision,
  page = 'gate',
  onRecordEvaluation,
  matrixOrigin
}) => {
  if (!decision) {
    return (
      <div className="decision-card decision-idle" role="status">
        <span className="decision-idle-text">Awaiting scan — no recognition decision yet.</span>
      </div>
    );
  }

  const { state, identityLabel, confidence, latencyMs, cameraSourceLabel, livenessVerified, actionOverride, evaluationMessage, headlineOverride, extraDetails } = decision;
  const actions = PAGE_ACTIONS[page] || PAGE_ACTIONS.gate;

  let icon;
  let headline;
  let tone;
  const details = [];

  if (state === DECISION_STATES.NO_FACE) {
    icon = <SafeMuiIcon icon={FaceRetouchingOffIcon} aria-hidden="true" />;
    headline = 'No face detected';
    tone = 'neutral';
    details.push(['Monitoring status', 'Awaiting a person']);
    details.push(['Access decision', 'None required']);
    details.push(['System action', actionOverride || actions.NO_FACE]);
  } else if (state === DECISION_STATES.GRANTED) {
    icon = <SafeMuiIcon icon={VerifiedUserIcon} aria-hidden="true" />;
    headline = `${identityLabel} — Access Granted`;
    tone = 'granted';
    details.push(['Account', 'Active']);
    details.push(['Liveness', livenessVerified ? 'Verified' : 'Unavailable']);
    details.push(['Confidence', formatConfidence(confidence)]);
    details.push(['Latency', formatLatency(latencyMs)]);
    if (cameraSourceLabel) details.push(['Camera source', cameraSourceLabel]);
    details.push(['System action', actionOverride || actions.GRANTED]);
  } else if (state === DECISION_STATES.SUSPENDED) {
    icon = <SafeMuiIcon icon={BlockIcon} aria-hidden="true" />;
    headline = `${identityLabel} — Access Denied`;
    tone = 'denied';
    details.push(['Account', 'Suspended']);
    details.push(['Confidence', formatConfidence(confidence)]);
    if (cameraSourceLabel) details.push(['Camera source', cameraSourceLabel]);
    details.push(['System action', actionOverride || 'Suspended access attempt recorded.']);
  } else {
    icon = <SafeMuiIcon icon={ReportProblemIcon} aria-hidden="true" />;
    headline = 'Unknown Person — Access Denied';
    tone = 'denied';
    details.push(['Identity', 'No enrolled identity matched']);
    details.push(['Confidence', formatConfidence(confidence)]);
    if (cameraSourceLabel) details.push(['Camera source', cameraSourceLabel]);
    details.push(['System action', actionOverride || 'Deduplicated intrusion alert recorded.']);
  }

  if (Array.isArray(extraDetails)) details.push(...extraDetails);

  return (
    <div className={`decision-card decision-${tone}`} role="status" data-testid="recognition-decision-card">
      <div className="decision-headline">
        {icon}
        <h3>{headlineOverride || headline}</h3>
      </div>
      <dl className="decision-details">
        {details.map(([label, value]) => (
          <div key={label} className="decision-detail">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="decision-actions">
        {onRecordEvaluation && (
          <button type="button" className="decision-record-btn" onClick={onRecordEvaluation}>
            {state === DECISION_STATES.NO_FACE ? 'Record No-Face Test' : 'Record for Evaluation'}
          </button>
        )}
        {evaluationMessage && (
          <>
            <span className="decision-eval-message" role="status">{evaluationMessage}</span>
            {matrixOrigin && (
              <Link
                className="decision-matrix-link"
                to={`/facial-evaluation?tab=matrix&source=Live&origin=${encodeURIComponent(matrixOrigin)}`}
              >
                View Full Live Confusion Matrix
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RecognitionDecisionCard;
