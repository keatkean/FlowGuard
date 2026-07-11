import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { getHardwareStreamUrl, getHardwareHealthUrl } from '../utils/securepiStream';
import '../css/Dashboard.css';
import '../css/ObjectDetection.css';

const ZONES_URL = '/api/zones';
const CAMERAS_URL = '/api/cameras';
const ALERTS_URL = '/api/detection-alerts';
const PEOPLE_URL = '/ai/api/yolo/people-count';
const ANALYZE_FRAME_URL = '/ai/api/yolo/analyze-frame';
const OPEN_ALERT_STATUSES = ['Active', 'Acknowledged', 'Investigating', 'Escalated', 'Dispatched'];
const SECUREPI_STREAM_URL = import.meta.env.VITE_SECUREPI_STREAM_URL || '';
const SECUREPI_HEALTH_URL = import.meta.env.VITE_SECUREPI_HEALTH_URL || '';

const Icon = ({ name }) => <span className={`od-icon od-icon-${name}`} aria-hidden="true" />;

const alertSource = (alert) => alert?.source || 'Object Detection';
const isSecurePiAlert = (alert) => /securepi/i.test(alertSource(alert)) || /unattended/i.test(`${alert?.alert_type || ''} ${alert?.object_class || ''}`);
const alertTitle = (alert) => {
  if (!alert) return '';
  if (isSecurePiAlert(alert)) return 'Unattended pallet/object detected';
  const rawTitle = String(alert.object_class || alert.alert_type || 'Detection Alert').replace(/^(Critical|Warning):\s*/i, '');
  return /detect/i.test(rawTitle) ? rawTitle : `${rawTitle} Detected`;
};
const alertTimestamp = (alert) => {
  const raw = alert?.occurred_at || alert?.createdAt || alert?.timestamp;
  if (!raw) return 'n/a';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
};

