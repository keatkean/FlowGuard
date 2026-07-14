import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import GroupsIcon from '@mui/icons-material/Groups';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventIcon from '@mui/icons-material/Event';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import BadgeIcon from '@mui/icons-material/Badge';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HistoryIcon from '@mui/icons-material/History';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import FaceIcon from '@mui/icons-material/Face';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import SettingsIcon from '@mui/icons-material/Settings';
import Sidebar from '../components/Sidebar';
import SafeMuiIcon from '../components/SafeMuiIcon';
import '../css/Dashboard.css';
import { API_BASE_URL } from '../constants/api';

const displayMetric = (value) => (value === null || value === undefined || value === '' ? 'Unavailable' : value);
const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not scheduled';
const formatPunctuality = (value) => {
  if (value === 'ON_TIME') return 'On Time';
  if (value === 'LATE') return 'Late';
  return 'No Check-In';
};

// Real icon component reference (icon={VideocamIcon}), never a derived
// three-letter pseudo-icon and never JSX (icon={<VideocamIcon />}). The
// visible label carries the meaning, so the icon itself stays aria-hidden.
const SummaryCard = ({ icon, label, value, helper, to, tone = 'blue-icon' }) => {
  const displayValue = displayMetric(value);

  const content = (
    <>
      <div className={`icon-wrapper ${tone}`} aria-hidden="true">
        <SafeMuiIcon icon={icon} fontSize="small" />
      </div>
      <div className="summary-info">
        <h2>{displayValue}</h2>
        <p>{label}</p>
        {helper ? <small className="summary-helper">{helper}</small> : null}
      </div>
    </>
  );

  return to ? (
    <Link className="summary-card dashboard-link-card" to={to}>
      {content}
    </Link>
  ) : (
    <div className="summary-card">{content}</div>
  );
};

// Staff quick links come from the API as {label, to}; icons render by route.
const QUICK_LINK_ICONS = {
  '/attendance': FactCheckIcon,
  '/logistics': LocalShippingIcon,
  '/settings': SettingsIcon,
};

const ALERTS_URL = '/api/detection-alerts';

const URGENT_ALERT_STATUSES = [
  'Active',
  'Acknowledged',
  'Investigating',
  'Escalated',
  'Dispatched',
];

// Distinguishes why the detection-alert fetch failed so the banner never blames
// an "offline server" for auth or backend errors.
const alertsErrorMessage = (err) => {
  const status = err?.response?.status;
  if (status === 401) return 'Detection alerts are unavailable: your session has expired. Please log in again.';
  if (status === 403) return 'Detection alerts are unavailable: your account does not have permission to view them.';
  if (status >= 500) return 'Detection alerts are unavailable: the server reported an internal error.';
  if (status) return `Detection alerts are unavailable (HTTP ${status}).`;
  return 'Detection alerts are unavailable: the server could not be reached.';
};

const alertTitle = (alert) => {
  const descriptor = `${alert.alert_type || ''} ${alert.object_class || ''}`;

  if (/crowd/i.test(alert.alert_type || '')) {
    return 'Crowd density alert';
  }

  if (/unattended/i.test(descriptor)) {
    return 'Unattended pallet/object alert';
  }

  return alert.object_class || alert.alert_type || 'Detection Alert';
};

