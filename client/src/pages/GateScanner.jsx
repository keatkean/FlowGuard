import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import RecognitionDecisionCard, { DECISION_STATES } from '../components/RecognitionDecisionCard';
import EvaluationRecorderModal from '../components/EvaluationRecorderModal';
import LiveConfusionMatrixPanel from '../components/LiveConfusionMatrixPanel';
import useEvaluationParticipants from '../hooks/useEvaluationParticipants';
import '../css/Dashboard.css';
import '../css/VPatrol.css'; // Reusing the high-tech tracking box and HUD dashboard styles
import {
  PI_CAMERA_STREAM_URL,
  CAMERA_SOURCES,
  CAMERA_STATUS_MESSAGES,
  isPiCameraReachable,
  fetchPiSnapshotBitmap,
} from '../constants/piCamera';
import { API_BASE_URL } from '../constants/api';
import { clampBoxToFrame, faceBoxStyle } from '../constants/faceBox';
import { describeRecognitionSubject, RECOGNITION_STATUS } from '../constants/recognition';
import { loadLabelMap, buildEvaluationDraftFromRecognition, loadRecords, saveRecords, saveEvaluationRecordFromDraft, notifyEvaluationRecordsUpdated, DETECTION_OUTCOMES } from '../constants/evaluation';
import {
  SCAN_INTERVAL_MS,
  TARGET_LOCK_MS,
  CAPTURE_MAX_WIDTH,
  SERVICE_UNAVAILABLE_MSG,
  createScanGate,
  startTimer,
  logScanTimings,
} from '../constants/scanControl';

const MATRIX_ORIGIN = 'Gate Scanner';

