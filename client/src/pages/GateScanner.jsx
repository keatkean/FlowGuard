import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/VPatrol.css'; // Reusing the high-tech tracking box and HUD dashboard styles
import {
  PI_CAMERA_STREAM_URL,
  CAMERA_SOURCES,
  CAMERA_STATUS_MESSAGES,
  isPiCameraReachableCached,
  markPiUnavailable,
  fetchPiSnapshotBitmap,
} from '../constants/piCamera';
import { API_BASE_URL } from '../constants/api';
import { clampBoxToFrame, faceBoxStyle } from '../constants/faceBox';
import { describeRecognitionSubject, RECOGNITION_STATUS } from '../constants/recognition';
import {
  SCAN_INTERVAL_MS,
  TARGET_LOCK_MS,
  CAPTURE_MAX_WIDTH,
  CAPTURE_JPEG_QUALITY,
  SERVICE_UNAVAILABLE_MSG,
  createScanGate,
  startTimer,
  logScanTimings,
} from '../constants/scanControl';

// Concise operator-facing label for each kiosk state (right-hand status card).
const GATE_STATE_LABELS = {
  SYSTEM_ACTIVE: 'Awaiting target',
  PRESENCE_DETECTED: 'Target detected — move closer',
  TARGET_LOCKING: 'Analysing biometric vectors',
  LIVENESS_CHECK: 'Liveness check — turn head slightly',
  AUTHORIZING: 'Authorising gate transaction',
  SECURE_MATCH: 'Access granted',
  UNKNOWN_QUERY: 'Access denied',
  HARDWARE_ERR: 'Camera unavailable',
};

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

  // Last gate transaction - safe display fields only (never biometric data):
  // { identityLabel, attendanceResult, gateAction }.
  const [lastDecision, setLastDecision] = useState(null);
  const cameraSourceRef = useRef(CAMERA_SOURCES.PI);
  const piFailStreakRef = useRef(0);
  // Bumped on camera-source switch and unmount; responses from an older
  // session are stale and must be ignored.
  const scanSessionRef = useRef(0);

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
  const CAMERA_LOCATION = "South Entrance Turnstile";

  const changeScanState = (nextState, message) => {
    setScanStatus(nextState);
    scanStatusRef.current = nextState;
    if (message) setDisplayMessage(message);
  };

  useEffect(() => {
    initCameraSource();
    const scanInterval = setInterval(() => performPerimeterScan(), SCAN_INTERVAL_MS);

    return () => {
      scanSessionRef.current += 1; // any in-flight recognition response is now stale
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
    const piReachable = await isPiCameraReachableCached();
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
    scanSessionRef.current += 1; // invalidate responses captured from the old source
    if (source === CAMERA_SOURCES.PI) {
      const piReachable = await isPiCameraReachableCached();
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
          identityLabel: subject.identityLabel,
          attendanceResult: `Access granted — ${actionMessage.toLowerCase()} successful`,
          gateAction: 'Turnstile unlocked'
        });
      }
    } catch (err) {
      // Fail closed: any gate-transaction fault leaves the turnstile locked.
      console.error("Attendance Sync Failed:", err);
      setDisplayMessage("GATE TRANSACTION ROUTING FAULT");
      setLastDecision({
        identityLabel: subject.identityLabel,
        attendanceResult: 'Gate transaction failed — turnstile remains locked',
        gateAction: 'Turnstile remains locked'
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
        // and cache the failure so the Pi isn't re-probed every scan cycle.
        piFailStreakRef.current += 1;
        if (piFailStreakRef.current >= 3) {
          markPiUnavailable();
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
      return canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
    }

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
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
    const scanSession = scanSessionRef.current;

    try {
      const captureTimer = startTimer();
      const imageBase64 = await captureFrameBase64();
      const captureMs = captureTimer();
      if (!imageBase64) return;

      const apiTimer = startTimer();
      const res = await axios.post(RECOGNIZE_URL, {
        image: imageBase64,
        cameraLocation: CAMERA_LOCATION
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Stale response: camera source switched (or unmounted) mid-request.
      if (scanSession !== scanSessionRef.current) return;
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

            if (recognizedUser && recognizedUser.status === RECOGNITION_STATUS.AUTHORIZED) {
              candidateUserRef.current = recognizedUser;
              changeScanState("LIVENESS_CHECK", "VERIFYING LIVENESS: TURN HEAD SLIGHTLY");
            } else if (recognizedUser && recognizedUser.status === RECOGNITION_STATUS.SUSPENDED) {
              // Server already denied access and wrote the security log.
              const subject = describeRecognitionSubject(recognizedUser);
              changeScanState("UNKNOWN_QUERY", `${subject.identityLabel} - ${subject.accessLabel}`);
              setLastDecision({
                identityLabel: subject.identityLabel,
                attendanceResult: 'Access denied — account suspended',
                gateAction: 'Turnstile remains locked'
              });
              setScanProgress(0);
              setTimeout(() => { resetTurnstileKiosk(); }, 3500);
            } else {
              // Unknown person - server already wrote the intrusion log.
              changeScanState("UNKNOWN_QUERY", "PERIMETER BREACH: ACCESS DENIED");
              setLastDecision({
                identityLabel: describeRecognitionSubject(recognizedUser).identityLabel,
                attendanceResult: 'Access denied — unknown person',
                gateAction: 'Turnstile remains locked'
              });
              setScanProgress(0);
              setTimeout(() => { resetTurnstileKiosk(); }, 3500);
            }
          }, TARGET_LOCK_MS);
        } else if (scanStatusRef.current === "TARGET_LOCKING") {
          setFaceBox(targetBox);
        }
      } else {
        // No face in frame — reset the kiosk but keep the last transaction
        // visible on the status card for the operator.
        if (scanStatusRef.current !== "LIVENESS_CHECK" && scanStatusRef.current !== "TARGET_LOCKING") {
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

        <div className="vpatrol-grid gate-grid">
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

          {/* Compact gate status / transaction result card (right of the camera) */}
          <div className="vpatrol-card gate-status-card" role="status" aria-label="Gate status">
            <div className="section-header">
              <h2>Gate Status</h2>
            </div>
            <dl className="gate-status-list">
              <div className="gate-status-row">
                <dt>Current State</dt>
                <dd className={`gate-state-value state-${scanStatus.toLowerCase()}`}>
                  {GATE_STATE_LABELS[scanStatus] || 'Awaiting target'}
                </dd>
              </div>
              {lastDecision?.identityLabel && (
                <div className="gate-status-row">
                  <dt>Last Recognised Person</dt>
                  <dd>{lastDecision.identityLabel}</dd>
                </div>
              )}
              {lastDecision?.attendanceResult && (
                <div className="gate-status-row">
                  <dt>Attendance Result</dt>
                  <dd>{lastDecision.attendanceResult}</dd>
                </div>
              )}
              <div className="gate-status-row">
                <dt>Gate Action</dt>
                <dd>{lastDecision?.gateAction || 'Turnstile locked — standby'}</dd>
              </div>
            </dl>
            <p className="gate-status-message">{displayMessage}</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GateScanner;
