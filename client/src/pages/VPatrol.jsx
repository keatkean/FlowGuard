import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/VPatrol.css';
import {
  PI_CAMERA_STREAM_URL,
  CAMERA_SOURCES,
  CAMERA_STATUS_MESSAGES,
  isPiCameraReachable,
  fetchPiSnapshotBitmap,
} from '../constants/piCamera';

const VPatrol = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Camera source: Raspberry Pi Gate Camera is primary, laptop webcam is fallback
  const [cameraSource, setCameraSource] = useState(CAMERA_SOURCES.PI);
  const [cameraStatusMsg, setCameraStatusMsg] = useState("Connecting to Pi Gate Camera...");
  const cameraSourceRef = useRef(CAMERA_SOURCES.PI);
  const piFailStreakRef = useRef(0);
  
  // Staged States: SYSTEM_ACTIVE, PRESENCE_DETECTED, TARGET_LOCKING, LIVENESS_CHECK, SECURE_MATCH, UNKNOWN_QUERY
  const [scanStatus, setScanStatus] = useState("SYSTEM_ACTIVE"); 
  const [identifiedUser, setIdentifiedUser] = useState(null);
  const [faceBox, setFaceBox] = useState(null); 
  const [scanProgress, setScanProgress] = useState(0); 
  
  const scanStatusRef = useRef("SYSTEM_ACTIVE");
  const lockTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const isScanningRef = useRef(false);

  // LIVENESS MEMORY: Tracks the head-turn validation
  const candidateUserRef = useRef(null); 
  const lastLogRef = useRef({ name: null, timestamp: 0 });

  const [systemTime, setSystemTime] = useState(new Date().toLocaleTimeString('en-SG', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
  }));

  const [incidentLogs, setIncidentLogs] = useState([]);

  const token = localStorage.getItem("accessToken");
  const NODE_SERVER_URL = "/api/security/logs";

  const changeScanState = (nextState) => {
    setScanStatus(nextState);
    scanStatusRef.current = nextState;
  };

  useEffect(() => {
    initCameraSource();

    // FETCH PERMANENT LOGS ON LOAD
    axios.get(NODE_SERVER_URL, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.data && res.data.length > 0) {
          setIncidentLogs(res.data);
        } else {
          setIncidentLogs([{ id: 'SYS-001', time: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }), type: 'System Online', desc: 'Biometric sensors initialized.', severity: 'safe', icon: '✅' }]);
        }
      })
      .catch(err => {
        console.error("Database connection waiting...", err);
        setIncidentLogs([{ id: 'SYS-001', time: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }), type: 'System Offline', desc: 'Cannot connect to security database.', severity: 'critical', icon: '⚠️' }]);
      });

    const clockInterval = setInterval(() => {
      setSystemTime(new Date().toLocaleTimeString('en-SG', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
      }));
    }, 1000);

    const scanInterval = setInterval(() => { 
      performLiveScan(); 
    }, 1200);

    return () => {
      stopCCTV();
      clearInterval(clockInterval);
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
      stopCCTV();
      applyCameraSource(CAMERA_SOURCES.PI, CAMERA_STATUS_MESSAGES.PI_CONNECTED);
      changeScanState("SYSTEM_ACTIVE");
    } else {
      applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE);
      await startCCTV();
    }
  };

  // Manual camera source switch (Pi Gate Camera / Laptop Webcam)
  const selectCameraSource = async (source) => {
    if (source === cameraSourceRef.current) return;
    if (source === CAMERA_SOURCES.PI) {
      const piReachable = await isPiCameraReachable();
      if (piReachable) {
        stopCCTV();
        applyCameraSource(CAMERA_SOURCES.PI, CAMERA_STATUS_MESSAGES.PI_CONNECTED);
        changeScanState("SYSTEM_ACTIVE");
      } else {
        applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.PI_UNAVAILABLE);
        await startCCTV();
      }
    } else {
      applyCameraSource(CAMERA_SOURCES.WEBCAM, CAMERA_STATUS_MESSAGES.WEBCAM_ACTIVE);
      await startCCTV();
    }
  };

  const startCCTV = async () => {
    // Guard: browser without camera API (insecure context / no webcam support)
    if (!navigator.mediaDevices?.getUserMedia) {
      changeScanState("HARDWARE_ERR");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 20 },
          facingMode: "user"
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(() => changeScanState("HARDWARE_ERR"));
        };
      }
      changeScanState("SYSTEM_ACTIVE");
    } catch (err) {
      // Permission denied, no device, or device busy — surface it instead of a black feed
      console.error("CCTV camera unavailable:", err);
      changeScanState("HARDWARE_ERR");
    }
  };

  const stopCCTV = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const playFeedback = (type) => {
    const audioPath = type === 'success' ? '/sounds/success.mp3' : '/sounds/denied.mp3';
    const audio = new Audio(audioPath);
    audio.volume = 0.4; 
    audio.play().catch(() => console.log("Audio waiting for user gesture"));
  };

  const grantFinalAccess = (detectedName) => {
    playFeedback('success');
    changeScanState("SECURE_MATCH");
    setIdentifiedUser(detectedName);
    setScanProgress(100);
    
    const currentTimestamp = Date.now();
    const logTimeStr = new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    if (lastLogRef.current.name !== detectedName || (currentTimestamp - lastLogRef.current.timestamp > 30000)) {
      const newLog = {
        id: `ACC-${Date.now()}`,
        time: logTimeStr,
        type: 'Gantry Access',
        desc: `Identity & Liveness Verified: ${detectedName}`,
        severity: 'safe',
        icon: '🔓',
        personnelName: detectedName 
      };
      
      setIncidentLogs(prev => [newLog, ...prev.slice(0, 14)]); 
      lastLogRef.current = { name: detectedName, timestamp: currentTimestamp };
      
      axios.post(NODE_SERVER_URL, newLog, { headers: { Authorization: `Bearer ${token}` } })
        .catch(e => console.log("DB Save Failed", e));
    }

    setTimeout(() => { resetScanner(); }, 3500);
  };

  // Capture one frame from the active camera source onto the hidden canvas
  // and return it as a compressed JPEG data URL for the recognition API.
  const captureFrameBase64 = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    const MAX_WIDTH = 420;

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
          await startCCTV();
        }
        return null;
      }
      const scale = Math.min(1, MAX_WIDTH / bitmap.width);
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg', 0.3);
    }

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scaleDownRatio = MAX_WIDTH / video.videoWidth;
    canvas.width = MAX_WIDTH;
    canvas.height = video.videoHeight * scaleDownRatio;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.3);
  };

  const performLiveScan = async () => {
    if (isScanningRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    if (scanStatusRef.current === "SECURE_MATCH" || scanStatusRef.current === "UNKNOWN_QUERY") return;

    isScanningRef.current = true;

    try {
      const imageBase64 = await captureFrameBase64();
      if (!imageBase64) return;
      const res = await axios.post('/ai/user/recognize', 
        { image: imageBase64 }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (scanStatusRef.current === "SECURE_MATCH" || scanStatusRef.current === "UNKNOWN_QUERY") {
         isScanningRef.current = false;
         return;
      }

      if (res.data && res.data.box && res.data.box.length >= 4) {
        
        let rawX, rawY, boxWidth, boxHeight;
        const [v1, v2, v3, v4] = res.data.box;

        // Note: The AI is now returning coordinates based on the SMALL 480px canvas, not the video
        if (v3 > v1 && v4 > v2 && v3 <= canvas.width && v4 <= canvas.height) {
          rawX = v1; rawY = v2; boxWidth = v3 - v1; boxHeight = v4 - v2;
        } else if (v2 > v4 && v3 > v1) {
          rawY = v1; rawX = v4; boxWidth = v2 - v4; boxHeight = v3 - v1; 
        } else {
          rawX = v1; rawY = v2; boxWidth = v3; boxHeight = v4;
        }
        
        // Calculate proximity based on the compressed canvas width
        const faceProximityPercentage = (boxWidth / canvas.width) * 100; 
        const livenessRatio = res.data.liveness_ratio || 0.5;

        // 🎯 UPDATED MATH: Calculate percentages using the compressed canvas dimensions
        const targetBox = {
          left: `${(rawX / canvas.width) * 100}%`,
          top: `${(rawY / canvas.height) * 100}%`,
          width: `${(boxWidth / canvas.width) * 100}%`,
          height: `${(boxHeight / canvas.height) * 100}%`
        };

        if (faceProximityPercentage < 5 && scanStatusRef.current !== "LIVENESS_CHECK") {
          if (scanStatusRef.current === "SYSTEM_ACTIVE" || scanStatusRef.current === "PRESENCE_DETECTED") {
            changeScanState("PRESENCE_DETECTED");
            setFaceBox(null); 
            setScanProgress(0);
          }
          isScanningRef.current = false; 
          return;
        }

        if (scanStatusRef.current === "LIVENESS_CHECK") {
          setFaceBox(targetBox); 
          
          if (livenessRatio < 0.45 || livenessRatio > 0.55) {
            grantFinalAccess(candidateUserRef.current);
          }
          return; 
        }

        if (scanStatusRef.current === "SYSTEM_ACTIVE" || scanStatusRef.current === "PRESENCE_DETECTED") {
          changeScanState("TARGET_LOCKING");
          setFaceBox(targetBox);
          setScanProgress(12);

          let progress = 12;
          progressIntervalRef.current = setInterval(() => {
            progress += Math.floor(Math.random() * 14) + 4;
            if (progress >= 96) {
              setScanProgress(96);
              clearInterval(progressIntervalRef.current);
            } else {
              setScanProgress(progress);
            }
          }, 120);

          lockTimerRef.current = setTimeout(() => {
            clearInterval(progressIntervalRef.current);
            
            const currentTimestamp = Date.now();
            const logTimeStr = new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

            if (res.data.user && res.data.user.name !== "UNAUTHORIZED") {
              candidateUserRef.current = res.data.user.name;
              changeScanState("LIVENESS_CHECK");
            } else {
              playFeedback('denied');
              changeScanState("UNKNOWN_QUERY");
              setIdentifiedUser("UNKNOWN PERSONNEL");
              setScanProgress(0);

              if (lastLogRef.current.name !== "UNKNOWN" || (currentTimestamp - lastLogRef.current.timestamp > 10000)) {
                const newLog = {
                  id: `SEC-${Date.now()}`,
                  time: logTimeStr,
                  type: 'Intrusion Alert',
                  desc: 'Unregistered personnel detected at gantry.',
                  severity: 'critical',
                  icon: '🚨',
                  personnelName: null
                };

                setIncidentLogs(prev => [newLog, ...prev.slice(0, 14)]);
                lastLogRef.current = { name: "UNKNOWN", timestamp: currentTimestamp };
                
                axios.post(NODE_SERVER_URL, newLog, { headers: { Authorization: `Bearer ${token}` } })
                  .catch(e => console.log("DB Save Failed", e));
              }

              setTimeout(() => { resetScanner(); }, 3500);
            }
          }, 1800);

        } else if (scanStatusRef.current === "TARGET_LOCKING") {
          setFaceBox(targetBox);
        }

      } else {
        if (scanStatusRef.current !== "LIVENESS_CHECK" && scanStatusRef.current !== "TARGET_LOCKING") {
          resetScanner();
        }
      }
    } catch (err) {
      console.error("AI Command Loop Fault:", err);
    } finally {
      isScanningRef.current = false; 
    }
  };

  const resetScanner = () => {
    setIdentifiedUser(null);
    setFaceBox(null);
    setScanProgress(0);
    candidateUserRef.current = null;
    changeScanState("SYSTEM_ACTIVE");
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main vpatrol-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>V-Patrol AI Command Center</h1>
            <p>Real-time biometric gantry and anomaly detection timeline</p>
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

        <div className="vpatrol-grid">
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

              {scanStatus === "HARDWARE_ERR" && (
                <div className="camera-error-overlay" style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                  background: 'rgba(15,23,42,0.92)', color: '#e2e8f0', padding: '24px', zIndex: 5
                }}>
                  <div style={{ fontSize: 40 }}>📷🚫</div>
                  <h3 style={{ margin: '10px 0 4px' }}>Camera unavailable</h3>
                  <p style={{ color: '#94a3b8', maxWidth: 360 }}>
                    Allow camera access in your browser, close other apps using the webcam, then
                    reload. If this device has no camera, the live patrol feed can't run here.
                  </p>
                  <button
                    onClick={startCCTV}
                    style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer' }}
                  >
                    Retry camera
                  </button>
                </div>
              )}

              {faceBox && (
                <div 
                  className={`face-tracking-box state-${scanStatus.toLowerCase()}`}
                  style={{
                    top: faceBox.top,
                    left: faceBox.left,
                    width: faceBox.width,
                    height: faceBox.height
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
                      {scanStatus === "LIVENESS_CHECK" && "⚠️ LIVENESS CHECK"}
                      {scanStatus === "SECURE_MATCH" && "✓ GRANT ACCESS"}
                      {scanStatus === "UNKNOWN_QUERY" && "🚨 ACCESS DENIED"}
                    </span>
                    <span className="person-name-label">
                      {scanStatus === "TARGET_LOCKING" && "LOCKING VECTORS..."}
                      {scanStatus === "LIVENESS_CHECK" && "TURN HEAD SLIGHTLY"}
                      {scanStatus === "SECURE_MATCH" && identifiedUser}
                      {scanStatus === "UNKNOWN_QUERY" && "SUSPICIOUS ACTIVITY"}
                    </span>
                  </div>
                </div>
              )}

              <div className="hud-overlay">
                <div className="hud-top">
                  <div className="hud-left-meta">
                    <span className="hud-node">SYS_MODE // BIOMETRIC_GANTRY</span>
                    {scanStatus === "PRESENCE_DETECTED" && (
                      <span className="hud-radar-alert">⚠️ PROXIMITY SIGNAL DETECTED</span>
                    )}
                  </div>
                  <span className={`hud-status-badge status-${scanStatus.toLowerCase()}`}>
                    {scanStatus === "SYSTEM_ACTIVE" && "● IDLE MONITORING"}
                    {scanStatus === "PRESENCE_DETECTED" && "⚡ MOTION ACQUIRED"}
                    {scanStatus === "TARGET_LOCKING" && "⏳ VECTOR LOCK ACTIVE"}
                    {scanStatus === "LIVENESS_CHECK" && "🔄 AWAITING MOVEMENT"}
                    {scanStatus === "SECURE_MATCH" && "SUCCESS MATCH"}
                    {scanStatus === "UNKNOWN_QUERY" && "ALERT WARNING"}
                  </span>
                </div>
                
                <div className="hud-bottom">
                  <div className="hud-coordinates-telemetry">
                    <p>LAT: 1.3521° N // LON: 103.8198° E</p>
                    <p className="hud-engine-log">MATRIX_ENGINE: ACTIVE_v3.42</p>
                  </div>
                  <p className="hud-clock">{systemTime}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="vpatrol-card timeline-section">
            <div className="section-header">
              <h2>Security Timeline</h2>
            </div>
            
            <div className="vpatrol-list">
              {incidentLogs.length > 0 ? incidentLogs.map((log) => (
                <div key={log.id} className={`vpatrol-item ${log.severity}`}>
                  <div className="item-header">
                    <span className="item-id">#{log.id}</span>
                    <span className="item-type-timestamp">{log.time}</span>
                  </div>
                  <div className="item-body">
                    <div className="item-icon">{log.icon}</div>
                    <div className="item-text">
                      <h4>{log.type}</h4>
                      <p>{log.desc}</p>
                    </div>
                  </div>
                </div>
              )) : <p>Initializing security sensors...</p>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VPatrol;
