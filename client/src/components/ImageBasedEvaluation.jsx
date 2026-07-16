import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';
import useEvaluationParticipants from '../hooks/useEvaluationParticipants';
import {
  ACCESS_DECISIONS,
  ACTUAL_AUTHORIZATION,
  DETECTION_OUTCOMES,
  ENROLLED_LABELS,
  IDENTITY_LABELS,
  UNKNOWN_LABEL,
  computeAccessDecisionMatrix,
  computeConfusionMatrix,
  createAccessEvaluationRecord,
  createRecord,
  labelForUserId,
  loadAccessEvaluationRecords,
  loadLabelMap,
  loadRecords,
  saveAccessEvaluationRecords,
  saveRecords,
  notifyEvaluationRecordsUpdated,
} from '../constants/evaluation';

const ORIGIN = 'Image-Based Evaluation';
const REASONS = ['Unknown Person', 'Suspended Enrolled Participant', 'Not-Enrolled Participant'];
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const emptyUpload = { file: null, previewUrl: '', base64: '' };

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read the selected image.'));
  reader.readAsDataURL(file);
});

const ResultCard = ({ result }) => result ? (
  <div className="image-eval-result" role="status">
    <h4>Identity Result</h4>
    <p>Actual identity: <strong>{result.actualLabel}</strong></p>
    <p>Predicted identity: <strong>{result.predictedLabel}</strong></p>
    <p>Confidence: {result.confidence == null ? 'N/A' : pct(result.confidence)}</p>
    <p>Latency: {result.latencyMs == null ? 'N/A' : `${result.latencyMs} ms`}</p>
    <p className={result.identityCorrect ? 'eval-correct' : 'eval-incorrect'}>{result.identityCorrect ? 'Identity Correct' : 'Identity Incorrect'}</p>
    <h4>Access Decision Result</h4>
    <p>Actual authorisation: <strong>{result.actualAuthorization}</strong></p>
    <p>Expected decision: <strong>{result.expectedDecision}</strong></p>
    <p>Predicted policy decision: <strong>{result.predictedDecision || 'No Decision'}</strong></p>
    <p className={result.accessCorrect ? 'eval-correct' : 'eval-incorrect'}>{result.accessCorrect ? (result.predictedDecision === ACCESS_DECISIONS.DENIED ? 'Access Correctly Denied' : 'Access Decision Correct') : 'Access Decision Incorrect'}</p>
  </div>
) : null;

