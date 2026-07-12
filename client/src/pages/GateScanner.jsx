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
import { clampBoxToFrame, faceBoxStyle, smoothBox } from '../constants/faceBox';
import { describeRecognitionSubject, RECOGNITION_STATUS } from '../constants/recognition';
import {
  SCAN_INTERVAL_MS,
  TARGET_LOCK_MS,
  CAPTURE_MAX_WIDTH,
  CAPTURE_JPEG_QUALITY,
  TRACK_INTERVAL_MS,
  TRACK_MAX_WIDTH,
  TRACK_JPEG_QUALITY,
  BOX_CLEAR_TIMEOUT_MS,
  SERVICE_UNAVAILABLE_MSG,
  createScanGate,
  startTimer,
  logScanTimings,
  logTrackingTimings,
  logLivenessTelemetry,
  nowMs,
} from '../constants/scanControl';
import {
  createHeadTurnChallenge,
  CHALLENGE_STATE,
  LIVENESS_BASELINE_SAMPLES,
} from '../constants/liveness';

// Pi snapshot failures must persist this long before the page falls back to
// the laptop webcam (time-based so the fast tracking loop cannot trip it on a
// single hiccup).
const PI_FAIL_FALLBACK_MS = 2500;

// Concise operator-facing label for each kiosk state (right-hand status card).
const GATE_STATE_LABELS = {
  SYSTEM_ACTIVE: 'Awaiting target',
  PRESENCE_DETECTED: 'Target detected — move closer',
  TARGET_LOCKING: 'Analysing biometric vectors',
  LIVENESS_CHECK: 'Head-turn check — turn head slightly and hold',
  AUTHORIZING: 'Authorising gate transaction',
  SECURE_MATCH: 'Access granted',
  UNKNOWN_QUERY: 'Access denied',
  HARDWARE_ERR: 'Camera unavailable',
};

