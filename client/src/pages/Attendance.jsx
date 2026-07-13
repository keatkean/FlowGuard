import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; 
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Management.css'; 
import '../css/Attendance.css'; 

const Attendance = () => {
  const navigate = useNavigate(); 
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ totalPresent: 0, onTime: 0, lateCount: 0 });
  
  const token = localStorage.getItem("accessToken");
  const userRole = localStorage.getItem("userRole") || 'Tenant';
  const userName = localStorage.getItem("userName") || 'User';

  // Role-aware copy so the page never implies workforce-wide access it doesn't grant.
  const isFM = userRole === 'FM';
  const isStaff = userRole === 'Staff';
  const pageTitle = isFM ? 'Workforce Attendance Management'
    : userRole === 'Tenant' ? 'Unit Staff Attendance'
    : 'My Attendance';
  const pageSubtitle = isFM ? 'Global facility occupancy and labor tracking logs'
    : userRole === 'Tenant' ? 'Attendance records for your registered unit staff'
    : 'View your own check-in and attendance records';

  const fetchAttendanceData = async () => {
    try {
      const res = await axios.get('/api/attendance/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setLogs(res.data);
        calculateMetrics(res.data);
      }
    } catch (err) {
      console.error("Failed to load workforce attendance metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
    const pollInterval = setInterval(fetchAttendanceData, 30000); // auto-refresh every 30s
    return () => clearInterval(pollInterval);
  }, [token]);

  const calculateMetrics = (attendanceData) => {
    const todayStr = new Date().toDateString();
    
    const logsToday = attendanceData.filter(log => 
      new Date(log.timestamp).toDateString() === todayStr
    );

    const userLatestStatus = {}; 

    logsToday.forEach(log => {
      const userId = log.User?.id;
      if (userId && !userLatestStatus.hasOwnProperty(userId)) {
        userLatestStatus[userId] = log.type; 
      }
    });

    const totalPresent = Object.values(userLatestStatus).filter(status => status === 'IN').length;

    let onTime = 0;
    let lateCount = 0;
    const processedUsers = new Set();

    [...logsToday].reverse().forEach(log => {
      const userId = log.User?.id;
      if (userId && log.type === 'IN' && !processedUsers.has(userId)) {
        processedUsers.add(userId);
        const checkInTime = new Date(log.timestamp);
        
        if (checkInTime.getHours() >= 9) {
          lateCount++;
        } else {
          onTime++;
        }
      }
    });

    setMetrics({ totalPresent, onTime, lateCount });
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        {/* 🎯 Class assigned here */}
        <header className="dashboard-header attendance-header">
          <div className="header-titles">
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          
          {/* 🎯 Class assigned here */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={fetchAttendanceData} className="launch-terminal-btn" style={{ background: '#334155' }}>
              Refresh
            </button>
            {/* Gate terminal is an FM/Staff operational tool — hide from Tenants who cannot open it */}
            {userRole === 'FM' && (
              <button onClick={() => navigate('/gate-scanner')} className="launch-terminal-btn">
                Launch Gate Terminal
              </button>
            )}
          </div>
        </header>

        {/* 🎯 Classes assigned to the metrics block items below */}
        <div className="attendance-metrics-grid">
          <div className="attendance-metric-card blue-status">
            <h3>{isFM ? 'Total Personnel On-Site' : isStaff ? 'My On-Site Status' : 'Active On-Site Staff'}</h3>
            <p className="value-neutral">{metrics.totalPresent}</p>
          </div>

          <div className="attendance-metric-card green-status">
            <h3>{isStaff ? 'My On-Time Arrivals' : 'On-Time Arrivals'}</h3>
            <p className="value-success">{metrics.onTime}</p>
          </div>

          <div className="attendance-metric-card orange-status">
            <h3>{isStaff ? 'My Late Exceptions' : 'Late Exceptions'}</h3>
            <p className="value-warning">{metrics.lateCount}</p>
          </div>
        </div>

        {/* 🗃️ Operational Log Table */}
        <div className="table-container">
          <table className="management-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>EMPLOYEE NAME</th>
                <th>ROLE STATUS</th>
                <th>TRANSACTION</th>
                <th>COMPLIANCE WINDOW</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="table-notice-state">
                    Parsing synchronized timecard logs...
                  </td>
                </tr>
              ) : logs.length > 0 ? logs.map((log) => {
                const logDate = new Date(log.timestamp);
                const isLate = log.type === 'IN' && logDate.getHours() >= 9;

                return (
                  <tr key={log.id}>
                    <td className="cell-timestamp">
                      {logDate.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'medium' })}
                    </td>
                    <td className="cell-worker-name">
                      {log.User?.name || 'Unknown User'}
                    </td>
                    <td>
                      <span className="cell-role-badge">
                        {log.User?.role === 'Tenant' ? 'Tenant Admin' : log.User?.role || 'Staff'}
                      </span>
                    </td>
                    <td>
                      <span className={`presence-tag ${log.type === 'IN' ? 'on-site' : 'off-site'}`}>
                        {log.type === 'IN' ? 'CLOCK-IN' : 'CLOCK-OUT'}
                      </span>
                    </td>
                    <td>
                      {log.type === 'OUT' ? (
                        <span className="cell-placeholder-dash">—</span>
                      ) : (
                        <span className={`status-badge ${isLate ? 'inactive' : 'active'}`}>
                          {isLate ? 'Late Arrival' : 'On Time'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="5" className="table-notice-state muted-text">
                    {isStaff
                      ? 'No attendance records found for your account.'
                      : 'No workforce check-in records discovered for this billing cycle.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default Attendance;