const ObjectDetection = () => {
  const [zones, setZones] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [detectionActive, setDetectionActive] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [alertActionBusy, setAlertActionBusy] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState(null);

  const [streamError, setStreamError] = useState(false);
  const [aiOffline, setAiOffline] = useState(false);
  const [nodeOffline, setNodeOffline] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('starting');
  const [detections, setDetections] = useState([]);
  const [frameSize, setFrameSize] = useState({ width: 640, height: 480 });
  const [browserCameraError, setBrowserCameraError] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [sourceMode, setSourceMode] = useState('camera');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [uploadedVideoName, setUploadedVideoName] = useState('');
  const [hardwareReloadKey, setHardwareReloadKey] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const processingFrameRef = useRef(false);
  const aiHealthFailuresRef = useRef(0);

  const token = localStorage.getItem('accessToken');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchZones = useCallback(() => {
    axios.get(ZONES_URL, { headers })
      .then(res => { setZones(res.data); setNodeOffline(false); })
      .catch(() => setNodeOffline(true));
  }, []);

  const fetchCameras = useCallback(() => {
    axios.get(CAMERAS_URL, { headers })
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCameras(list);
        setSelectedCameraId((prev) => (list.some((cam) => String(cam.id) === String(prev)) ? prev : (list[0]?.id ?? '')));
      })
      .catch(() => setCameras([]));
  }, []);

  const fetchAlerts = useCallback(() => {
    axios.get(ALERTS_URL, { headers })
      .then(res => { setAlerts(res.data); setNodeOffline(false); })
      .catch(() => setNodeOffline(true));
  }, []);

  const fetchPeopleCount = useCallback(() => {
    axios.get(PEOPLE_URL, { timeout: 8000 })
      .then(res => {
        aiHealthFailuresRef.current = 0;
        setPeopleCount(res.data.count ?? 0);
        setDetectionActive(res.data.detection_active ?? false);
        setAiOffline(false);
        setStreamError(false);
      })
      .catch(() => {
        aiHealthFailuresRef.current += 1;
        setPeopleCount(0);
        setDetectionActive(false);
        if (aiHealthFailuresRef.current >= 3) {
          setAiOffline(true);
        }
      });
  }, []);

  const monitoredCamera = useMemo(
    () => cameras.find((cam) => String(cam.id) === String(selectedCameraId)) || null,
    [cameras, selectedCameraId]
  );
  const hardwareStreamUrl = useMemo(
    () => getHardwareStreamUrl(monitoredCamera, SECUREPI_STREAM_URL),
    [monitoredCamera]
  );
  const hardwareHealthUrl = useMemo(
    () => getHardwareHealthUrl(hardwareStreamUrl, SECUREPI_HEALTH_URL),
    [hardwareStreamUrl]
  );

  useEffect(() => {
    fetchZones();
    fetchCameras();
    fetchAlerts();
    fetchPeopleCount();

    const peopleInterval = setInterval(fetchPeopleCount, 5000);
    const alertsInterval = setInterval(fetchAlerts, 15000);

    return () => {
      clearInterval(peopleInterval);
      clearInterval(alertsInterval);
    };
  }, []);

  useEffect(() => {
    let stream;
    let frameInterval;

    const stopBrowserCamera = () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
    };

    const analyzeCurrentFrame = async () => {
      if (processingFrameRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      processingFrameRef.current = true;
      const context = canvas.getContext('2d');
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.35);

      try {
        const res = await axios.post(ANALYZE_FRAME_URL, { image }, { timeout: 10000 });
        setDetections(res.data.detections ?? []);
        setPeopleCount(res.data.count ?? 0);
        setDetectionActive(res.data.detection_active ?? false);
        setCameraStatus(res.data.camera_status ?? 'browser_camera');
        setFrameSize({
          width: res.data.frame_width || canvas.width,
          height: res.data.frame_height || canvas.height,
        });
        setAiOffline(false);
        setStreamError(false);
      } catch (err) {
        setDetectionActive(false);
        setCameraStatus(err.response ? 'analysis_error' : 'analysis_retrying');
      } finally {
        processingFrameRef.current = false;
      }
    };

    const startBrowserCamera = async () => {
      try {
        setDetections([]);
        setCameraStatus('requesting_browser_camera');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15, max: 20 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              setCameraReady(true);
              setCameraStatus('browser_camera_active');
              analyzeCurrentFrame();
            } catch {
              setCameraStatus('browser_camera_paused');
            }
          };
          setBrowserCameraError(false);
          frameInterval = setInterval(analyzeCurrentFrame, 2200);
        }
      } catch {
        setBrowserCameraError(true);
        setCameraStatus('browser_camera_denied');
      }
    };

    const startUploadedVideo = async () => {
      const video = videoRef.current;
      if (!video || !uploadedVideoUrl) {
        setCameraReady(false);
        setCameraStatus('waiting_for_video_file');
        return;
      }

      setBrowserCameraError(false);
      setCameraStatus('uploaded_video');
      video.srcObject = null;
      video.src = uploadedVideoUrl;
      video.loop = true;
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          setCameraReady(true);
          analyzeCurrentFrame();
        } catch {
          setCameraStatus('uploaded_video_paused');
        }
      };
      frameInterval = setInterval(analyzeCurrentFrame, 2200);
    };

    const startHardwareStream = async () => {
      setBrowserCameraError(false);
      setDetections([]);
      setDetectionActive(false);
    };

    if (sourceMode === 'file') {
      startUploadedVideo();
    } else if (sourceMode === 'camera') {
      startBrowserCamera();
    } else if (sourceMode === 'hardware') {
      startHardwareStream();
    }

    return () => {
      clearInterval(frameInterval);
      stopBrowserCamera();
    };
  }, [sourceMode, uploadedVideoUrl]);

  useEffect(() => () => {
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
  }, [uploadedVideoUrl]);

  // Hardware connection state reacts to the selected inventory camera changing
  // without restarting the browser-camera/uploaded-video effect above.
  useEffect(() => {
    if (sourceMode !== 'hardware') return;
    setStreamError(false);
    setCameraReady(false);
    setCameraStatus(hardwareStreamUrl ? 'connecting_securepi_edge' : 'securepi_stream_not_configured');
  }, [sourceMode, hardwareStreamUrl]);

  useEffect(() => {
    if (sourceMode !== 'hardware' || !hardwareHealthUrl) return undefined;
    let cancelled = false;
    const checkHealth = () => {
      axios.get(hardwareHealthUrl, { timeout: 3000 })
        .then(() => {
          if (cancelled) return;
          setCameraStatus('securepi_edge_live');
          setStreamError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setCameraStatus('securepi_edge_offline');
          setStreamError(true);
        });
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sourceMode, hardwareReloadKey, hardwareHealthUrl]);

  const handleUpdateAlertStatus = async (id, status) => {
    setAlertActionBusy(true);
    setWorkflowMessage('');
    try {
      const res = await axios.put(`${ALERTS_URL}/${id}`, { status }, { headers });
      setAlerts(prev => prev.map(a => a.id === id ? res.data : a));
      setWorkflowMessage(status === 'Cleared' ? 'Alert marked cleared.' : `Alert marked ${status.toLowerCase()}.`);
    } catch (err) {
      console.error('Update alert error:', err);
      setWorkflowMessage('Could not update this alert. Check that the Node.js server is running.');
    } finally {
      setAlertActionBusy(false);
    }
  };

  const handleAcknowledgeAlert = (id) => {
    handleUpdateAlertStatus(id, 'Acknowledged');
  };

  const handleInvestigateAlert = (id) => {
    handleUpdateAlertStatus(id, 'Investigating');
  };

  const handleEscalateAlert = (id) => {
    handleUpdateAlertStatus(id, 'Escalated');
  };

  const handleClearAlert = (id) => {
    handleUpdateAlertStatus(id, 'Cleared');
  };

  const handleClearAllAlerts = async () => {
    const openAlerts = alerts.filter((a) => OPEN_ALERT_STATUSES.includes(a.status));
    if (openAlerts.length === 0) return;
    setAlertActionBusy(true);
    setWorkflowMessage('');
    try {
      const results = await Promise.all(
        openAlerts.map((a) => axios.put(`${ALERTS_URL}/${a.id}`, { status: 'Cleared' }, { headers }))
      );
      setAlerts((prev) => prev.map((a) => {
        const updated = results.find((r) => r.data.id === a.id);
        return updated ? updated.data : a;
      }));
      setWorkflowMessage('All active alerts cleared.');
    } catch (err) {
      console.error('Clear all alerts error:', err);
      setWorkflowMessage('Could not clear all alerts. Check that the Node.js server is running.');
    } finally {
      setAlertActionBusy(false);
    }
  };

  const handleVideoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
    setUploadedVideoUrl(URL.createObjectURL(file));
    setUploadedVideoName(file.name);
    setSourceMode('file');
    setCameraReady(false);
    setDetections([]);
  };

  const activeAlertCount = alerts.filter(a => OPEN_ALERT_STATUSES.includes(a.status)).length;
  const clearedAlertCount = alerts.filter(a => a.status === 'Cleared').length;
  const latestOpenAlert = useMemo(() => (
    alerts.find(alert => OPEN_ALERT_STATUSES.includes(alert.status)) || null
  ), [alerts]);
  const displayedAlert = useMemo(() => {
    const selected = selectedAlertId
      ? alerts.find(alert => alert.id === selectedAlertId && OPEN_ALERT_STATUSES.includes(alert.status))
      : null;
    return selected || latestOpenAlert;
  }, [alerts, selectedAlertId, latestOpenAlert]);
  const latestIncidentTitle = useMemo(() => {
    if (!displayedAlert) return '';
    return alertTitle(displayedAlert);
  }, [displayedAlert]);
  const sourceTitle = sourceMode === 'hardware'
    ? 'SecurePi Edge Live'
    : sourceMode === 'file'
      ? uploadedVideoName || 'Uploaded video file'
      : 'Browser camera';
  const sourceSubtitle = sourceMode === 'hardware'
    ? 'Raspberry Pi AI Camera IMX500'
    : 'YOLO frame analysis';

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main od-main">
        <header className="dashboard-header od-header">
          <div className="header-titles">
            <h1>Real-Time Object Detection</h1>
            <p>Live YOLO inference, restricted-zone controls, and incident resolution</p>
          </div>
          <div className="od-header-actions">
            <div className={`od-engine-badge ${aiOffline ? 'offline' : ''}`}>
              <span className="od-people-dot" />
              AI Engine: {aiOffline ? 'Offline' : 'Online'}
            </div>
            <div className="od-people-badge">
              <Icon name="person" />
              {peopleCount} {peopleCount === 1 ? 'Person' : 'People'} Detected
            </div>
          </div>
        </header>

        {nodeOffline && (
          <div className="od-system-banner danger">
            Node.js server offline - run <strong>node index.js</strong> in /server (port 5001)
          </div>
        )}
        {aiOffline && (
          <div className="od-system-banner warning">
            Python AI service offline - run <strong>uvicorn main:app --host 0.0.0.0 --port 8501</strong> in /ai-service
          </div>
        )}

        <section className="od-command-strip">
          <div className="od-command-card cyan">
            <span>Detections Today</span>
            <strong>{peopleCount + alerts.length}</strong>
            <small>Live frame plus alert log</small>
          </div>
          <div className="od-command-card red">
            <span>Open Alerts</span>
            <strong>{activeAlertCount}</strong>
            <small>{clearedAlertCount} cleared in alert log</small>
          </div>
          <div className="od-command-card amber">
            <span>Zones Tracked</span>
            <strong>{zones.length}</strong>
            <small>Managed in Detection Setup</small>
          </div>
          <div className="od-command-card green">
            <span>Inference State</span>
            <strong>{detectionActive ? 'Active' : 'Standby'}</strong>
            <small>{cameraStatus.replace(/_/g, ' ')}</small>
          </div>
        </section>

        <div className="od-grid">
          <div className="od-stream-card">
            <div className="od-stream-header">
              <div>
                <h2>Live Camera Feed</h2>
                <p>{sourceTitle} - {sourceSubtitle}</p>
              </div>
              <div className="od-stream-badges">
                <span className={sourceMode === 'hardware' && cameraReady ? 'active' : detectionActive ? 'active' : 'standby'}>
                  {sourceMode === 'hardware' ? (cameraReady ? 'SECUREPI EDGE LIVE' : 'SECUREPI CONNECTING') : detectionActive ? 'YOLO ACTIVE' : 'YOLO STANDBY'}
                </span>
                <span>CAMERA: {cameraStatus.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
            </div>

            <div className="od-source-controls">
              <button
                type="button"
                className={sourceMode === 'camera' ? 'active' : ''}
                onClick={() => setSourceMode('camera')}
              >
                Browser Camera
              </button>
              <label className={sourceMode === 'file' ? 'active' : ''}>
                Upload Video
                <input type="file" accept="video/*" onChange={handleVideoUpload} />
              </label>
              <button
                type="button"
                className={sourceMode === 'hardware' ? 'active' : ''}
                onClick={() => setSourceMode('hardware')}
              >
                SecurePi Hardware
              </button>
              <select
                className="od-input od-camera-picker"
                value={selectedCameraId}
                onChange={(event) => setSelectedCameraId(event.target.value)}
              >
                {cameras.length === 0 && <option value="">No cameras in inventory</option>}
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>{cam.camera_code} - {cam.camera_name}</option>
                ))}
              </select>
            </div>

            <p className="od-monitoring-label">
              {monitoredCamera
                ? <>Currently Monitoring: <strong>{monitoredCamera.camera_code}</strong> &middot; {monitoredCamera.zone?.zone_name || 'Unassigned zone'}</>
                : 'No camera selected from inventory - add one in Camera Inventory.'}
            </p>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {sourceMode === 'file' && !uploadedVideoUrl ? (
              <div className="od-stream-placeholder">
                Select a video file to run object detection on uploaded footage
              </div>
            ) : sourceMode === 'hardware' && !hardwareStreamUrl ? (
              <div className="od-stream-placeholder">
                SecurePi stream not configured - set an http:// stream URL on the selected camera in Camera Inventory, or VITE_SECUREPI_STREAM_URL in client/.env.local
              </div>
            ) : sourceMode === 'hardware' && streamError ? (
              <div className="od-stream-placeholder od-stream-placeholder-stack">
                <span>SecurePi stream offline - check Pi power, hotspot network, and port 8001</span>
                <button type="button" className="od-btn-primary" onClick={() => { setStreamError(false); setHardwareReloadKey((prev) => prev + 1); }}>
                  Reconnect SecurePi
                </button>
              </div>
            ) : browserCameraError ? (
              <div className="od-stream-placeholder">
                Browser camera blocked - allow camera permission and refresh this page
              </div>
            ) : streamError ? (
              <div className="od-stream-placeholder">
                Python AI service offline - start ai-service to enable stream
              </div>
            ) : (
              <div className={`od-video-stage ${sourceMode === 'hardware' ? 'od-video-stage-hardware' : ''}`}>
                {sourceMode === 'hardware' ? (
                  <img
                    key={hardwareReloadKey}
                    src={hardwareReloadKey > 0
                      ? `${hardwareStreamUrl}${hardwareStreamUrl.includes('?') ? '&' : '?'}t=${hardwareReloadKey}`
                      : hardwareStreamUrl}
                    className="od-stream-img od-stream-img-hardware"
                    alt="SecurePi live hardware camera"
                    onLoad={() => {
                      setCameraReady(true);
                      setCameraStatus('securepi_edge_live');
                      setStreamError(false);
                    }}
                    onError={() => {
                      setCameraReady(false);
                      setCameraStatus('securepi_edge_offline');
                      setStreamError(true);
                    }}
                  />
                ) : (
                  <video ref={videoRef} autoPlay playsInline muted className="od-stream-img" />
                )}
                {!cameraReady && (
                  <div className="od-camera-message">
                    {sourceMode === 'hardware' ? 'Connecting to SecurePi stream...' : 'Starting camera...'}
                  </div>
                )}
                {sourceMode !== 'hardware' && (
                <div className="od-detection-layer">
                  <div className="od-video-hud">
                    <span>{cameraStatus.replace(/_/g, ' ')}</span>
                    <span>{detections.length} detections</span>
                  </div>
                  {detections.map((detection, index) => {
                    const [x1, y1, x2, y2] = detection.box;
                    return (
                      <div
                        key={`${detection.label}-${index}`}
                        className={`od-detection-box ${detection.status}`}
                        style={{
                          left: `${(x1 / frameSize.width) * 100}%`,
                          top: `${(y1 / frameSize.height) * 100}%`,
                          width: `${((x2 - x1) / frameSize.width) * 100}%`,
                          height: `${((y2 - y1) / frameSize.height) * 100}%`,
                        }}
                      >
                        <span>{detection.label}</span>
                      </div>
                    );
                  })}
                </div>
                )}
                <div className="od-video-footer">
                  <span className={sourceMode === 'hardware' && cameraReady ? 'live' : detectionActive ? 'live' : 'standby'}>
                    {sourceMode === 'hardware' && cameraReady ? 'LIVE' : detectionActive ? 'LIVE' : 'STANDBY'}
                  </span>
                  <span>{sourceMode === 'hardware' ? 'SecurePi Edge Live | IMX500 annotated stream' : sourceMode === 'file' ? 'Uploaded Video' : `Browser Feed | ${detections.length} Objects`}</span>
                  <span>{sourceMode === 'hardware' ? 'MJPEG' : '1080p'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="od-right-column">
            <div className="od-incident-card">
              <div className="od-incident-title">
                <Icon name="alert" />
                <div>
                  <span className={displayedAlert ? 'critical' : 'clear'}>
                    {displayedAlert ? displayedAlert.status : 'CLEAR'}
                  </span>
                  <h2>{displayedAlert ? latestIncidentTitle : 'No Active Incident'}</h2>
                  <p>{displayedAlert ? 'Incident console - resolution workflow' : 'Live alerts will appear here when created'}</p>
                </div>
              </div>

              {displayedAlert ? (
                <>
                  <div className="od-incident-body">
                    <p>{displayedAlert.zone_name} - {displayedAlert.camera_location}</p>
                    <div className="od-incident-meta">
                      <span>Camera <strong>{displayedAlert.camera_location}</strong></span>
                      <span>Status <strong>{displayedAlert.status}</strong></span>
                      <span>Object <strong>{displayedAlert.object_class || 'Package-like object'}</strong></span>
                      <span>Source <strong>{alertSource(displayedAlert)}</strong></span>
                      <span>Severity <strong>{displayedAlert.severity || 'High'}</strong></span>
                      <span>Timestamp <strong>{alertTimestamp(displayedAlert)}</strong></span>
                      {displayedAlert.duration_seconds != null && (
                        <span>Duration <strong>{displayedAlert.duration_seconds}s</strong></span>
                      )}
                    </div>
                    {displayedAlert.snapshot_url && (
                      <a className="od-snapshot-link" href={displayedAlert.snapshot_url} target="_blank" rel="noreferrer">
                        View edge snapshot
                      </a>
                    )}
                  </div>

                  <div className="od-resolution-actions">
                    <button
                      type="button"
                      className="green"
                      onClick={() => handleAcknowledgeAlert(displayedAlert.id)}
                      disabled={alertActionBusy || displayedAlert.status !== 'Active'}
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      className="dispatch"
                      onClick={() => handleInvestigateAlert(displayedAlert.id)}
                      disabled={alertActionBusy || displayedAlert.status === 'Investigating'}
                    >
                      Mark Investigating
                    </button>
                    <button
                      type="button"
                      className="escalate"
                      onClick={() => handleEscalateAlert(displayedAlert.id)}
                      disabled={alertActionBusy || displayedAlert.status === 'Escalated'}
                    >
                      Escalate
                    </button>
                    <button
                      type="button"
                      className="resolve"
                      onClick={() => handleClearAlert(displayedAlert.id)}
                      disabled={alertActionBusy}
                    >
                      Mark Resolved / Cleared
                    </button>
                  </div>
                  {workflowMessage && <p className="od-workflow-note">{workflowMessage}</p>}
                </>
              ) : (
                <div className="od-incident-empty">
                  <Icon name="check" />
                  <p>No active detection alerts from the backend.</p>
                </div>
              )}
            </div>

            <div className="od-alert-summary-card">
              <div className="od-card-heading">
                <div>
                  <span><Icon name="alert" /> Active Alerts</span>
                  <h2>Latest Detection Alerts</h2>
                </div>
                <button
                  type="button"
                  className="od-clear-all-btn"
                  onClick={handleClearAllAlerts}
                  disabled={alertActionBusy || activeAlertCount === 0}
                >
                  Clear All
                </button>
              </div>
              <div className="od-live-alert-list">
                {alerts.filter((alert) => OPEN_ALERT_STATUSES.includes(alert.status)).map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    className={`od-live-alert-item ${displayedAlert?.id === alert.id ? 'active' : ''}`}
                    onClick={() => setSelectedAlertId(alert.id)}
                  >
                    <span>{alertTitle(alert)}</span>
                    <strong>{alert.status}</strong>
                    <small>{alert.zone_name} - {alert.camera_location}</small>
                    <small>{alertSource(alert)}{alert.severity ? ` - ${alert.severity}` : ''}</small>
                  </button>
                ))}
                {activeAlertCount === 0 && <p>No active alerts from Object Detection.</p>}
              </div>
              <div className="od-ops-actions">
                <Link className="od-btn-primary od-link-button" to="/detection-settings">Detection Setup</Link>
                <Link className="od-btn-cancel od-link-button" to="/camera-inventory">Camera Inventory</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ObjectDetection;