const GateScanner = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);       // full-recognition capture canvas
  const trackCanvasRef = useRef(null);  // small tracking capture canvas (independent of recognition)
  const containerRef = useRef(null);    // preview container, for face-box projection

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
  const piFailSinceRef = useRef(0);
  // Bumped on camera-source switch and unmount; responses from an older
  // session are stale and must be ignored.
  const scanSessionRef = useRef(0);

  const scanStatusRef = useRef("SYSTEM_ACTIVE");
  const lockTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const lockPendingRef = useRef(false);
  const candidateUserRef = useRef(null);

  // Two INDEPENDENT in-flight locks: tracking (box/liveness) and full
  // recognition (identity) never share a guard.
  const trackingInFlightRef = useRef(false);
  const recognitionInFlightRef = useRef(createScanGate());

  // Live tracking state: smoothed frame-space box, last-seen time, and the
  // recent valid head-turn ratios that seed the liveness baseline.
  const smoothedBoxRef = useRef(null);
  const lastFaceSeenAtRef = useRef(0);
  const recentRatiosRef = useRef([]);
  const challengeRef = useRef(null);
  const finalizingRef = useRef(false);

  const token = localStorage.getItem("accessToken");
  // All recognition traffic goes through the Node backend - never FastAPI directly.
  const ATTENDANCE_SCAN_URL = `${API_BASE_URL}/api/attendance/scan`;
  const RECOGNIZE_URL = `${API_BASE_URL}/api/facial-recognition/recognize`;
  const TRACK_URL = `${API_BASE_URL}/api/facial-recognition/track`;
  const CAMERA_LOCATION = "South Entrance Turnstile";

  const changeScanState = (nextState, message) => {
    setScanStatus(nextState);
    scanStatusRef.current = nextState;
    if (message) setDisplayMessage(message);
  };

  useEffect(() => {
    initCameraSource();
    const trackInterval = setInterval(() => performTrackingScan(), TRACK_INTERVAL_MS);
    const scanInterval = setInterval(() => performRecognitionScan(), SCAN_INTERVAL_MS);

    return () => {
      scanSessionRef.current += 1; // any in-flight tracking/recognition response is now stale
      stopGateCamera();
      clearInterval(trackInterval);
      clearInterval(scanInterval);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const applyCameraSource = (source, statusMsg) => {
    cameraSourceRef.current = source;
    setCameraSource(source);
    setCameraStatusMsg(statusMsg);
    piFailSinceRef.current = 0;
  };

  // Wipe every per-source tracking artefact so a stale box from the old
  // camera source can never render over the new one.
  const clearTrackingState = () => {
    smoothedBoxRef.current = null;
    lastFaceSeenAtRef.current = 0;
    recentRatiosRef.current = [];
    setFaceBox(null);
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
    resetTurnstileKiosk();
    clearTrackingState();
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

  // Capture one frame from the active camera source onto the given hidden
  // canvas and return it as a compressed JPEG data URL. The tracking loop uses
  // a small/cheap frame; the recognition loop keeps its existing sizing.
  const captureFrom = async (canvas, maxWidth, quality) => {
    if (!canvas) return null;
    const context = canvas.getContext('2d');

    if (cameraSourceRef.current === CAMERA_SOURCES.PI) {
      let bitmap;
      try {
        bitmap = await fetchPiSnapshotBitmap();
        piFailSinceRef.current = 0;
      } catch {
        // Pi snapshot failed mid-session - once failures persist past the
        // fallback window, switch to the webcam and cache the failure so the
        // Pi isn't re-probed on every cycle.
        const now = Date.now();
        if (!piFailSinceRef.current) {
          piFailSinceRef.current = now;
        } else if (now - piFailSinceRef.current >= PI_FAIL_FALLBACK_MS) {
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
      return canvas.toDataURL('image/jpeg', quality);
    }

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  const captureFrameBase64 = () => captureFrom(canvasRef.current, CAPTURE_MAX_WIDTH, CAPTURE_JPEG_QUALITY);

  // ------------------------------------------------------------------
  // A. TRACKING LOOP — detection-only /track endpoint (no identity data).
  // Moves the on-screen box, detects presence and samples head-turn movement
  // at ~TRACK_INTERVAL_MS. It can never grant access by itself.
  // ------------------------------------------------------------------
  const performTrackingScan = async () => {
    if (trackingInFlightRef.current) return;
    const canvas = trackCanvasRef.current;
    if (!canvas) return;
    const status = scanStatusRef.current;
    if (status === "SECURE_MATCH" || status === "UNKNOWN_QUERY" || status === "AUTHORIZING" || status === "HARDWARE_ERR") return;

    trackingInFlightRef.current = true;
    const scanSession = scanSessionRef.current;
    try {
      const captureTimer = startTimer();
      const imageBase64 = await captureFrom(canvas, TRACK_MAX_WIDTH, TRACK_JPEG_QUALITY);
      const captureMs = captureTimer();
      if (!imageBase64) return;

      const requestTimer = startTimer();
      const res = await axios.post(TRACK_URL, { image: imageBase64 }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Stale response: camera source switched (or unmounted) mid-request.
      if (scanSession !== scanSessionRef.current) return;
      logTrackingTimings({ captureMs, requestMs: requestTimer(), inferenceMs: res.data?.inferenceMs });
      handleTrackingResult(res.data, canvas);
    } catch {
      // Tracking is best-effort; the recognition loop owns service-fault
      // messaging and backoff.
    } finally {
      trackingInFlightRef.current = false;
    }
  };

  const handleTrackingResult = (data, canvas) => {
    const { faceDetected, faceCount = 0, box, headTurnRatio } = data || {};
    const now = nowMs();

    if (faceDetected && Array.isArray(box) && box.length === 4) {
      lastFaceSeenAtRef.current = now;
      const frame = { width: canvas.width, height: canvas.height };
      // Smooth in frame space, then project onto the current container size so
      // preview/container resizes are handled on every tracking update.
      smoothedBoxRef.current = smoothBox(smoothedBoxRef.current, clampBoxToFrame(box, frame.width, frame.height));
      const containerEl = containerRef.current;
      const container = containerEl
        ? { width: containerEl.clientWidth, height: containerEl.clientHeight }
        : frame;
      const sb = smoothedBoxRef.current;
      setFaceBox(faceBoxStyle([sb.x, sb.y, sb.width, sb.height], frame, container, 'contain'));

      const ratio = headTurnRatio ?? null;
      if (ratio !== null) {
        recentRatiosRef.current = [...recentRatiosRef.current, ratio].slice(-LIVENESS_BASELINE_SAMPLES);
      }

      if (faceCount > 1) {
        // Never continue authorisation with more than one person in frame.
        abortAuthorizationForMultipleFaces();
        return;
      }

      const status = scanStatusRef.current;

      if (status === "LIVENESS_CHECK") {
        const challenge = challengeRef.current;
        if (!challenge || !candidateUserRef.current) { resetTurnstileKiosk(); return; }
        const result = challenge.observe(ratio, now);
        logLivenessTelemetry({ baseline: result.baseline, current: ratio, delta: result.delta, consecutive: result.consecutive });
        // Progress comes ONLY from real tracking observations.
        setScanProgress(Math.min(96, Math.round((result.consecutive / challenge.requiredConsecutiveSamples) * 96)));
        if (result.state === CHALLENGE_STATE.TIMED_OUT) {
          failLivenessTimeout();
        } else if (result.state === CHALLENGE_STATE.PASSED) {
          runFinalConfirmation();
        }
        return;
      }

      if (status === "SYSTEM_ACTIVE" || status === "PRESENCE_DETECTED") {
        const proximityPct = (sb.width / frame.width) * 100;
        if (proximityPct < 8) {
          changeScanState("PRESENCE_DETECTED", "TARGET DETECTED // MOVE CLOSER");
        } else {
          changeScanState("TARGET_LOCKING", "LOCKING BIOMETRIC VECTORS...");
        }
      }
      return;
    }

    // No face in this tracking sample.
    if (scanStatusRef.current === "LIVENESS_CHECK" && challengeRef.current) {
      const result = challengeRef.current.observe(null, now);
      if (result.state === CHALLENGE_STATE.TIMED_OUT) {
        failLivenessTimeout();
        return;
      }
    }
    // Retain the box through a brief miss, then clear it and rearm.
    if (lastFaceSeenAtRef.current && now - lastFaceSeenAtRef.current >= BOX_CLEAR_TIMEOUT_MS) {
      clearTrackingState();
      const status = scanStatusRef.current;
      if (status === "PRESENCE_DETECTED" || status === "TARGET_LOCKING" || status === "LIVENESS_CHECK") {
        // Person left the frame — fail closed and return to standby.
        resetTurnstileKiosk();
      }
    }
  };

  const abortAuthorizationForMultipleFaces = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    lockPendingRef.current = false;
    candidateUserRef.current = null;
    challengeRef.current = null;
    setScanProgress(0);
    changeScanState("PRESENCE_DETECTED", "MULTIPLE FACES DETECTED — ONE PERSON AT A TIME");
  };

  // ------------------------------------------------------------------
  // B. FULL RECOGNITION LOOP — identity only, ~once per SCAN_INTERVAL_MS,
  // and ONLY while identification is needed (TARGET_LOCKING). Once a
  // candidate is secured it stops until the final confirmation.
  // ------------------------------------------------------------------
  const performRecognitionScan = async () => {
    const gate = recognitionInFlightRef.current;
    // No overlapping requests; short backoff after a recognition-service failure.
    if (!gate.canScan()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (scanStatusRef.current !== "TARGET_LOCKING" || lockPendingRef.current) return;

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

      if (scanStatusRef.current !== "TARGET_LOCKING" || lockPendingRef.current) return;

      const recognizedUser = res.data?.user;
      if (!recognizedUser) return; // presence/no-face resets belong to the tracking loop

      // TARGET LOCKING SEQUENCE — one decision per lock window.
      lockPendingRef.current = true;
      setScanProgress(12);
      let progress = 12;
      progressIntervalRef.current = setInterval(() => {
        progress += Math.floor(Math.random() * 14) + 4;
        if (progress >= 96) { setScanProgress(96); clearInterval(progressIntervalRef.current); }
        else { setScanProgress(progress); }
      }, 120);

      lockTimerRef.current = setTimeout(() => {
        clearInterval(progressIntervalRef.current);
        lockPendingRef.current = false;
        resolveCandidateDecision(recognizedUser);
      }, TARGET_LOCK_MS);
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

  const resolveCandidateDecision = (recognizedUser) => {
    if (scanStatusRef.current !== "TARGET_LOCKING") return;

    if (recognizedUser && recognizedUser.status === RECOGNITION_STATUS.AUTHORIZED) {
      candidateUserRef.current = recognizedUser;
      // Baseline = median of up to three recent valid tracking ratios; the
      // challenge then requires sustained CHANGE from that baseline.
      challengeRef.current = createHeadTurnChallenge({
        initialSamples: recentRatiosRef.current,
      });
      setScanProgress(0);
      changeScanState("LIVENESS_CHECK", "TURN HEAD SLIGHTLY AND HOLD");
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
  };

  // Liveness timeout: fail closed — the turnstile stays locked and no
  // Attendance record is ever created from an unconfirmed challenge.
  const failLivenessTimeout = () => {
    const subject = describeRecognitionSubject(candidateUserRef.current);
    candidateUserRef.current = null;
    challengeRef.current = null;
    setScanProgress(0);
    changeScanState("UNKNOWN_QUERY", "LIVENESS TIMEOUT — ACCESS DENIED");
    setLastDecision({
      identityLabel: subject.identityLabel,
      attendanceResult: 'Access denied — head-turn not confirmed in time',
      gateAction: 'Turnstile remains locked'
    });
    setTimeout(() => { resetTurnstileKiosk(); }, 3500);
  };

  // ------------------------------------------------------------------
  // FINAL SAME-IDENTITY CONFIRMATION — the lightweight tracker never grants
  // access. After the head-turn passes, one final full recognition must match
  // the ORIGINAL candidate user ID (and still be AUTHORIZED) before the gate
  // attendance transaction runs. Anything else fails closed.
  // ------------------------------------------------------------------
  const runFinalConfirmation = async () => {
    const candidate = candidateUserRef.current;
    if (!candidate || finalizingRef.current) return;
    finalizingRef.current = true;
    challengeRef.current = null;
    changeScanState("AUTHORIZING", "CONFIRMING IDENTITY BEFORE UNLOCK");
    const scanSession = scanSessionRef.current;

    try {
      const imageBase64 = await captureFrameBase64();
      if (!imageBase64) { failFinalConfirmation(); return; }
      const res = await axios.post(RECOGNIZE_URL, {
        image: imageBase64,
        cameraLocation: CAMERA_LOCATION
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (scanSession !== scanSessionRef.current) return;

      const finalUser = res.data?.user;
      if (
        finalUser &&
        finalUser.id != null &&
        finalUser.id === candidate.id &&
        finalUser.status === RECOGNITION_STATUS.AUTHORIZED
      ) {
        await processAttendanceTransaction(candidate);
      } else {
        // Identity differs, disappeared, unknown or suspended — fail closed.
        failFinalConfirmation();
      }
    } catch (err) {
      console.error("Final identity confirmation failed:", err);
      failFinalConfirmation();
    } finally {
      finalizingRef.current = false;
    }
  };

  const failFinalConfirmation = () => {
    candidateUserRef.current = null;
    challengeRef.current = null;
    setScanProgress(0);
    changeScanState("UNKNOWN_QUERY", "IDENTITY NOT CONFIRMED — ACCESS DENIED");
    setLastDecision({
      identityLabel: 'Unknown Person',
      attendanceResult: 'Access denied — final identity confirmation failed',
      gateAction: 'Turnstile remains locked'
    });
    setTimeout(() => { resetTurnstileKiosk(); }, 3500);
  };

  const resetTurnstileKiosk = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    lockPendingRef.current = false;
    setFaceBox(null);
    smoothedBoxRef.current = null;
    setScanProgress(0);
    candidateUserRef.current = null;
    challengeRef.current = null;
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
              <canvas ref={trackCanvasRef} style={{ display: 'none' }} />

              {faceBox && (
                <div
                  className={`face-tracking-box state-${scanStatus.toLowerCase()}`}
                  style={{
                    top: faceBox.top,
                    left: faceBox.left,
                    width: faceBox.width,
                    height: faceBox.height,
                    transition: 'top 100ms linear, left 100ms linear, width 100ms linear, height 100ms linear'
                  }}
                >
                  <div className="corner-bracket top-left"></div>
                  <div className="corner-bracket top-right"></div>
                  <div className="corner-bracket bottom-left"></div>
                  <div className="corner-bracket bottom-right"></div>
                  {scanStatus === "TARGET_LOCKING" && <div className="matrix-scan-line"></div>}

                  <div className="box-identity-panel">
                    <span className="access-status-label">
                      {scanStatus === "TARGET_LOCKING" && `ANALYZING: ${scanProgress}%`}
                      {scanStatus === "LIVENESS_CHECK" && "MOTION LIVENESS ACTIVE"}
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
                    {scanStatus === "LIVENESS_CHECK" && "HEAD-TURN VERIFICATION"}
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
