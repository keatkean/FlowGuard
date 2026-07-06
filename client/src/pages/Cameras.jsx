import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import UiIcon from '../components/UiIcon';
import CameraFeed from './CameraFeed';
import '../css/Dashboard.css';
import '../css/Cameras.css';

const ALERTS_URL = '/api/detection-alerts';
const statusClass = (status) => String(status || 'Live').toLowerCase();
const statusLabel = (status) => String(status || 'Live');
const formatAlertTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString('en-SG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export default function Cameras() {
  const [cameraFeeds] = useState([
    { id: 'CAM-01', zone: 'Zone A - Loading Bay', status: 'Live', video: '/videos/loading.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '4.2 Mbps', detections: 1, uptime: '23h 14m', lastEvent: 'Forklift lane clear' },
    { id: 'CAM-02', zone: 'Zone B - Warehouse Floor', status: 'Warning', video: '/videos/assembly.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '4.8 Mbps', detections: 2, uptime: '47h 22m', lastEvent: 'PPE violation detected' },
    { id: 'CAM-03', zone: 'Zone C - Restricted Storage', status: 'Critical', video: '/videos/chemical_storage.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '5.1 Mbps', detections: 1, uptime: '12h 06m', lastEvent: 'Unauthorized object detected' },
    { id: 'CAM-04', zone: 'Zone D - Exit Corridor', status: 'Critical', video: '/videos/command.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '4.6 Mbps', detections: 1, uptime: '31h 40m', lastEvent: 'Emergency exit blocked' },
    { id: 'CAM-05', zone: 'Zone E - Main Gate', status: 'Live', video: '/videos/entrance.mp4', model: 'YOLOv8-N', resolution: '720p', bitrate: '2.9 Mbps', detections: 0, uptime: '68h 11m', lastEvent: 'Access lane normal' },
    { id: 'CAM-06', zone: 'Zone F - Packaging', status: 'Live', video: '/videos/packaging.mp4', model: 'YOLOv8-N', resolution: '1080p', bitrate: '3.7 Mbps', detections: 0, uptime: '19h 03m', lastEvent: 'Operator viewport opened' },
  ]);
  const [selectedId, setSelectedId] = useState('CAM-02');
  const [query, setQuery] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [alertsOffline, setAlertsOffline] = useState(false);

  const token = localStorage.getItem('accessToken');
  const headers = { Authorization: `Bearer ${token}` };

  const selectedCamera = cameraFeeds.find((cam) => cam.id === selectedId) || cameraFeeds[0];
  const activeAlerts = alerts.filter((alert) => alert.status === 'Active');
  const activeWarningAlerts = activeAlerts.filter((alert) => (
    String(alert.object_class || '').toLowerCase().includes('warning')
  ));
  const activeCriticalAlerts = activeAlerts.filter((alert) => (
    String(alert.object_class || '').toLowerCase().includes('critical')
  ));
  const filteredCameras = cameraFeeds.filter((cam) => (
    `${cam.id} ${cam.zone} ${cam.status}`.toLowerCase().includes(query.toLowerCase())
  ));

  const metrics = useMemo(() => {
    const online = cameraFeeds.filter((cam) => cam.status !== 'Offline').length;
    const warnings = cameraFeeds.filter((cam) => cam.status === 'Warning').length;
    const critical = cameraFeeds.filter((cam) => cam.status === 'Critical').length;
    const detections = cameraFeeds.reduce((total, cam) => total + Number(cam.detections || 0), 0);
    return { online, warnings, critical, detections };
  }, [cameraFeeds]);

  const fetchAlerts = () => {
    axios.get(ALERTS_URL, { headers })
      .then((res) => {
        setAlerts(Array.isArray(res.data) ? res.data : []);
        setAlertsOffline(false);
      })
      .catch(() => setAlertsOffline(true));
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, []);

  const clearAlert = async (id) => {
    try {
      const res = await axios.put(`${ALERTS_URL}/${id}`, { status: 'Cleared' }, { headers });
      setAlerts((prev) => prev.map((alert) => (alert.id === id ? res.data : alert)));
    } catch (err) {
      console.error('Clear alert error:', err);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main cameras-main">
        <header className="dashboard-header cameras-header">
          <div className="header-titles">
            <h1>Camera Network</h1>
            <p>Live CCTV telemetry, AI inference status, and camera inventory control</p>
          </div>
          <div className="camera-header-actions">
            <label className="camera-search">
              <UiIcon name="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search cameras, zones, status..."
              />
            </label>
            <Link className="camera-primary-btn" to="/camera-inventory">
              <UiIcon name="inventory" />
              Manage Inventory
            </Link>
          </div>
        </header>

        <section className="camera-metrics" aria-label="Camera network metrics">
          <div className="camera-metric-card">
            <UiIcon name="smart" className="camera-metric-svg" />
            <span>AI Engine</span>
            <strong>Online</strong>
          </div>
          <div className="camera-metric-card">
            <UiIcon name="camera" className="camera-metric-svg" />
            <span>Feeds Online</span>
            <strong>{metrics.online}/{cameraFeeds.length}</strong>
          </div>
          <div className="camera-metric-card warning">
            <UiIcon name="warning" className="camera-metric-svg" />
            <span>Warnings</span>
            <strong>{activeWarningAlerts.length}</strong>
          </div>
          <div className="camera-metric-card critical">
            <UiIcon name="grid" className="camera-metric-svg" />
            <span>Critical</span>
            <strong>{activeCriticalAlerts.length}</strong>
          </div>
        </section>

        <section className="camera-console">
          <div className="camera-feed-column">
            <div className="camera-section-title">
              <div>
                <h2>Real-Time Camera Grid</h2>
                <p>{filteredCameras.length} feeds visible - {metrics.detections} active detections - 2x3 grid</p>
              </div>
              <span><UiIcon name="grid" /> 1080p - H.264</span>
            </div>

            <div className="camera-grid">
              {filteredCameras.map((cam) => (
                <article
                  key={cam.id}
                  className={`camera-card camera-card-${statusClass(cam.status)}`}
                  onClick={() => setSelectedId(cam.id)}
                >
                  <CameraFeed cam={cam} />

                  <div className="camera-info">
                    <div className="cam-title-row">
                      <div>
                        <h3>{cam.id}</h3>
                        <p>{cam.zone}</p>
                      </div>
                      <span className={`camera-status-pill ${statusClass(cam.status)}`}>{statusLabel(cam.status)}</span>
                    </div>
                    <div className="camera-card-footer">
                      <span>{cam.detections} {cam.detections === 1 ? 'detection' : 'detections'}</span>
                      <span>{cam.resolution}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="camera-side-panel">
            <div className="camera-alerts-card">
              <div className="camera-panel-heading">
                <div>
                  <span className="camera-kicker">Live Alerts</span>
                  <h2>Smart Detection Events</h2>
                </div>
                <span className={`camera-alert-count ${activeAlerts.length === 0 ? 'clear' : ''}`}>
                  {alertsOffline ? 'OFFLINE' : activeAlerts.length === 0 ? 'CLEAR' : `${activeAlerts.length} ACTIVE`}
                </span>
              </div>

              <div className="camera-alert-list">
                {alerts.length === 0 && (
                  <p className="camera-empty">No detection alerts recorded.</p>
                )}

                {alerts.slice(0, 6).map((alert) => {
                  const alertClass = String(alert.object_class || '').toLowerCase();
                  const severity = alertClass.includes('critical')
                    ? 'critical'
                    : alertClass.includes('warning')
                      ? 'warning'
                      : '';

                  return (
                  <div key={alert.id} className={`camera-alert-item ${severity} ${alert.status === 'Cleared' ? 'cleared' : ''}`}>
                    <div className="camera-alert-top">
                      <span>{alert.object_class || 'Unknown Object'}</span>
                      <strong>{alert.status}</strong>
                    </div>
                    <p>
                      {alert.zone_name} - {alert.camera_location}
                      {alert.duration_seconds != null && <> - {alert.duration_seconds}s</>}
                    </p>
                    <small>
                      {formatAlertTime(alert.createdAt)}
                    </small>
                    {alert.status === 'Active' && (
                      <button type="button" onClick={() => clearAlert(alert.id)}>
                        Mark cleared
                      </button>
                    )}
                  </div>
                );
                })}
              </div>
            </div>

            <div className="camera-panel-card">
              <div className="camera-panel-heading">
                <div>
                  <span className="camera-kicker">Selected Feed</span>
                  <h2>{selectedCamera?.id || 'No Camera'}</h2>
                </div>
                {selectedCamera && (
                  <span className={`camera-status-pill ${statusClass(selectedCamera.status)}`}>
                    {statusLabel(selectedCamera.status)}
                  </span>
                )}
              </div>
              {selectedCamera ? (
                <>
                  <p className="camera-zone-name">{selectedCamera.zone}</p>
                  <dl className="camera-telemetry">
                    <div><dt>AI Model</dt><dd>{selectedCamera.model}</dd></div>
                    <div><dt>Resolution</dt><dd>{selectedCamera.resolution}</dd></div>
                    <div><dt>Bitrate</dt><dd>{selectedCamera.bitrate}</dd></div>
                    <div><dt>Uptime</dt><dd>{selectedCamera.uptime}</dd></div>
                    <div><dt>Events</dt><dd>{selectedCamera.detections}</dd></div>
                    <div><dt>Last Event</dt><dd>{selectedCamera.lastEvent}</dd></div>
                  </dl>
                  <div className="camera-panel-actions">
                    <Link to="/camera-inventory">
                      <UiIcon name="inventory" />
                      Manage
                    </Link>
                    <Link to="/object-detection" className="danger">
                      <UiIcon name="memory" />
                      Detection
                    </Link>
                  </div>
                </>
              ) : (
                <p className="camera-empty">No cameras in inventory.</p>
              )}
            </div>
            <div className="camera-panel-card camera-ops-card">
              <div className="camera-panel-heading">
                <div>
                  <span className="camera-kicker">Shift Playbook</span>
                  <h2>Live Wall Priorities</h2>
                </div>
              </div>
              <ol>
                <li>Clear critical alerts first.</li>
                <li>Check the selected feed before dispatching a team.</li>
                <li>Move camera edits to inventory after the floor is stable.</li>
              </ol>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