const GateScanner = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null); // preview container, for face-box projection

  const [scanStatus, setScanStatus] = useState("SYSTEM_ACTIVE");
  const [displayMessage, setDisplayMessage] = useState("PLACE FACE IN VIEWPORT");
  const [faceBox, setFaceBox] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);

  // Camera source: Raspberry Pi Gate Camera is primary, laptop webcam is fallback
  const [cameraSource, setCameraSource] = useState(CAMERA_SOURCES.PI);
  const [cameraStatusMsg, setCameraStatusMsg] = useState("Connecting to Pi Gate Camera...");

  // Last gate decision - safe display fields only (never biometric data).
  const [lastDecision, setLastDecision] = useState(null);
  const [evalModal, setEvalModal] = useState({ open: false, draft: null });
  const [scanMode, setScanMode] = useState('operational');
  const [evaluationConfig, setEvaluationConfig] = useState({ actualLabel: '', condition: 'Front', autoRecord: true });
  const { participants, labels: participantLabels, loading: participantsLoading, error: participantsError } = useEvaluationParticipants();
  const scanModeRef = useRef('operational');
  const evaluationConfigRef = useRef({ actualLabel: '', condition: 'Front', autoRecord: true });
  const lastRecordedScanRef = useRef(null);
  const updateScanMode = (mode) => { setScanMode(mode); scanModeRef.current = mode; lastRecordedScanRef.current = null; };
  const updateEvaluationConfig = (next) => { setEvaluationConfig(next); evaluationConfigRef.current = next; };
  const cameraSourceRef = useRef(CAMERA_SOURCES.PI);
  const piFailStreakRef = useRef(0);

  const scanStatusRef = useRef("SYSTEM_ACTIVE");
  const lockTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const candidateUserRef = useRef(null);
  // No-overlap + AI-error-backoff guard for the scan loop.
  const scanGateRef = useRef(createScanGate());

  const token = localStorage.getItem("accessToken");
  // All recognition traffic goes through the Node backend - never FastAPI directly.
  const ATTENDANCE_SCAN_URL = `${API_BASE_URL}/api/attendance/scan`;
  const RECOGNIZE_URL = `${API_BASE_URL}/api/facial-recognition/recognize`;
  const EVALUATE_URL = `${API_BASE_URL}/api/facial-recognition/evaluate`;
  const CAMERA_LOCATION = "South Entrance Turnstile";

  const cameraSourceLabel = cameraSource === CAMERA_SOURCES.PI ? 'Raspberry Pi Gate Camera' : 'Laptop Webcam';

  // Recording ground truth only stores one local evaluation record - it never
  // re-runs recognition and never creates Attendance or SecurityLogs.
  const openEvaluationRecorder = (result) => {
    const draft = buildEvaluationDraftFromRecognition({ result, labelMap: loadLabelMap(), origin: MATRIX_ORIGIN });
    setEvalModal({ open: true, draft });
  };

  const handleEvaluationSaved = () => {
    setEvalModal({ open: false, draft: null });
    setLastDecision((prev) => prev ? { ...prev, evaluationMessage: 'Live evaluation result recorded' } : prev);
  };

  const changeScanState = (nextState, message) => {
    setScanStatus(nextState);
    scanStatusRef.current = nextState;
    if (message) setDisplayMessage(message);
  };

  useEffect(() => {
    initCameraSource();
    const scanInterval = setInterval(() => performPerimeterScan(), SCAN_INTERVAL_MS);

    return () => {
      stopGateCamera();
      clearInterval(scanInterval);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const applyCameraSource = (source, statusMsg) => {
    cameraSourceRef.current = source;
    setCameraSource(source);
    setCameraStatusMsg(statusMsg);
    piFailStreakRef.current = 0;
  };

  // Primary source: Raspberry Pi Gate Camera. Probe the snapshot endpoint on
  // load; if unreachable, automatically fall back to the laptop webcam.
  const initCameraSource = async () => {
    const piReachable = await isPiCameraReachable();
    if (piReachable) {
      stopGateCamera();
      applyCameraSource(CAMERA_SOURCES.PI, CAMERA_STATUS_MESSAGES.PI_CONNECTED);
      changeScanState("SYSTEM_ACTIVE", "GATE TURNSTILE ONLINE // AWAITING TARGET");
    } else {
      applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE);
      await startGateCamera();
    }
  };

  // Manual camera source switch (Pi Gate Camera / Laptop Webcam)
  const selectCameraSource = async (source) => {
    if (source === cameraSourceRef.current) return;
    if (source === CAMERA_SOURCES.PI) {
      const piReachable = await isPiCameraReachable();
      if (piReachable) {
        stopGateCamera();
        applyCameraSource(CAMERA_SOURCES.PI, CAMERA_STATUS_MESSAGES.PI_CONNECTED);
      } else {
        applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE);
        await startGateCamera();
      }
    } else {
      applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.WEBCAM_ACTIVE);
      await startGateCamera();
    }
  };

  const startGateCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      changeScanState("HARDWARE_ERR", "NO CAMERA DETECTED ON THIS TERMINAL");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 20 },
          facingMode: "user"
        },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(() => changeScanState("HARDWARE_ERR", "CAMERA STREAM PAUSED"));
        };
      }
      changeScanState("SYSTEM_ACTIVE", "GATE TURNSTILE ONLINE // AWAITING TARGET");
    } catch (err) {
      changeScanState("HARDWARE_ERR", "HARDWARE FAILURE: CAMERA NOT DETECTED");
    }
  };

  const stopGateCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const processAttendanceTransaction = async (verifiedUser) => {
    const subject = describeRecognitionSubject(verifiedUser);
    changeScanState("AUTHORIZING", "AUTHORISING GATE TRANSACTION");
    setScanProgress(100);

    const evaluationResult = verifiedUser._evaluationResult;
    const confidence = verifiedUser.confidence ?? evaluationResult?.user?.confidence ?? null;
    const latencyMs = evaluationResult?.timings?.totalRequestMs ?? evaluationResult?.timings?.nodeToAiMs ?? null;

    try {
      // Hit the Node.js automatic clock-in/out controller with the
      // server-verified unique user ID - never a name.
      const res = await axios.post(ATTENDANCE_SCAN_URL, {
        userId: verifiedUser.id,
        cameraLocation: CAMERA_LOCATION
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status >= 200 && res.status < 300 && res.data && res.data.action) {
        changeScanState("SECURE_MATCH", `IDENTITY VERIFIED: ${subject.identityLabel}`);
        // Render the exact system response action directly onto the kiosk screen
        const actionMessage = res.data.action.replace(/_/g, " ");
        setDisplayMessage(`${subject.identityLabel} - ${actionMessage}`);
        setLastDecision({
          state: DECISION_STATES.GRANTED,
          identityLabel: subject.identityLabel,
          confidence,
          latencyMs,
          livenessVerified: true,
          cameraSourceLabel,
          evaluationResult
        });
      }
    } catch (err) {
      console.error("Attendance Sync Failed:", err);
      setDisplayMessage("GATE TRANSACTION ROUTING FAULT");
      setLastDecision({
        state: DECISION_STATES.UNKNOWN,
        identityLabel: subject.identityLabel,
        confidence,
        latencyMs,
        livenessVerified: true,
        cameraSourceLabel,
        actionOverride: 'Gate authorisation failed - access remains locked.',
        evaluationResult
      });
    }

    setTimeout(() => { resetTurnstileKiosk(); }, 4000);
  };

  // Capture one frame from the active camera source onto the hidden canvas
  // and return it as a compressed JPEG data URL for the recognition API.
  const captureFrameBase64 = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    const maxWidth = CAPTURE_MAX_WIDTH;

    if (cameraSourceRef.current === CAMERA_SOURCES.PI) {
      let bitmap;
      try {
        bitmap = await fetchPiSnapshotBitmap();
        piFailStreakRef.current = 0;
      } catch {
        // Pi snapshot failed mid-session - after 3 misses, fall back to webcam
        piFailStreakRef.current += 1;
        if (piFailStreakRef.current >= 3) {
          applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE);
          await startGateCamera();
        }
        return null;
      }
      const scale = Math.min(1, maxWidth / bitmap.width);
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg', 0.3);
    }

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.3);
  };

  const performPerimeterScan = async () => {
    const gate = scanGateRef.current;
    // No overlapping requests; short backoff after a recognition-service failure.
    if (!gate.canScan()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    if (scanStatusRef.current === "SECURE_MATCH" || scanStatusRef.current === "UNKNOWN_QUERY") return;

    gate.begin();
    const totalTimer = startTimer();

    try {
      const captureTimer = startTimer();
      const imageBase64 = await captureFrameBase64();
      const captureMs = captureTimer();
      if (!imageBase64) return;

      if (scanModeRef.current === 'evaluation') {
        const cycleId = lastRecordedScanRef.current || `EVAL-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const res = await axios.post(EVALUATE_URL, { image: imageBase64 }, { headers: { Authorization: `Bearer ${token}` } });
        const draft = buildEvaluationDraftFromRecognition({ result: res.data, labelMap: loadLabelMap(), source: 'Live', origin: 'Gate Scanner' });
        if (draft.detectionOutcome === DETECTION_OUTCOMES.NO_FACE) {
          setLastDecision({ state: DECISION_STATES.NO_FACE, cameraSourceLabel, evaluationResult: res.data });
          return;
        }
        const config = evaluationConfigRef.current;
        if (config.autoRecord && config.actualLabel && !lastRecordedScanRef.current && !draft.needsMapping) {
          lastRecordedScanRef.current = cycleId;
          const record = saveEvaluationRecordFromDraft(draft, { actualLabel: config.actualLabel, condition: config.condition });
          saveRecords([record, ...loadRecords()]);
          notifyEvaluationRecordsUpdated({ origin: 'Gate Scanner' });
          setLastDecision({ state: res.data.policyDecision === 'GRANTED' ? DECISION_STATES.GRANTED : DECISION_STATES.UNKNOWN, identityLabel: draft.predictedLabel, confidence: draft.confidence, latencyMs: draft.latencyMs, cameraSourceLabel, evaluationResult: res.data, evaluationMessage: 'Live evaluation sample recorded' });
          setTimeout(() => { lastRecordedScanRef.current = null; }, 3500);
        }
        return;
      }

      const apiTimer = startTimer();
      const res = await axios.post(RECOGNIZE_URL, {
        image: imageBase64,
        cameraLocation: CAMERA_LOCATION
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      logScanTimings({
        captureMs,
        apiMs: apiTimer(),
        totalMs: totalTimer(),
        serverTimings: res.data?.timings
      });

      if (scanStatusRef.current === "SECURE_MATCH" || scanStatusRef.current === "UNKNOWN_QUERY") return;

      if (res.data && Array.isArray(res.data.box) && res.data.box.length === 4) {
        // FastAPI contract: box is exactly [x, y, width, height] in pixels of
        // the captured frame. Direct mapping (no corner-order guessing),
        // clamped to the frame, projected onto the contain-fit preview.
        const frame = { width: canvas.width, height: canvas.height };
        const containerEl = containerRef.current;
        const container = containerEl
          ? { width: containerEl.clientWidth, height: containerEl.clientHeight }
          : frame;
        const { width: boxWidth } = clampBoxToFrame(res.data.box, frame.width, frame.height);
        const targetBox = faceBoxStyle(res.data.box, frame, container, 'contain');

        const faceProximityPercentage = (boxWidth / canvas.width) * 100;
        const livenessRatio = res.data.liveness_ratio || 0.5;

        if (faceProximityPercentage < 8 && scanStatusRef.current !== "LIVENESS_CHECK") {
          changeScanState("PRESENCE_DETECTED", "TARGET DETECTED // MOVE CLOSER");
          setFaceBox(null);
          return;
        }

        // LIVENESS CHECK: Wait for head swing rotation
        if (scanStatusRef.current === "LIVENESS_CHECK") {
          setFaceBox(targetBox);
          const currentRecognitionUser = res.data.user;
          if (!candidateUserRef.current || !currentRecognitionUser || candidateUserRef.current.id !== currentRecognitionUser.id) {
            resetTurnstileKiosk();
            return;
          }
          if (livenessRatio < 0.35 || livenessRatio > 0.65) {
            await processAttendanceTransaction(candidateUserRef.current);
          }
          return;
        }

        // TARGET LOCKING SEQUENCE
        if (scanStatusRef.current === "SYSTEM_ACTIVE" || scanStatusRef.current === "PRESENCE_DETECTED") {
          changeScanState("TARGET_LOCKING", "LOCKING BIOMETRIC VECTORS...");
          setFaceBox(targetBox);
          setScanProgress(12);

          let progress = 12;
          progressIntervalRef.current = setInterval(() => {
            progress += Math.floor(Math.random() * 14) + 4;
            if (progress >= 96) { setScanProgress(96); clearInterval(progressIntervalRef.current); }
            else { setScanProgress(progress); }
          }, 120);

          lockTimerRef.current = setTimeout(() => {
            clearInterval(progressIntervalRef.current);

            const recognizedUser = res.data.user;
            const confidence = recognizedUser?.confidence ?? null;
            const latencyMs = res.data?.timings?.totalRequestMs ?? res.data?.timings?.nodeToAiMs ?? null;

            if (recognizedUser && recognizedUser.status === RECOGNITION_STATUS.AUTHORIZED) {
              candidateUserRef.current = { ...recognizedUser, _evaluationResult: res.data };
              changeScanState("LIVENESS_CHECK", "VERIFYING LIVENESS: TURN HEAD SLIGHTLY");
            } else if (recognizedUser && recognizedUser.status === RECOGNITION_STATUS.SUSPENDED) {
              // Server already denied access and wrote the security log.
              const subject = describeRecognitionSubject(recognizedUser);
              changeScanState("UNKNOWN_QUERY", `${subject.identityLabel} - ${subject.accessLabel}`);
              setLastDecision({
                state: DECISION_STATES.SUSPENDED,
                identityLabel: subject.identityLabel,
                confidence,
                latencyMs,
                cameraSourceLabel,
                evaluationResult: res.data
              });
              setScanProgress(0);
              setTimeout(() => { resetTurnstileKiosk(); }, 3500);
            } else {
              // Unknown person - server already wrote the intrusion log.
              changeScanState("UNKNOWN_QUERY", "PERIMETER BREACH: ACCESS DENIED");
              setLastDecision({
                state: DECISION_STATES.UNKNOWN,
                identityLabel: describeRecognitionSubject(recognizedUser).identityLabel,
                confidence,
                latencyMs,
                cameraSourceLabel,
                evaluationResult: res.data
              });
              setScanProgress(0);
              setTimeout(() => { resetTurnstileKiosk(); }, 3500);
            }
          }, TARGET_LOCK_MS);
        } else if (scanStatusRef.current === "TARGET_LOCKING") {
          setFaceBox(targetBox);
        }
      } else {
        if (scanStatusRef.current !== "LIVENESS_CHECK" && scanStatusRef.current !== "TARGET_LOCKING") {
          setLastDecision({
            state: DECISION_STATES.NO_FACE,
            cameraSourceLabel,
            evaluationResult: res.data
          });
          resetTurnstileKiosk();
        }
      }
    } catch (err) {
      // Node/FastAPI unavailable - back off instead of flooding the endpoint.
      // The camera preview keeps running; webcam fallback is ONLY for Pi failure.
      console.error("Gate AI Link Fault:", err);
      gate.applyBackoff();
      setDisplayMessage(SERVICE_UNAVAILABLE_MSG);
    } finally {
      gate.end();
    }
  };

  const resetTurnstileKiosk = () => {
    setFaceBox(null);
    setScanProgress(0);
    candidateUserRef.current = null;
    changeScanState("SYSTEM_ACTIVE", "GATE TURNSTILE ONLINE // AWAITING TARGET");
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main gate-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Perimeter Gate Attendance Terminal</h1>
            <p>Main Facility Entrance Turnstile Facial Recognition Interface</p>
          </div>
        </header>

        <div className="camera-source-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>Camera Source:</span>
          <button
            onClick={() => selectCameraSource(CAMERA_SOURCES.PI)}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
              border: cameraSource === CAMERA_SOURCES.PI ? '1px solid #3b82f6' : '1px solid #334155',
              background: cameraSource === CAMERA_SOURCES.PI ? '#1d4ed8' : '#1e293b', color: '#e2e8f0'
            }}
          >
            Raspberry Pi Gate Camera
          </button>
          <button
            onClick={() => selectCameraSource(CAMERA_SOURCES.WEBCAM)}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
              border: cameraSource === CAMERA_SOURCES.WEBCAM ? '1px solid #3b82f6' : '1px solid #334155',
              background: cameraSource === CAMERA_SOURCES.WEBCAM ? '#1d4ed8' : '#1e293b', color: '#e2e8f0'
            }}
          >
            Laptop Webcam
          </button>
          <span style={{ color: '#38bdf8', fontSize: '0.82rem' }}>{cameraStatusMsg}</span>
        </div>

        <section className="evaluation-mode-controls" aria-label="Scanner mode">
          <div className="scan-mode-selector">
            <button type="button" aria-pressed={scanMode === 'operational'} className={scanMode === 'operational' ? 'active' : ''} onClick={() => updateScanMode('operational')}>Operational Mode</button>
            <button type="button" aria-pressed={scanMode === 'evaluation'} className={scanMode === 'evaluation' ? 'active' : ''} onClick={() => updateScanMode('evaluation')}>Live Evaluation Mode</button>
          </div>
          {scanMode === 'evaluation' && <div className="evaluation-config"><h3>Evaluation Mode</h3><p className="evaluation-mode-banner">Live Evaluation Mode uses real AI recognition and compares it with evaluator-confirmed ground truth. Attendance and SecurityLog writes are disabled.</p><label>Actual participant:<select value={evaluationConfig.actualLabel} onChange={(e) => updateEvaluationConfig({ ...evaluationConfig, actualLabel: e.target.value })}><option value="">Select ground-truth identity</option>{participants.map((participant) => <option key={participant.evaluationLabel} value={participant.evaluationLabel}>{participant.evaluationLabel} — {participant.name}</option>)}<option value="Unknown">Unknown Person</option></select>{participantsLoading && <span>Loading participants...</span>}{participantsError && <span role="alert">{participantsError}</span>}{!participantsLoading && !participantsError && participants.length === 0 && <span>No enrolled evaluation participants available.</span>}</label><label>Condition:<select value={evaluationConfig.condition} onChange={(e) => updateEvaluationConfig({ ...evaluationConfig, condition: e.target.value })}>{['Front','Left Angle','Right Angle','Normal Lighting','Low Lighting','Glasses','Other'].map((condition) => <option key={condition}>{condition}</option>)}</select></label><label><input type="checkbox" checked={evaluationConfig.autoRecord} onChange={(e) => updateEvaluationConfig({ ...evaluationConfig, autoRecord: e.target.checked })} /> Auto-record completed scans</label></div>}
        </section>
        {/* Last gate decision - safe recognition fields only */}
        <RecognitionDecisionCard
          decision={lastDecision}
          page="gate"
          matrixOrigin={MATRIX_ORIGIN}
          onRecordEvaluation={lastDecision?.evaluationResult ? () => openEvaluationRecorder(lastDecision.evaluationResult) : undefined}
        />

        <EvaluationRecorderModal
          open={evalModal.open}
          draft={evalModal.draft}
          onSaved={handleEvaluationSaved}
          onClose={() => setEvalModal({ open: false, draft: null })}
        />

        <div className="vpatrol-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="vpatrol-card monitor-section">
            <div ref={containerRef} className={`cctv-container state-theme-${scanStatus.toLowerCase()}`} style={{ width: '100%', height: '100%' }}>
              {cameraSource === CAMERA_SOURCES.PI && (
                <img
                  src={PI_CAMERA_STREAM_URL}
                  alt="Raspberry Pi gate camera live preview"
                  className="video-feed"
                />
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="video-feed"
                style={cameraSource === CAMERA_SOURCES.PI ? { display: 'none' } : undefined}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {faceBox && (
                <div className={`face-tracking-box state-${scanStatus.toLowerCase()}`} style={{ top: faceBox.top, left: faceBox.left, width: faceBox.width, height: faceBox.height }}>
                  <div className="corner-bracket top-left"></div>
                  <div className="corner-bracket top-right"></div>
                  <div className="corner-bracket bottom-left"></div>
                  <div className="corner-bracket bottom-right"></div>
                  {scanStatus === "TARGET_LOCKING" && <div className="matrix-scan-line"></div>}

                  <div className="box-identity-panel">
                    <span className="access-status-label">
                      {scanStatus === "TARGET_LOCKING" && `ANALYZING: ${scanProgress}%`}
                      {scanStatus === "LIVENESS_CHECK" && "ANTI-SPOOF ACTIVE"}
                      {scanStatus === "SECURE_MATCH" && "ACCESS GRANTED"}
                      {scanStatus === "UNKNOWN_QUERY" && "PERIMETER ALERT"}
                    </span>
                    <span className="person-name-label">{displayMessage}</span>
                  </div>
                </div>
              )}

              <div className="hud-overlay">
                <div className="hud-top">
                  <div className="hud-left-meta">
                    <span className="hud-node">PORTAL_NODE // SOUTH_ENTRANCE_TURNSTILE</span>
                  </div>
                  <span className={`hud-status-badge status-${scanStatus.toLowerCase()}`}>
                    {scanStatus === "SYSTEM_ACTIVE" && "SYSTEM ARMED"}
                    {scanStatus === "LIVENESS_CHECK" && "PROCESSING 3D PROFILE"}
                    {scanStatus === "SECURE_MATCH" && "TURNSTILE UNLOCKED"}
                    {scanStatus === "UNKNOWN_QUERY" && "THREAT REJECTED"}
                  </span>
                </div>
                <div className="hud-bottom">
                  <p className="hud-engine-log" style={{ color: '#3b82f6' }}>TERMINAL STATE: {displayMessage}</p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Below the operational scanning area so it never obstructs the kiosk */}
        {scanMode === 'evaluation' && <LiveConfusionMatrixPanel
          origin={MATRIX_ORIGIN}
          defaultExpanded
          title="Gate Scanner — Live Recognition Performance"
          participantLabels={participantLabels}
        />}
      </main>
    </div>
  );
};

export default GateScanner;
