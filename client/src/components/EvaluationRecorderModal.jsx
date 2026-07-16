import React, { useEffect, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import SafeMuiIcon from './SafeMuiIcon';
import useEvaluationParticipants from '../hooks/useEvaluationParticipants';
import '../css/EvaluationRecorderModal.css';
import {
  CONDITIONS,
  IDENTITY_LABELS,
  DETECTION_OUTCOMES,
  loadRecords,
  saveRecords,
  saveEvaluationRecordFromDraft,
  notifyEvaluationRecordsUpdated,
} from '../constants/evaluation';

// Shared ground-truth recorder for live recognition decisions. Saving only
// writes one local evaluation record — it never re-runs recognition and never
// creates Attendance, access events, SecurityLogs or User changes.
const EvaluationRecorderModal = ({ open, draft, onSaved, onClose }) => {
  const [actualLabel, setActualLabel] = useState('');
  const [condition, setCondition] = useState('Front');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const { participants, loading: participantsLoading } = useEvaluationParticipants();

  useEffect(() => {
    if (open) {
      setActualLabel('');
      setCondition('Front');
      setNotes('');
      setError(draft?.needsMapping ? 'Assign evaluation label first' : '');
    }
  }, [open, draft]);

  if (!open || !draft) return null;

  const isNoFace = draft.detectionOutcome === DETECTION_OUTCOMES.NO_FACE;

  const handleSave = () => {
    try {
      const record = saveEvaluationRecordFromDraft(draft, { actualLabel, condition, notes });
      saveRecords([record, ...loadRecords()]);
      notifyEvaluationRecordsUpdated({ origin: record.origin });
      onSaved?.(record);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="eval-recorder-overlay" role="dialog" aria-modal="true" aria-label={`Record live ${draft.origin} evaluation`}>
      <div className="eval-recorder-modal">
        <div className="eval-recorder-header">
          <h3>Record Live {draft.origin} Evaluation</h3>
          <button type="button" className="eval-recorder-close" onClick={onClose} aria-label="Close evaluation recorder">
            <SafeMuiIcon icon={CloseIcon} fontSize="small" />
          </button>
        </div>

        <dl className="eval-recorder-telemetry">
          <div><dt>Predicted label</dt><dd>{isNoFace ? 'No Face' : (draft.predictedLabel || 'Unknown')}</dd></div>
          <div><dt>Confidence</dt><dd>{draft.confidence == null ? 'N/A' : `${Math.round(draft.confidence * 100)}%`}</dd></div>
          <div><dt>Latency</dt><dd>{draft.latencyMs == null ? 'N/A' : `${draft.latencyMs} ms`}</dd></div>
          <div><dt>Origin</dt><dd>{draft.origin} (Live)</dd></div>
        </dl>

        {isNoFace && (
          <p className="eval-recorder-hint">
            No-face detection outcome is recorded separately — it never joins the identity matrix
            and no actual identity is required.
          </p>
        )}

        {error && <p className="eval-recorder-error" role="alert">{error}</p>}
        {draft.needsMapping && (
          <p className="eval-recorder-hint">
            Map this user to a P01-P05 label in Facial Evaluation before recording.
          </p>
        )}

        <div className="eval-recorder-fields">
          {!isNoFace && (
            <label>
              Actual label
              <select value={actualLabel} onChange={(e) => setActualLabel(e.target.value)}>
                <option value="">Select ground-truth identity</option>
                {participants.map((participant) => <option key={participant.evaluationLabel} value={participant.evaluationLabel}>{participant.evaluationLabel} — {participant.name}</option>)}<option value="Unknown">Unknown Person</option>
              </select>
            </label>
          )}
          <label>
            Test condition
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="eval-recorder-notes">
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional evaluation notes" />
          </label>
        </div>

        <div className="eval-recorder-actions">
          <button type="button" className="eval-recorder-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="eval-recorder-save" onClick={handleSave} disabled={Boolean(draft.needsMapping) || (!isNoFace && (participantsLoading || !actualLabel))}>
            Save Evaluation
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationRecorderModal;
