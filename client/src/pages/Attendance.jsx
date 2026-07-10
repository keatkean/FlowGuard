import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Management.css';
import '../css/Attendance.css';
import { API_BASE_URL } from '../constants/api';

const FILTERS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'custom', label: 'Custom Date' }
];

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not recorded';

const formatStatus = (status) => {
  if (status === 'ON_TIME') return 'On Time';
  if (status === 'LATE') return 'Late';
  return 'No Check-In';
};

const Attendance = () => {
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('today');
  const [customDate, setCustomDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }));

  const token = localStorage.getItem('accessToken');
  const userRole = localStorage.getItem('userRole') || 'Tenant';
  const isFM = attendance?.role === 'FM' || userRole === 'FM';
  const isTenant = attendance?.role === 'Tenant' || userRole === 'Tenant';
  const isStaff = attendance?.role === 'Staff' || userRole === 'Staff';

  const pageTitle = isFM ? 'Workforce Attendance Management'
    : isTenant ? 'Unit Staff Attendance'
    : 'My Attendance';
  const pageSubtitle = isFM ? 'Aggregate facility occupancy without individual lateness details'
    : isTenant ? 'Attendance summaries for your directly linked Staff'
    : 'View your own check-in status and attendance history';

  const fetchAttendanceData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { filter };
      if (filter === 'custom') params.date = customDate;
      const res = await axios.get(`${API_BASE_URL}/api/attendance/logs`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setAttendance(res.data);
    } catch (err) {
      console.error('Failed to load workforce attendance metrics:', err);
      setError(err.response?.data?.error || 'Unable to load attendance right now.');
      setAttendance(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
  }, [token, filter, customDate]);

  const cards = useMemo(() => {
    const summary = attendance?.summary || {};
    if (isFM) {
      return [
        ['People On Site', summary.peopleOnSite ?? 0, 'blue-status'],
        ['Checked In Today', summary.checkedInToday ?? 0, 'green-status'],
        ['Checked Out Today', summary.checkedOutToday ?? 0, 'orange-status']
      ];
    }
    if (isTenant) {
      return [
        ['Staff On Site', summary.staffOnSite ?? 0, 'blue-status'],
        ['On Time', summary.onTimeToday ?? 0, 'green-status'],
        ['Late Exceptions', summary.lateToday ?? 0, 'orange-status']
      ];
    }
    return [
      ['Current Status', summary.currentStatus === 'IN' ? 'On Site' : 'Off Site', 'blue-status'],
      ['First Check-In', summary.firstCheckIn ? formatDateTime(summary.firstCheckIn) : 'Not recorded', 'green-status'],
      ['Latest Check-Out', summary.latestCheckOut ? formatDateTime(summary.latestCheckOut) : 'Not recorded', 'orange-status']
    ];
  }, [attendance, isFM, isTenant]);

  const records = attendance?.records || [];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <header className="dashboard-header attendance-header">
          <div className="header-titles">
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>

          <div className="attendance-actions">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Attendance date filter">
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            {filter === 'custom' && (
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} aria-label="Custom attendance date" />
            )}
            <button onClick={fetchAttendanceData} className="launch-terminal-btn" style={{ background: '#334155' }}>Refresh</button>
            {userRole === 'FM' && (
              <button onClick={() => navigate('/gate-scanner')} className="launch-terminal-btn">Launch Gate Terminal</button>
            )}
          </div>
        </header>

        <div className="attendance-metrics-grid">
          {cards.map(([label, value, statusClass]) => (
            <div className={`attendance-metric-card ${statusClass}`} key={label}>
              <h3>{label}</h3>
              <p className="value-neutral">{value}</p>
            </div>
          ))}
        </div>

        {error && <div className="attendance-error" role="alert">{error}</div>}

        {isFM ? (
          <section className="attendance-aggregate-note">
            <h3>Aggregate Operational View</h3>
            <p>Facilities Managers receive occupancy totals only. Individual late-arrival performance and personal attendance history are excluded by the server.</p>
          </section>
        ) : (
          <div className="table-container">
            <table className="management-table">
              <thead>
                <tr>
                  {!isStaff && <th>EMPLOYEE NAME</th>}
                  <th>DATE</th>
                  <th>FIRST CHECK-IN</th>
                  <th>LATEST CHECK-OUT</th>
                  <th>CURRENT STATUS</th>
                  <th>PUNCTUALITY</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isStaff ? 5 : 6} className="table-notice-state">Loading attendance summaries...</td></tr>
                ) : records.length > 0 ? records.map((record) => (
                  <tr key={`${record.userId}-${record.date}`}>
                    {!isStaff && <td className="cell-worker-name">{record.user?.name || 'Unknown Staff'}</td>}
                    <td className="cell-timestamp">{record.date}</td>
                    <td>{formatDateTime(record.firstCheckIn)}</td>
                    <td>{formatDateTime(record.latestCheckOut)}</td>
                    <td><span className={`presence-tag ${record.currentStatus === 'IN' ? 'on-site' : 'off-site'}`}>{record.currentStatus === 'IN' ? 'ON SITE' : 'OFF SITE'}</span></td>
                    <td><span className={`status-badge ${record.punctuality === 'LATE' ? 'expired' : 'active'}`}>{formatStatus(record.punctuality)}</span></td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={isStaff ? 5 : 6} className="table-notice-state muted-text">
                      {isStaff ? 'No attendance records found for your account.' : 'No linked Staff attendance summaries for this date range.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default Attendance;