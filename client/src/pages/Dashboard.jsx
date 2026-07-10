import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import { API_BASE_URL } from '../constants/api';

const displayMetric = (value) => (value === null || value === undefined ? 'Unavailable' : value);
const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not scheduled';
const formatPunctuality = (value) => {
  if (value === 'ON_TIME') return 'On Time';
  if (value === 'LATE') return 'Late';
  return 'No Check-In';
};

const SummaryCard = ({ to, tone = 'blue-icon', label, value }) => {
  const body = (
    <>
      <div className={`icon-wrapper ${tone}`}>{label.slice(0, 3).toUpperCase()}</div>
      <div className="summary-info">
        <h2>{displayMetric(value)}</h2>
        <p>{label}</p>
      </div>
    </>
  );
  return to ? <Link className="summary-card dashboard-link-card" to={to}>{body}</Link> : <div className="summary-card">{body}</div>;
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
  const title = role === 'FM' ? 'Operations Dashboard' : role === 'Tenant' ? 'Tenant Dashboard' : 'Staff Dashboard';

  const content = useMemo(() => {
    if (!dashboard) return null;
    const summary = dashboard.summary || {};

    if (dashboard.role === 'FM') {
      return (
        <>
          <section className="top-summary-row dashboard-summary-grid">
            <SummaryCard to="/cameras" label="Total Cameras" value={summary.cameras?.total} />
            <SummaryCard to="/cameras" tone="green-icon" label="Cameras Online" value={summary.cameras?.online} />
            <SummaryCard to="/cameras" tone="red-icon" label="Cameras Offline" value={summary.cameras?.offline} />
            <SummaryCard to="/attendance" label="People On Site" value={summary.attendance?.peopleCurrentlyOnSite} />
            <SummaryCard to="/object-detection" tone="red-icon" label="Urgent Alerts" value={summary.urgentDetectionAlerts} />
            <SummaryCard to="/logistics" tone="purple-icon" label="Today's Bookings" value={summary.todaysLoadingBayBookings} />
            <SummaryCard to="/logistics" label="Active Vehicles" value={summary.activeOrArrivedVehicles} />
            <SummaryCard to="/incidents" tone="red-icon" label="Open Incidents" value={summary.openIncidents} />
            <SummaryCard to="/support-dashboard" tone="purple-icon" label="Open Tickets" value={summary.openSupportTickets} />
          </section>

          <section className="dashboard-alert-section">
            <div className="dashboard-section-heading">
              <div>
                <h3>Recent High-Priority Operational Alerts</h3>
                <p>Safe alert metadata only. Individual lateness is not included.</p>
              </div>
              <Link to="/object-detection">Open live console</Link>
            </div>
            <div className="dashboard-alert-grid">
              {(dashboard.recentHighPriorityAlerts || []).map((alert) => (
                <Link className="dashboard-alert-card" key={alert.id} to="/object-detection">
                  <span>{alert.severity || alert.status}</span>
                  <h2>{alert.object_class || alert.alert_type || 'Detection Alert'}</h2>
                  <p>{alert.zone_name} - {alert.camera_location}</p>
                  <small>{formatDateTime(alert.occurred_at || alert.createdAt)}</small>
                </Link>
              ))}
              {(dashboard.recentHighPriorityAlerts || []).length === 0 && (
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
            <SummaryCard to="/staff" label="Own Staff Total" value={summary.staffTotal} />
            <SummaryCard to="/attendance" tone="green-icon" label="Staff On Site" value={summary.staffCurrentlyOnSite} />
            <SummaryCard to="/attendance" tone="red-icon" label="Own Staff Late Today" value={summary.staffLateToday} />
            <SummaryCard to="/logistics" tone="purple-icon" label="Today's Own Bookings" value={summary.todaysOwnBookings} />
            <SummaryCard to="/support-dashboard" label="Own Open Support Cases" value={summary.ownOpenSupportCases} />
          </section>

          <section className="dashboard-detail-grid">
            <div className="chart-card">
              <h3>Next Booking</h3>
              {dashboard.nextBooking ? (
                <p>{dashboard.nextBooking.booking_ref} at {dashboard.nextBooking.loading_bay} - {formatDateTime(dashboard.nextBooking.slot_start)}</p>
              ) : <p className="dashboard-muted">No upcoming own booking.</p>}
            </div>
            <div className="chart-card">
              <h3>Recent Own-Unit Activity</h3>
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
          <SummaryCard to="/attendance" label="Current Status" value={summary.currentClockStatus === 'IN' ? 'On Site' : 'Off Site'} />
          <SummaryCard to="/attendance" tone="green-icon" label="First Clock-In" value={summary.todayFirstClockIn ? formatDateTime(summary.todayFirstClockIn) : 'Not recorded'} />
          <SummaryCard to="/attendance" tone="purple-icon" label="Latest Clock-Out" value={summary.todayLatestClockOut ? formatDateTime(summary.todayLatestClockOut) : 'Not recorded'} />
          <SummaryCard to="/attendance" tone="red-icon" label="Punctuality" value={formatPunctuality(summary.punctuality)} />
          <SummaryCard to="/settings" label="Face ID" value={summary.faceIdEnrolled ? 'Enrolled' : 'Not Enrolled'} />
        </section>

        <section className="dashboard-detail-grid">
          <div className="chart-card">
            <h3>Next Relevant Booking</h3>
            {dashboard.nextRelevantBooking ? <p>{dashboard.nextRelevantBooking.booking_ref}</p> : <p className="dashboard-muted">{dashboard.unavailable?.nextRelevantBooking || 'No relevant booking.'}</p>}
          </div>
          <div className="chart-card">
            <h3>Quick Links</h3>
            <div className="dashboard-quick-links">
              {(dashboard.quickLinks || []).map((link) => <Link key={link.to} to={link.to}>{link.label}</Link>)}
            </div>
          </div>
        </section>
      </>
    );
  }, [dashboard]);

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
        {error && <div className="dashboard-error" role="alert">{error}</div>}
        {!loading && !error && content}
      </main>
    </div>
  );
};

export default Dashboard;