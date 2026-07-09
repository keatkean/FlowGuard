import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';

const ALERTS_URL = '/api/detection-alerts';
const URGENT_ALERT_STATUSES = ['Active', 'Acknowledged', 'Investigating', 'Escalated', 'Dispatched'];
const alertTitle = (alert) => {
  const source = alert.source || '';
  const descriptor = `${alert.alert_type || ''} ${alert.object_class || ''}`;
  if (/securepi/i.test(source) || /unattended/i.test(descriptor)) return 'Unattended pallet/object alert';
  return alert.object_class || alert.alert_type || 'Detection Alert';
};

const Dashboard = () => {
  const [user] = useState(() => ({
    name: localStorage.getItem('userName') || 'Guest',
    role: localStorage.getItem('userRole') || 'Tenant',
  }));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [detectionAlerts, setDetectionAlerts] = useState([]);
  const [alertsOffline, setAlertsOffline] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const isFM = user.role === 'FM';

  useEffect(() => {
    if (!isFM) return;
    const token = localStorage.getItem('accessToken');
    axios.get(ALERTS_URL, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setDetectionAlerts(Array.isArray(res.data) ? res.data : []);
        setAlertsOffline(false);
      })
      .catch(() => setAlertsOffline(true));
  }, [isFM]);

  const urgentDetectionAlerts = detectionAlerts
    .filter((alert) => URGENT_ALERT_STATUSES.includes(alert.status))
    .slice(0, 3);

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>{isFM ? 'Operations Dashboard' : 'Tenant Portal'}</h1>
            <p>Welcome back, <strong>{user.name}</strong></p>
          </div>
          <div className="header-time">
            <p className="time-text">
              {currentTime.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'medium' })}
            </p>
            <p className="timezone-text">Region: Singapore (JTC Factory)</p>
          </div>
        </header>

        <section className="top-summary-row">
          <div className="summary-card">
            <div className="icon-wrapper blue-icon">CAM</div>
            <div className="summary-info">
              <h2>{isFM ? '128' : '4'}</h2>
              <p>{isFM ? 'Total Factory Cameras' : 'Your Unit Cameras'}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="icon-wrapper purple-icon">LOG</div>
            <div className="summary-info">
              <h2>{isFM ? '8,954' : '12'}</h2>
              <p>{isFM ? 'Global V-Patrol Logs' : 'Unit Safety Scans'}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="icon-wrapper red-icon">FM</div>
            <div className="summary-info">
              <h2>{isFM ? urgentDetectionAlerts.length : '2'}</h2>
              <p>{isFM ? 'Urgent Detection Alerts' : 'Active Unit Reports'}</p>
            </div>
          </div>
        </section>

        {isFM ? (
          <section className="dashboard-alert-section">
            <div className="dashboard-section-heading">
              <div>
                <h3>Urgent Object Detection</h3>
                <p>Top operational items for the Facilities Manager today.</p>
              </div>
              <Link to="/object-detection">Open live console</Link>
            </div>
            {alertsOffline && <p className="dashboard-alert-offline">Detection alerts are unavailable while the Node.js server is offline.</p>}
            <div className="dashboard-alert-grid">
              {urgentDetectionAlerts.map((alert) => (
                <Link className="dashboard-alert-card" key={alert.id} to="/object-detection">
                  <span>{alert.status}</span>
                  <h2>{alertTitle(alert)}</h2>
                  <p>{alert.zone_name} - {alert.camera_location}</p>
                  <small>Source: {alert.source || 'Object Detection'}</small>
                </Link>
              ))}
              {!alertsOffline && urgentDetectionAlerts.length === 0 && (
                <div className="dashboard-alert-empty">
                  <h2>No urgent detection alerts</h2>
                  <p>Unauthorized access, unattended pallet, and loading bay queue alerts will appear here when active.</p>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="recent-activity-section">
            <h3>Recent Activity</h3>
            <div className="activity-cards-grid">
              <div className="activity-card">
                <span className="act-icon text-blue">CAM</span>
                <h2 className="text-blue">24</h2>
                <p>Today's V-Patrol</p>
              </div>

              <div className="activity-card">
                <span className="act-icon" style={{ color: '#c084fc' }}>OK</span>
                <h2 style={{ color: '#c084fc' }}>24</h2>
                <p>Analysis Done</p>
              </div>

              <div className="activity-card">
                <span className="act-icon text-green">PASS</span>
                <h2 className="text-green">24</h2>
                <p>NO Defect Zones</p>
              </div>

              <div className="activity-card">
                <span className="act-icon text-red">WARN</span>
                <h2 className="text-red">0</h2>
                <p>DEFECT Zones</p>
              </div>
            </div>
          </section>
        )}

        <section className="charts-section">
          <div className="chart-card">
            <h3>V-Patrol Activity (Last 7 Days)</h3>
            <div className="mock-bar-chart">
              <div className="bar-wrapper"><div className="bar" style={{ height: '80%' }}></div><span>Sat</span></div>
              <div className="bar-wrapper"><div className="bar" style={{ height: '90%' }}></div><span>Sun</span></div>
              <div className="bar-wrapper"><div className="bar" style={{ height: '75%' }}></div><span>Mon</span></div>
              <div className="bar-wrapper"><div className="bar" style={{ height: '85%' }}></div><span>Tue</span></div>
              <div className="bar-wrapper"><div className="bar" style={{ height: '70%' }}></div><span>Wed</span></div>
              <div className="bar-wrapper"><div className="bar" style={{ height: '95%' }}></div><span>Thu</span></div>
              <div className="bar-wrapper"><div className="bar" style={{ height: '60%' }}></div><span>Fri</span></div>
            </div>
          </div>

          <div className="chart-card">
            <h3>Analysis Status Trend (Last 7 Days)</h3>
            <div className="mock-line-chart">
              <p>[ Line Chart Visualization Canvas ]</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
