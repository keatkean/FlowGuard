import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/VPatrol.css'; // Reusing your high-tech tracking box and HUD dashboard styles
import {
  PI_CAMERA_STREAM_URL,
  CAMERA_SOURCES,
  CAMERA_STATUS_MESSAGES,
  isPiCameraReachable,
  fetchPiSnapshotBitmap,
} from '../constants/piCamera';

const GateScanner = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [scanStatus, setScanStatus] = useState("SYSTEM_ACTIVE");
  const [displayMessage, setDisplayMessage] = useState("PLACE FACE IN VIEWPORT");
  const [faceBox, setFaceBox] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);

  // Camera source: Raspberry Pi Gate Camera is primary, laptop webcam is fallback
  const [cameraSource, setCameraSource] = useState(CAMERA_SOURCES.PI);
  const [cameraStatusMsg, setCameraStatusMsg] = useState("Connecting to Pi Gate Camera...");
  const cameraSourceRef = useRef(CAMERA_SOURCES.PI);
  const piFailStreakRef = useRef(0);

  const scanStatusRef = useRef("SYSTEM_ACTIVE");
  const lockTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const candidateUserRef = useRef(null);
  const isScanningRef = useRef(false);

  const token = localStorage.getItem("accessToken");
  const ATTENDANCE_SCAN_URL = "/api/attendance/scan";

  const changeScanState = (nextState, message) => {
    setScanStatus(nextState);
    scanStatusRef.current = nextState;
    if (message) setDisplayMessage(message);
  };

  useEffect(() => {
    initCameraSource();
    const scanInterval = setInterval(() => performPerimeterScan(), 1200);

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

  const processAttendanceTransaction = async (verifiedName) => {
    changeScanState("SECURE_MATCH", "IDENTITY VERIFIED // PROCESSING TIMECARD");
    setScanProgress(100);

    try {
      // 🎯 Hit the Node.js automatic clock-in/out controller
      const res = await axios.post(ATTENDANCE_SCAN_URL, { name: verifiedName }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.action) {
        // Render the exact system response action directly onto the kiosk screen
        const actionMessage = res.data.action.replace(/_/g, " ");
        setDisplayMessage(`🔓 ${verifiedName}: ${actionMessage}`);
      }
    } catch (err) {
      console.error("Attendance Sync Failed:", err);
      setDisplayMessage("🚨 GATE TRANSACTION ROUTING FAULT");
    }

    setTimeout(() => { resetTurnstileKiosk(); }, 4000);
  };

  // Capture one frame from the active camera source onto the hidden canvas
  // and return it as a compressed JPEG data URL for the recognition API.
  const captureFrameBase64 = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    const maxWidth = 420;

    if (cameraSourceRef.current === CAMERA_SOURCES.PI) {
      let bitmap;
      try {
        bitmap = await fetchPiSnapshotBitmap();
        piFailStreakRef.current = 0;
      } catch {
        // Pi snapshot failed mid-session — after 3 misses, fall back to webcam
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
    if (isScanningRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    if (scanStatusRef.current === "SECURE_MATCH" || scanStatusRef.current === "UNKNOWN_QUERY") return;

    isScanningRef.current = true;

    try {
      const imageBase64 = await captureFrameBase64();
      if (!imageBase64) return;
      const res = await axios.post('/ai/user/recognize', { image: imageBase64 }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (scanStatusRef.current === "SECURE_MATCH" || scanStatusRef.current === "UNKNOWN_QUERY") return;

      if (res.data && res.data.box && res.data.box.length >= 4) {
        let rawX, rawY, boxWidth, boxHeight;
        const [v1, v2, v3, v4] = res.data.box;
        if (v2 > v4 && v3 > v1) { rawY = v1; rawX = v4; boxWidth = v2 - v4; boxHeight = v3 - v1; } 
        else { rawX = v1; rawY = v2; boxWidth = v3; boxHeight = v4; }
        
        const faceProximityPercentage = (boxWidth / canvas.width) * 100;
        const livenessRatio = res.data.liveness_ratio || 0.5;

        const targetBox = {
          left: `${(rawX / canvas.width) * 100}%`, top: `${(rawY / canvas.height) * 100}%`,
          width: `${(boxWidth / canvas.width) * 100}%`, height: `${(boxHeight / canvas.height) * 100}%`
        };

        if (faceProximityPercentage < 8 && scanStatusRef.current !== "LIVENESS_CHECK") {
          changeScanState("PRESENCE_DETECTED", "TARGET DETECTED // MOVE CLOSER");
          setFaceBox(null); 
          return;
        }

        // 🎯 LIVENESS CHECK: Wait for head swing rotation
        if (scanStatusRef.current === "LIVENESS_CHECK") {
          setFaceBox(targetBox);
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

            if (res.data.user && res.data.user.name !== "UNAUTHORIZED") {
              candidateUserRef.current = res.data.user.name;
              changeScanState("LIVENESS_CHECK", "VERIFYING LIVENESS: TURN HEAD SLIGHTLY");
            } else {
              changeScanState("UNKNOWN_QUERY", "🚨 PERIMETER BREACH: ACCESS DENIED");
              setScanProgress(0);
              setTimeout(() => { resetTurnstileKiosk(); }, 3500);
            }
          }, 1800);
        } else if (scanStatusRef.current === "TARGET_LOCKING") {
          setFaceBox(targetBox);
        }
      } else {
        if (scanStatusRef.current !== "LIVENESS_CHECK" && scanStatusRef.current !== "TARGET_LOCKING") {
          resetTurnstileKiosk();
        }
      }
    } catch (err) {
      console.error("Gate AI Link Fault:", err);
    } finally {
      isScanningRef.current = false;
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

        <div className="vpatrol-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="vpatrol-card monitor-section">
            <div className={`cctv-container state-theme-${scanStatus.toLowerCase()}`} style={{ width: '100%', height: '100%' }}>
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
                      {scanStatus === "LIVENESS_CHECK" && "⚠️ ANTI-SPOOF ACTIVE"}
                      {scanStatus === "SECURE_MATCH" && "✓ ACCESS GRANTED"}
                      {scanStatus === "UNKNOWN_QUERY" && "🚨 PERIMETER ALERT"}
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
                    {scanStatus === "SYSTEM_ACTIVE" && "● SYSTEM ARMED"}
                    {scanStatus === "LIVENESS_CHECK" && "🔄 PROCESSING 3D PROFILE"}
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
      </main>
    </div>
  );
};

export default GateScanner;