const Dashboard = () => {
  const [user] = useState(() => ({
    name: localStorage.getItem('userName') || 'Guest',
    role: localStorage.getItem('userRole') || 'Tenant'
  }));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detectionAlerts, setDetectionAlerts] = useState([]);
  const [alertsError, setAlertsError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      const res = await axios.get(`${API_BASE_URL}/api/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboard(res.data);
    } catch (err) {
      console.error('Dashboard summary failed:', err);
      setError(err.response?.data?.error || 'Unable to load dashboard summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSummary(); }, []);

  const role = dashboard?.role || user.role;
  const isFM = role === 'FM';

  useEffect(() => {
    if (!isFM) return;
    const token = localStorage.getItem('accessToken');
    axios.get(`${API_BASE_URL}${ALERTS_URL}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setDetectionAlerts(Array.isArray(res.data) ? res.data : []);
        setAlertsError('');
      })
      .catch((err) => setAlertsError(alertsErrorMessage(err)));
  }, [isFM]);

  const urgentDetectionAlerts = detectionAlerts
    .filter((alert) => URGENT_ALERT_STATUSES.includes(alert.status))
    .slice(0, 3);
  const title = role === 'FM' ? 'Operations Dashboard' : role === 'Tenant' ? 'Tenant Dashboard' : 'Staff Dashboard';

  const content = useMemo(() => {
    if (!dashboard) return null;
    const summary = dashboard.summary || {};

    if (dashboard.role === 'FM') {
      const alertsToShow = urgentDetectionAlerts.length > 0
        ? urgentDetectionAlerts
        : (dashboard.recentHighPriorityAlerts || []);

      return (
        <>
          <section className="top-summary-row dashboard-summary-grid">
            <SummaryCard to="/cameras" icon={VideocamIcon} label="Total Cameras" value={summary.cameras?.total} />
            <SummaryCard to="/cameras" tone="green-icon" icon={CheckCircleIcon} label="Cameras Online" value={summary.cameras?.online} />
            <SummaryCard to="/cameras" tone="red-icon" icon={VideocamOffIcon} label="Cameras Offline" value={summary.cameras?.offline} />
            <SummaryCard to="/attendance" icon={GroupsIcon} label="People On Site" value={summary.attendance?.peopleCurrentlyOnSite} />
            <SummaryCard to="/object-detection" tone="red-icon" icon={WarningAmberIcon} label="Urgent Alerts" value={summary.urgentDetectionAlerts} />
            <SummaryCard to="/logistics" tone="purple-icon" icon={EventIcon} label="Today's Bookings" value={summary.todaysLoadingBayBookings} />
            <SummaryCard to="/logistics" icon={LocalShippingIcon} label="Active Vehicles" value={summary.activeOrArrivedVehicles} />
            <SummaryCard to="/incidents" tone="red-icon" icon={ReportProblemIcon} label="Open Incidents" value={summary.openIncidents} />
            <SummaryCard to="/support-dashboard" tone="purple-icon" icon={SupportAgentIcon} label="Open Tickets" value={summary.openSupportTickets} />
          </section>

          <section className="dashboard-alert-section">
            <div className="dashboard-section-heading">
              <div>
                <h3>Recent High-Priority Operational Alerts</h3>
                <p>Safe alert metadata only. Individual lateness is not included.</p>
              </div>
              <Link to="/object-detection">Open live console</Link>
            </div>
            {alertsError && <p className="dashboard-alert-offline">{alertsError}</p>}
            <div className="dashboard-alert-grid">
              {alertsToShow.map((alert) => (
                <Link className="dashboard-alert-card" key={alert.id} to="/object-detection">
                  <span>{alert.severity || alert.status}</span>
                  <h2>{alertTitle(alert)}</h2>
                  <p>{alert.zone_name} - {alert.camera_location}</p>
                  <small>{formatDateTime(alert.occurred_at || alert.createdAt)}</small>
                </Link>
              ))}
              {alertsToShow.length === 0 && (
                <div className="dashboard-alert-empty"><h2>No high-priority alerts</h2><p>Urgent operational alerts will appear here when active.</p></div>
              )}
            </div>
          </section>
        </>
      );
    }

    if (dashboard.role === 'Tenant') {
      return (
        <>
          <section className="top-summary-row dashboard-summary-grid">
            <SummaryCard to="/staff" icon={GroupsIcon} label="Own Staff Total" value={summary.staffTotal} />
            <SummaryCard to="/attendance" tone="green-icon" icon={BadgeIcon} label="Staff On Site" value={summary.staffCurrentlyOnSite} />
            <SummaryCard to="/attendance" tone="red-icon" icon={ScheduleIcon} label="Own Staff Late Today" value={summary.staffLateToday} />
            <SummaryCard to="/logistics" tone="purple-icon" icon={EventIcon} label="Today's Own Bookings" value={summary.todaysOwnBookings} />
            <SummaryCard to="/support-dashboard" icon={SupportAgentIcon} label="Own Open Support Cases" value={summary.ownOpenSupportCases} />
          </section>

          <section className="dashboard-detail-grid">
            <div className="chart-card">
              <h3><SafeMuiIcon icon={EventAvailableIcon} fontSize="small" aria-hidden="true" /> Next Booking</h3>
              {dashboard.nextBooking ? (
                <p>{dashboard.nextBooking.booking_ref} at {dashboard.nextBooking.loading_bay} - {formatDateTime(dashboard.nextBooking.slot_start)}</p>
              ) : <p className="dashboard-muted">No upcoming own booking.</p>}
            </div>
            <div className="chart-card">
              <h3><SafeMuiIcon icon={HistoryIcon} fontSize="small" aria-hidden="true" /> Recent Own-Unit Activity</h3>
              {(dashboard.recentActivity || []).length > 0 ? dashboard.recentActivity.map((item) => (
                <p key={item.id || item.booking_ref}>{item.booking_ref} - {item.status}</p>
              )) : <p className="dashboard-muted">No recent own-unit activity.</p>}
            </div>
          </section>
        </>
      );
    }

    return (
      <>
        <section className="top-summary-row dashboard-summary-grid">
          <SummaryCard to="/attendance" icon={LocationOnIcon} label="Current Status" value={summary.currentClockStatus === 'IN' ? 'On Site' : 'Off Site'} />
          <SummaryCard to="/attendance" tone="green-icon" icon={LoginIcon} label="First Clock-In" value={summary.todayFirstClockIn ? formatDateTime(summary.todayFirstClockIn) : 'Not recorded'} />
          <SummaryCard to="/attendance" tone="purple-icon" icon={LogoutIcon} label="Latest Clock-Out" value={summary.todayLatestClockOut ? formatDateTime(summary.todayLatestClockOut) : 'Not recorded'} />
          <SummaryCard to="/attendance" tone="red-icon" icon={ScheduleIcon} label="Punctuality" value={formatPunctuality(summary.punctuality)} />
          <SummaryCard to="/settings" icon={FaceIcon} label="Face ID" value={summary.faceIdEnrolled ? 'Enrolled' : 'Not Enrolled'} />
        </section>

        <section className="dashboard-detail-grid">
          <div className="chart-card">
            <h3><SafeMuiIcon icon={EventAvailableIcon} fontSize="small" aria-hidden="true" /> Next Relevant Booking</h3>
            {dashboard.nextRelevantBooking ? <p>{dashboard.nextRelevantBooking.booking_ref}</p> : <p className="dashboard-muted">{dashboard.unavailable?.nextRelevantBooking || 'No relevant booking.'}</p>}
          </div>
          <div className="chart-card">
            <h3>Quick Links</h3>
            <div className="dashboard-quick-links">
              {(dashboard.quickLinks || []).map((link) => (
                <Link key={link.to} to={link.to}>
                  <SafeMuiIcon icon={QUICK_LINK_ICONS[link.to]} fontSize="small" aria-hidden="true" /> {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }, [dashboard, urgentDetectionAlerts, alertsError]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>{title}</h1>
            <p>Welcome back, <strong>{user.name}</strong></p>
          </div>
          <div className="header-time">
            <p className="time-text">{currentTime.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'medium' })}</p>
            <p className="timezone-text">Region: Singapore (JTC Factory)</p>
          </div>
        </header>

        {loading && <div className="dashboard-loading">Loading dashboard summary...</div>}
        {error && (
          <div className="dashboard-error" role="alert">
            <span>{error}</span>
            <button type="button" className="dashboard-retry-btn" onClick={fetchSummary}>Retry</button>
          </div>
        )}
        {!loading && !error && content}
      </main>
    </div>
  );
};

export default Dashboard;