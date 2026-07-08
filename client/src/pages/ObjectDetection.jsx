import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/ObjectDetection.css';

const ZONES_URL = '/api/zones';
const CAMERAS_URL = '/api/cameras';
const ALERTS_URL = '/api/detection-alerts';
const PEOPLE_URL = '/ai/api/yolo/people-count';
const ANALYZE_FRAME_URL = '/ai/api/yolo/analyze-frame';
const OPEN_ALERT_STATUSES = ['Active', 'Acknowledged', 'Dispatched'];
const RESPONDERS_STORAGE_KEY = 'flowguard-response-teams';

const Icon = ({ name }) => <span className={`od-icon od-icon-${name}`} aria-hidden="true" />;

const ObjectDetection = () => {
  const [zones, setZones] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [detectionActive, setDetectionActive] = useState(false);

  const [responders] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RESPONDERS_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {
      // Ignore invalid local storage and fall back to defaults.
    }
    return [
      { id: 1, name: 'Security Team Alpha', team: 'Security', contact: 'ext. 201' },
      { id: 2, name: 'Floor Supervisor', team: 'Operations', contact: 'ext. 118' },
    ];
  });
  const [alertAssignments, setAlertAssignments] = useState({});
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [alertActionBusy, setAlertActionBusy] = useState(false);

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

    if (sourceMode === 'file') {
      startUploadedVideo();
    } else {
      startBrowserCamera();
    }

    return () => {
      clearInterval(frameInterval);
      stopBrowserCamera();
    };
  }, [sourceMode, uploadedVideoUrl]);

  useEffect(() => () => {
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
  }, [uploadedVideoUrl]);

  useEffect(() => {
    localStorage.setItem(RESPONDERS_STORAGE_KEY, JSON.stringify(responders));
  }, [responders]);

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

  const handleDispatchAlert = (id) => {
    if (!alertAssignments[id]) {
      setWorkflowMessage('Select a responder before dispatching.');
      return;
    }
    handleUpdateAlertStatus(id, 'Dispatched');
  };

  const handleClearAlert = (id) => {
    handleUpdateAlertStatus(id, 'Cleared');
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

  const assignResponder = (alertId, responderId) => {
    setAlertAssignments((prev) => ({ ...prev, [alertId]: responderId }));
    setWorkflowMessage(responderId ? 'Responder assigned to this alert.' : 'Responder assignment removed.');
  };

  const activeAlertCount = alerts.filter(a => OPEN_ALERT_STATUSES.includes(a.status)).length;
  const clearedAlertCount = alerts.filter(a => a.status === 'Cleared').length;
  const latestOpenAlert = useMemo(() => (
    alerts.find(alert => OPEN_ALERT_STATUSES.includes(alert.status)) || null
  ), [alerts]);
  const latestIncidentTitle = useMemo(() => {
    if (!latestOpenAlert) return '';
    const rawTitle = String(latestOpenAlert.object_class || 'Unknown Object')
      .replace(/^(Critical|Warning):\s*/i, '');
    return /detect/i.test(rawTitle) ? rawTitle : `${rawTitle} Detected`;
  }, [latestOpenAlert]);
  const selectedResponderId = latestOpenAlert ? alertAssignments[latestOpenAlert.id] || '' : '';
  const selectedResponder = responders.find((responder) => String(responder.id) === String(selectedResponderId));
  const monitoredCamera = cameras.find((cam) => String(cam.id) === String(selectedCameraId));

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
            <small>CRUD managed watch zones</small>
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
                <p>{sourceMode === 'file' ? uploadedVideoName || 'Uploaded video file' : 'Browser camera'} - YOLO frame analysis</p>
              </div>
              <div className="od-stream-badges">
                <span className={detectionActive ? 'active' : 'standby'}>
                  {detectionActive ? 'YOLO ACTIVE' : 'YOLO STANDBY'}
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
            ) : browserCameraError ? (
              <div className="od-stream-placeholder">
                Browser camera blocked - allow camera permission and refresh this page
              </div>
            ) : streamError ? (
              <div className="od-stream-placeholder">
                Python AI service offline - start ai-service to enable stream
              </div>
            ) : (
              <div className="od-video-stage">
                <video ref={videoRef} autoPlay playsInline muted className="od-stream-img" />
                {!cameraReady && (
                  <div className="od-camera-message">
                    Starting camera...
                  </div>
                )}
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
                <div className="od-video-footer">
                  <span className={detectionActive ? 'live' : 'standby'}>{detectionActive ? 'LIVE' : 'STANDBY'}</span>
                  <span>{sourceMode === 'file' ? 'Uploaded Video' : 'Browser Feed'} | {detections.length} Objects</span>
                  <span>1080p</span>
                </div>
              </div>
            )}
          </div>

          <div className="od-right-column">
            <div className="od-incident-card">
              <div className="od-incident-title">
                <Icon name="alert" />
                <div>
                  <span className={latestOpenAlert ? 'critical' : 'clear'}>
                    {latestOpenAlert ? latestOpenAlert.status : 'CLEAR'}
                  </span>
                  <h2>{latestOpenAlert ? latestIncidentTitle : 'No Active Incident'}</h2>
                  <p>{latestOpenAlert ? 'Incident console - resolution workflow' : 'Live alerts will appear here when created'}</p>
                </div>
              </div>

              {latestOpenAlert ? (
                <>
                  <div className="od-incident-body">
                    <p>{latestOpenAlert.zone_name} - {latestOpenAlert.camera_location}</p>
                    <div className="od-incident-meta">
                      <span>Camera <strong>{latestOpenAlert.camera_location}</strong></span>
                      <span>Status <strong>{latestOpenAlert.status}</strong></span>
                      <span>Object <strong>{latestOpenAlert.object_class || 'Unknown Object'}</strong></span>
                      <span>Responder <strong>{selectedResponder ? selectedResponder.name : 'Unassigned'}</strong></span>
                      {latestOpenAlert.duration_seconds != null && (
                        <span>Duration <strong>{latestOpenAlert.duration_seconds}s</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="od-resolution-actions">
                    <select
                      className="od-responder-select"
                      value={selectedResponderId}
                      onChange={(event) => assignResponder(latestOpenAlert.id, event.target.value)}
                    >
                      <option value="">Assign responder...</option>
                      {responders.map((responder) => (
                        <option key={responder.id} value={responder.id}>
                          {responder.name} - {responder.team}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="green"
                      onClick={() => handleAcknowledgeAlert(latestOpenAlert.id)}
                      disabled={alertActionBusy || latestOpenAlert.status !== 'Active'}
                    >
                      Acknowledge
                    </button>
                  </div>

                  <div className="od-dispatch-actions">
                    <button
                      type="button"
                      className="dispatch"
                      onClick={() => handleDispatchAlert(latestOpenAlert.id)}
                      disabled={alertActionBusy || !selectedResponderId || latestOpenAlert.status === 'Dispatched'}
                    >
                      Dispatch Team
                    </button>
                    <button
                      type="button"
                      className="resolve"
                      onClick={() => handleClearAlert(latestOpenAlert.id)}
                      disabled={alertActionBusy}
                    >
                      Mark Cleared
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

            <div className="od-card od-ops-card">
              <div className="od-card-heading">
                <div>
                  <span>Console Focus</span>
                  <h2>Setup Moved Off the Live Screen</h2>
                </div>
              </div>
              <p>
                Zone thresholds and response-team records now live on a dedicated setup page, so this console stays focused on the current incident.
              </p>
              <p className="od-limitation-note">
                Stock-YOLO limitation: the AI engine analyzes one active source at a time (the browser camera or an uploaded file above) and does not yet switch physical camera streams per inventory selection. The camera picker labels which inventory record the current feed represents; a future custom-trained, multi-stream pipeline would be needed to route each camera's own live stream into detection.
              </p>
              <div className="od-ops-actions">
                <Link className="od-btn-primary od-link-button" to="/detection-settings">Open Detection Setup</Link>
                <Link className="od-btn-cancel od-link-button" to="/cameras">View Camera Wall</Link>
              </div>
            </div>

            <div className="od-alert-summary-card">
              <div className="od-card-heading">
                <div>
                  <span><Icon name="alert" /> Alert Handoff</span>
                  <h2>Camera Page Handles Live Alerts</h2>
                </div>
              </div>
              <p>
                {activeAlertCount === 0
                  ? 'No active alerts. Live alert review now lives on the Cameras page.'
                  : `${activeAlertCount} open alert${activeAlertCount === 1 ? '' : 's'} ready for review on the Cameras page.`}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ObjectDetection;