const ImageBasedEvaluation = () => {
  const token = localStorage.getItem('accessToken');
  const { participants, labels: participantLabels } = useEvaluationParticipants();
  const [authorisedLabel, setAuthorisedLabel] = useState('');
  const [unauthorisedReason, setUnauthorisedReason] = useState(REASONS[0]);
  const [unauthorisedLabel, setUnauthorisedLabel] = useState('');
  const [authorisedUpload, setAuthorisedUpload] = useState(emptyUpload);
  const [unauthorisedUpload, setUnauthorisedUpload] = useState(emptyUpload);
  const authorisedUrlRef = useRef('');
  const unauthorisedUrlRef = useRef('');
  const [authorisedResult, setAuthorisedResult] = useState(null);
  const [unauthorisedResult, setUnauthorisedResult] = useState(null);
  const [error, setError] = useState('');
  const [identityRecords, setIdentityRecords] = useState(() => loadRecords());
  const [accessRecords, setAccessRecords] = useState(() => loadAccessEvaluationRecords());

  const replaceUpload = async (file, setter, urlRef) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    if (!file) { urlRef.current = ''; setter(emptyUpload); return; }
    const previewUrl = URL.createObjectURL(file);
    urlRef.current = previewUrl;
    const base64 = await readFile(file);
    setter({ file, previewUrl, base64 });
  };

  useEffect(() => () => {
    if (authorisedUrlRef.current) URL.revokeObjectURL(authorisedUrlRef.current);
    if (unauthorisedUrlRef.current) URL.revokeObjectURL(unauthorisedUrlRef.current);
  }, []);

  const clearUpload = (setter, urlRef) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setter(emptyUpload);
  };

  const runEvaluation = async ({ kind, actualLabel, upload, setResult }) => {
    setError('');
    if (!actualLabel) { setError('Select the required actual participant before running evaluation.'); return; }
    if (!upload.base64) { setError('Choose a temporary image before running evaluation.'); return; }
    try {
      const response = await axios.post(`${API_BASE_URL}/api/facial-recognition/evaluate`, { image: upload.base64 }, { headers: { Authorization: `Bearer ${token}` } });
      const data = response.data || {};
      const predictedLabel = data.noFace || data.outcome === 'NO_FACE' ? null : data.predictedEvaluationLabel;
      const latencyMs = data.timings?.totalRequestMs ?? null;
      const actualAuthorization = kind === 'authorised' ? ACTUAL_AUTHORIZATION.AUTHORIZED : ACTUAL_AUTHORIZATION.UNAUTHORIZED;
      const expectedDecision = kind === 'authorised' ? ACCESS_DECISIONS.GRANTED : ACCESS_DECISIONS.DENIED;
      const predictedDecision = data.policyDecision === 'GRANTED' ? ACCESS_DECISIONS.GRANTED : data.policyDecision === 'DENIED' ? ACCESS_DECISIONS.DENIED : null;
      const identityRecord = data.outcome === 'NO_FACE'
        ? createRecord({ detectionOutcome: DETECTION_OUTCOMES.NO_FACE, confidence: data.confidence, latencyMs, source: 'Simulated', origin: ORIGIN })
        : createRecord({ actualLabel, predictedLabel, confidence: data.confidence, latencyMs, condition: 'Other', source: 'Simulated', origin: ORIGIN });
      const nextIdentity = [identityRecord, ...loadRecords()];
      saveRecords(nextIdentity);
      setIdentityRecords(nextIdentity);
      notifyEvaluationRecordsUpdated({ origin: ORIGIN });
      const accessRecord = createAccessEvaluationRecord({ actualAuthorization, predictedDecision, reason: kind === 'authorised' ? 'Authorised Person Test' : unauthorisedReason, actualLabel, predictedLabel: predictedLabel || UNKNOWN_LABEL, confidence: data.confidence, latencyMs, origin: ORIGIN });
      const nextAccess = [accessRecord, ...loadAccessEvaluationRecords()];
      saveAccessEvaluationRecords(nextAccess);
      setAccessRecords(nextAccess);
      setResult({ actualLabel, predictedLabel: predictedLabel || 'No Face', confidence: data.confidence, latencyMs, actualAuthorization, expectedDecision, predictedDecision, identityCorrect: predictedLabel === actualLabel, accessCorrect: predictedDecision === expectedDecision, subject: data.subject || null });
      clearUpload(kind === 'authorised' ? setAuthorisedUpload : setUnauthorisedUpload, kind === 'authorised' ? authorisedUrlRef : unauthorisedUrlRef);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Image evaluation failed.');
    }
  };

  const imageOnlyRecords = useMemo(() => identityRecords.filter((r) => r.source === 'Simulated' && r.origin === ORIGIN), [identityRecords]);
  const identityStats = useMemo(() => computeConfusionMatrix(imageOnlyRecords, participantLabels), [imageOnlyRecords, participantLabels]);
  const accessStats = useMemo(() => computeAccessDecisionMatrix(accessRecords.filter((r) => r.origin === ORIGIN)), [accessRecords]);
  const suspendedNeedsLabel = unauthorisedReason === 'Suspended Enrolled Participant';
  const unauthorisedActual = suspendedNeedsLabel ? unauthorisedLabel : UNKNOWN_LABEL;

  return (
    <section className="eval-card image-based-evaluation" aria-label="Image-Based Recognition & Access Evaluation">
      <h2>Image-Based Recognition &amp; Access Evaluation</h2>
      <p className="eval-warning">Uploaded still images evaluate recognition and access-policy handling. They do not prove live anti-spoofing or head-turn liveness.</p>
      {error && <p className="eval-error" role="alert">{error}</p>}
      <div className="image-eval-grid">
        <article className="image-eval-card">
          <h3>Authorised Person Test</h3>
          <label>Actual participant<select aria-label="Authorised actual participant" value={authorisedLabel} onChange={(e) => setAuthorisedLabel(e.target.value)}><option value="">Select ground-truth identity</option>{participants.map((participant) => <option key={participant.evaluationLabel} value={participant.evaluationLabel}>{participant.evaluationLabel} — {participant.name}</option>)}</select></label>
          <p>Actual authorisation: <strong>Actually Authorised</strong></p><p>Expected decision: <strong>Access Granted</strong></p>
          <label>Temporary image upload<input aria-label="Authorised image upload" type="file" accept="image/*" onChange={(e) => replaceUpload(e.target.files?.[0], setAuthorisedUpload, authorisedUrlRef)} /></label>
          {authorisedUpload.previewUrl && <img className="image-eval-preview" src={authorisedUpload.previewUrl} alt="Authorised test preview" />}
          <button className="eval-primary-btn" disabled={!authorisedLabel || !authorisedUpload.base64} onClick={() => runEvaluation({ kind: 'authorised', actualLabel: authorisedLabel, upload: authorisedUpload, setResult: setAuthorisedResult })}>Run Evaluation</button>
          <ResultCard result={authorisedResult} />
        </article>
        <article className="image-eval-card">
          <h3>Unauthorised Person Test</h3>
          <label>Reason<select aria-label="Unauthorised reason" value={unauthorisedReason} onChange={(e) => { setUnauthorisedReason(e.target.value); setUnauthorisedLabel(''); }}>{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          {suspendedNeedsLabel && <label>Actual participant<select aria-label="Unauthorised actual participant" value={unauthorisedLabel} onChange={(e) => setUnauthorisedLabel(e.target.value)}><option value="">Select ground-truth identity</option>{participants.map((participant) => <option key={participant.evaluationLabel} value={participant.evaluationLabel}>{participant.evaluationLabel} — {participant.name}</option>)}</select></label>}
          <p>Actual authorisation: <strong>Actually Unauthorised</strong></p><p>Expected decision: <strong>Access Denied</strong></p>
          <label>Temporary image upload<input aria-label="Unauthorised image upload" type="file" accept="image/*" onChange={(e) => replaceUpload(e.target.files?.[0], setUnauthorisedUpload, unauthorisedUrlRef)} /></label>
          {unauthorisedUpload.previewUrl && <img className="image-eval-preview" src={unauthorisedUpload.previewUrl} alt="Unauthorised test preview" />}
          <button className="eval-primary-btn" disabled={(suspendedNeedsLabel && !unauthorisedLabel) || !unauthorisedUpload.base64} onClick={() => runEvaluation({ kind: 'unauthorised', actualLabel: unauthorisedActual, upload: unauthorisedUpload, setResult: setUnauthorisedResult })}>Run Evaluation</button>
          <ResultCard result={unauthorisedResult} />
        </article>
      </div>
      <h3>Identity Recognition Matrix</h3>
      <div className="eval-table-wrap"><table className="eval-table eval-matrix" data-testid="image-identity-matrix"><thead><tr><th>Actual \ Predicted</th>{identityStats.labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{identityStats.labels.map((row, i) => <tr key={row}><th>{row}</th>{identityStats.labels.map((col, j) => <td key={col}>{identityStats.matrix[i][j]}</td>)}</tr>)}</tbody></table></div>
      <p>No Face: {identityStats.noFaceCount} (tracked outside identity classes)</p>
      <h3>Access Decision Matrix</h3>
      <div className="eval-stat-row">{[['Samples', accessStats.sampleCount], ['Accuracy', pct(accessStats.accuracy)], ['True Grants', accessStats.trueGrants], ['False Denials', accessStats.falseDenials], ['False Grants', accessStats.falseGrants], ['True Denials', accessStats.trueDenials], ['False Grant Rate', pct(accessStats.falseGrantRate)], ['False Denial Rate', pct(accessStats.falseDenialRate)], ['No Decision', accessStats.noDecisionCount]].map(([label, value]) => <div className="eval-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="eval-table-wrap"><table className="eval-table eval-matrix" data-testid="access-decision-matrix"><thead><tr><th>Actual \ Predicted</th><th>Access Granted</th><th>Access Denied</th></tr></thead><tbody><tr><th>Actually Authorised</th><td>{accessStats.matrix[0][0]}</td><td>{accessStats.matrix[0][1]}</td></tr><tr><th>Actually Unauthorised</th><td>{accessStats.matrix[1][0]}</td><td>{accessStats.matrix[1][1]}</td></tr></tbody></table></div>
    </section>
  );
};

export default ImageBasedEvaluation;