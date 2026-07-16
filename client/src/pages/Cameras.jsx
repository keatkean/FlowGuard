import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import UiIcon from '../components/UiIcon';
import CameraFeed from './CameraFeed';
import '../css/Dashboard.css';
import '../css/Cameras.css';

const CAMERAS_URL = '/api/cameras';
const ALERTS_URL = '/api/detection-alerts';
const FALLBACK_VIDEO = '/videos/loading.mp4';
const statusClass = (status) => String(status || 'Online').toLowerCase();
const statusLabel = (status) => String(status || 'Online');
const formatLastActive = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
};
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
  const [cameraFeeds, setCameraFeeds] = useState([]);
  const [camerasLoading, setCamerasLoading] = useState(true);
  const [camerasOffline, setCamerasOffline] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
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
    `${cam.camera_code} ${cam.camera_name} ${cam.location} ${cam.status}`.toLowerCase().includes(query.toLowerCase())
  ));

  const metrics = useMemo(() => {
    const online = cameraFeeds.filter((cam) => cam.status === 'Online').length;
    const maintenance = cameraFeeds.filter((cam) => cam.status === 'Maintenance').length;
    const down = cameraFeeds.filter((cam) => ['Offline', 'Disabled'].includes(cam.status)).length;
    return { online, maintenance, down };
  }, [cameraFeeds]);

  const fetchCameras = () => {
    setCamerasLoading(true);
    axios.get(CAMERAS_URL, { headers })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCameraFeeds(list);
        setCamerasOffline(false);
        setSelectedId((prev) => (list.some((cam) => cam.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch(() => setCamerasOffline(true))
      .finally(() => setCamerasLoading(false));
  };

  const fetchAlerts = () => {
    axios.get(ALERTS_URL, { headers })
      .then((res) => {
        setAlerts(Array.isArray(res.data) ? res.data : []);
        setAlertsOffline(false);
      })
      .catch(() => setAlertsOffline(true));
  };

  useEffect(() => {
    fetchCameras();
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

  const clearAllAlerts = async () => {
    const openAlerts = alerts.filter((alert) => alert.status === 'Active');
    if (openAlerts.length === 0) return;
    try {
      const results = await Promise.all(
        openAlerts.map((alert) => axios.put(`${ALERTS_URL}/${alert.id}`, { status: 'Cleared' }, { headers }))
      );
      setAlerts((prev) => prev.map((alert) => {
        const updated = results.find((res) => res.data.id === alert.id);
        return updated ? updated.data : alert;
      }));
    } catch (err) {
      console.error('Clear all alerts error:', err);
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
            <label className="camera-search">
              <UiIcon name="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search cameras, zones, status..."
              />
            </label>
          </div>
          <div className="camera-header-actions">
            <Link className="camera-primary-btn" to="/camera-inventory">
              <UiIcon name="inventory" />
              Manage Inventory
            </Link>
          </div>
        </header>

        {camerasOffline && (
          <div className="camera-system-banner">
            Node.js server offline - run <strong>node index.js</strong> in /server (port 5001)
          </div>
        )}

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
            <span>Maintenance</span>
            <strong>{metrics.maintenance}</strong>
          </div>
          <div className="camera-metric-card critical">
            <UiIcon name="grid" className="camera-metric-svg" />
            <span>Offline / Disabled</span>
            <strong>{metrics.down}</strong>
          </div>
        </section>

        <section className="camera-console">
          <div className="camera-feed-column">
            <div className="camera-section-title">
              <div>
                <h2>Real-Time Camera Grid</h2>
                <p>{filteredCameras.length} feeds visible - {activeAlerts.length} active alerts</p>
              </div>
              <span><UiIcon name="grid" /> 1080p - H.264</span>
            </div>

            <div className="camera-grid">
              {camerasLoading && <p className="camera-loading-state">Loading cameras...</p>}
              {!camerasLoading && filteredCameras.length === 0 && !camerasOffline && (
                <p className="camera-empty">
                  No cameras in inventory yet. <Link to="/camera-inventory">Add one in Camera Inventory.</Link>
                </p>
              )}

              {filteredCameras.map((cam) => (
                <article
                  key={cam.id}
                  className={`camera-card camera-card-${statusClass(cam.status)}`}
                  onClick={() => setSelectedId(cam.id)}
                >
                  <CameraFeed cam={{ id: cam.camera_code, video: cam.stream_url || FALLBACK_VIDEO }} />

                  <div className="camera-info">
                    <div className="cam-title-row">
                      <div>
                        <h3>{cam.camera_code}</h3>
                        <p>{cam.location}</p>
                      </div>
                      <span className={`camera-status-pill ${statusClass(cam.status)}`}>{statusLabel(cam.status)}</span>
                    </div>
                    <div className="camera-card-footer">
                      <span>{cam.camera_type || 'Unspecified type'}</span>
                      <span>{cam.zone?.zone_name || 'Unassigned zone'}</span>
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
                <div className="camera-alert-heading-actions">
                  <span className={`camera-alert-count ${activeAlerts.length === 0 ? 'clear' : ''}`}>
                    {alertsOffline ? 'OFFLINE' : activeAlerts.length === 0 ? 'CLEAR' : `${activeAlerts.length} ACTIVE`}
                  </span>
                  <button
                    type="button"
                    className="camera-clear-all-btn"
                    onClick={clearAllAlerts}
                    disabled={activeAlerts.length === 0}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="camera-alert-list">
                {alerts.length === 0 && (
                  <p className="camera-empty">No detection alerts recorded.</p>
                )}

                {alerts.map((alert) => {
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
                  <h2>{selectedCamera?.camera_code || 'No Camera'}</h2>
                </div>
                {selectedCamera && (
                  <span className={`camera-status-pill ${statusClass(selectedCamera.status)}`}>
                    {statusLabel(selectedCamera.status)}
                  </span>
                )}
              </div>
              {selectedCamera ? (
                <>
                  <p className="camera-zone-name">{selectedCamera.location}</p>
                  <dl className="camera-telemetry">
                    <div><dt>Camera Name</dt><dd>{selectedCamera.camera_name}</dd></div>
                    <div><dt>Type</dt><dd>{selectedCamera.camera_type || 'Unspecified'}</dd></div>
                    <div><dt>Zone</dt><dd>{selectedCamera.zone?.zone_name || 'Unassigned'}</dd></div>
                    <div><dt>Last Active</dt><dd>{formatLastActive(selectedCamera.last_active_at)}</dd></div>
                    <div><dt>Notes</dt><dd>{selectedCamera.notes || 'None'}</dd></div>
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
