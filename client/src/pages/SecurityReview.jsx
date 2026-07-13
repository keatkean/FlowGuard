import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Management.css';

const REVIEW_STATUSES = ['Pending Review', 'False Positive', 'Escalated', 'Resolved'];

// FM-only manual review queue for suspicious / critical access logs produced
// automatically by the V-Patrol facial-recognition engine.
const SecurityReview = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Pending Review');
  const [drafts, setDrafts] = useState({}); // { [logId]: { reviewStatus, reviewNotes } }
  const [savingId, setSavingId] = useState(null);
  const [notification, setNotification] = useState('');

  const token = localStorage.getItem('accessToken');

  const fetchLogs = async (statusFilter) => {
    setLoading(true);
    try {
      const query = statusFilter === 'All' ? '?limit=100' : `?status=${encodeURIComponent(statusFilter)}&limit=100`;
      const res = await axios.get(`/api/security/logs${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load security logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(filter);
  }, [filter]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(''), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const setDraft = (logId, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [logId]: { ...prev[logId], [field]: value }
    }));
  };

  const saveReview = async (log) => {
    const draft = drafts[log.id] || {};
    const reviewStatus = draft.reviewStatus || log.reviewStatus || 'Pending Review';
    const reviewNotes = draft.reviewNotes ?? log.reviewNotes ?? '';

    setSavingId(log.id);
    try {
      await axios.patch(`/api/security/logs/${log.id}/review`,
        { reviewStatus, reviewNotes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotification(`Log #${String(log.id).slice(0, 8)} marked "${reviewStatus}".`);
      fetchLogs(filter);
    } catch (err) {
      console.error('Failed to save review:', err);
      setNotification('Could not save review. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const badgeClass = (status) => {
    if (status === 'Resolved' || status === 'False Positive') return 'status-badge active';
    return 'status-badge inactive';
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Security Log Review</h1>
            <p>Manually triage suspicious access events flagged by the AI gantry</p>
          </div>
          <div className="review-filter" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label htmlFor="statusFilter" style={{ color: '#94a3b8' }}>Filter:</label>
            <select
              id="statusFilter"
              aria-label="Filter by review status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
            >
              <option value="All">All</option>
              {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </header>

        {notification && <div className="toast-notification">{notification}</div>}

        <div className="table-container review-table-container">
          <table className="management-table security-review-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>EVENT</th>
                <th>PERSONNEL</th>
                <th>SEVERITY</th>
                <th>REVIEW STATUS</th>
                <th>RESOLUTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>Loading security logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  No logs match this filter.
                </td></tr>
              ) : logs.map((log) => {
                const draft = drafts[log.id] || {};
                return (
                  <tr key={log.id}>
                    <td data-label="Timestamp" style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
                      {log.time || new Date(log.createdAt).toLocaleString('en-SG')}
                    </td>
                    <td data-label="Event">
                      <strong>{log.icon} {log.type}</strong>
                      <div style={{ color: '#94a3b8', fontSize: '0.85em' }}>{log.desc}</div>
                    </td>
                    <td data-label="Personnel">{log.personnelName || <em style={{ color: '#64748b' }}>Unknown</em>}</td>
                    <td data-label="Severity">
                      <span className={`status-badge ${log.severity === 'safe' ? 'active' : 'inactive'}`}>
                        {log.severity}
                      </span>
                    </td>
                    <td data-label="Review Status" className="review-status-cell">
                      <select
                        className="review-select"
                        aria-label={`Review status for log ${log.id}`}
                        value={draft.reviewStatus ?? log.reviewStatus ?? 'Pending Review'}
                        onChange={(e) => setDraft(log.id, 'reviewStatus', e.target.value)}
                      >
                        {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span className={`${badgeClass(log.reviewStatus)} review-current-status`}>{log.reviewStatus}</span>
                    </td>
                    <td data-label="Resolution" className="review-resolution-cell">
                      <div className="review-resolution">
                        <textarea
                          className="review-textarea"
                          aria-label={`Resolution notes for log ${log.id}`}
                          placeholder="Add resolution notes..."
                          value={draft.reviewNotes ?? log.reviewNotes ?? ''}
                          onChange={(e) => setDraft(log.id, 'reviewNotes', e.target.value)}
                          rows={2}
                        />
                        <button
                          className="edit-btn review-save-btn"
                          disabled={savingId === log.id}
                          onClick={() => saveReview(log)}
                        >
                          {savingId === log.id ? 'Saving...' : 'Save Review'}
                        </button>
                        {log.reviewedBy && <span className="review-reviewer">by {log.reviewedBy}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default SecurityReview;
