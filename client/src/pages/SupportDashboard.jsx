import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Management.css';
import '../css/SupportDashboard.css';

const TOKEN = () => localStorage.getItem('accessToken');
const FM_NAME = () => localStorage.getItem('userName') || 'FM';

const TICKET_STATUSES = ['Pending', 'In Progress', 'Resolved'];
const PRIORITIES = ['High', 'Medium', 'Low'];

// ─── SUPPORT DASHBOARD ────────────────────────────────────────────────────────
const SupportDashboard = () => {
  const [activeTab, setActiveTab] = useState('tickets');

  // ── Tickets state ──
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('All');
  const [ticketLoading, setTicketLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null); // for transcript modal
  const [statusDrafts, setStatusDrafts] = useState({});       // { [ticketId]: { status, resolutionNotes } }
  const [savingId, setSavingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);   // ticket to confirm-delete

  // ── Knowledge Base state ──
  const [kbEntries, setKbEntries] = useState([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbForm, setKbForm] = useState({ category: 'General', question: '', answer: '', keywords: '' });
  const [kbEditId, setKbEditId] = useState(null);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbDeleteConfirm, setKbDeleteConfirm] = useState(null);

  // ── Shared ──
  const [notification, setNotification] = useState({ text: '', type: 'success' });

  const toast = (text, type = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification({ text: '', type: 'success' }), 4000);
  };

  // ─── TICKETS ──────────────────────────────────────────────────────────────

  const fetchTickets = useCallback(async () => {
    setTicketLoading(true);
    try {
      const query = ticketFilter === 'All' ? '' : `?status=${encodeURIComponent(ticketFilter)}`;
      const { data } = await axios.get(`/api/support/tickets${query}`, {
        headers: { Authorization: `Bearer ${TOKEN()}` }
      });
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      toast('Could not load support tickets.', 'error');
    } finally {
      setTicketLoading(false);
    }
  }, [ticketFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const setDraft = (id, field, value) =>
    setStatusDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const saveStatus = async (ticket) => {
    const draft = statusDrafts[ticket.id] || {};
    const status = draft.status || ticket.status;
    const resolutionNotes = draft.resolutionNotes ?? ticket.resolutionNotes ?? '';

    setSavingId(ticket.id);
    try {
      await axios.patch(
        `/api/support/tickets/${ticket.id}/status`,
        { status, resolutionNotes },
        { headers: { Authorization: `Bearer ${TOKEN()}` } }
      );
      toast(`Ticket #${ticket.id.slice(0, 8).toUpperCase()} marked "${status}".`);
      fetchTickets();
    } catch {
      toast('Could not update ticket status.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const deleteTicket = async (id) => {
    try {
      await axios.delete(`/api/support/tickets/${id}`, {
        headers: { Authorization: `Bearer ${TOKEN()}` }
      });
      toast('Ticket and linked transcript deleted.');
      setDeleteConfirm(null);
      fetchTickets();
    } catch {
      toast('Could not delete ticket.', 'error');
    }
  };

  const statusBadge = (status) => {
    if (status === 'Resolved') return 'status-badge active';
    if (status === 'In Progress') return 'status-badge inprogress';
    return 'status-badge inactive';
  };

  const priorityBadge = (p) => {
    if (p === 'High') return 'status-badge expired';
    if (p === 'Medium') return 'status-badge medium';
    return 'status-badge active';
  };

  // ─── KNOWLEDGE BASE ────────────────────────────────────────────────────────

  const fetchKB = useCallback(async () => {
    setKbLoading(true);
    try {
      const { data } = await axios.get('/api/support/knowledge', {
        headers: { Authorization: `Bearer ${TOKEN()}` }
      });
      setKbEntries(Array.isArray(data) ? data : []);
    } catch {
      toast('Could not load knowledge base.', 'error');
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === 'kb') fetchKB(); }, [activeTab, fetchKB]);

  const resetKbForm = () => {
    setKbForm({ category: 'General', question: '', answer: '', keywords: '' });
    setKbEditId(null);
  };

  const startKbEdit = (entry) => {
    setKbForm({
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
      keywords: Array.isArray(entry.keywords) ? entry.keywords.join(', ') : ''
    });
    setKbEditId(entry.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveKbEntry = async (e) => {
    e.preventDefault();
    if (!kbForm.question.trim() || !kbForm.answer.trim()) {
      toast('Question and Answer are required.', 'error');
      return;
    }

    const payload = {
      category: kbForm.category.trim() || 'General',
      question: kbForm.question.trim(),
      answer: kbForm.answer.trim(),
      keywords: kbForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
    };

    setKbSaving(true);
    try {
      if (kbEditId) {
        await axios.put(`/api/support/knowledge/${kbEditId}`, payload, {
          headers: { Authorization: `Bearer ${TOKEN()}` }
        });
        toast('Knowledge base entry updated.');
      } else {
        await axios.post('/api/support/knowledge', payload, {
          headers: { Authorization: `Bearer ${TOKEN()}` }
        });
        toast('FAQ added to knowledge base.');
      }
      resetKbForm();
      fetchKB();
    } catch {
      toast('Could not save knowledge base entry.', 'error');
    } finally {
      setKbSaving(false);
    }
  };

  const deleteKbEntry = async (id) => {
    try {
      await axios.delete(`/api/support/knowledge/${id}`, {
        headers: { Authorization: `Bearer ${TOKEN()}` }
      });
      toast('Knowledge base entry deleted.');
      setKbDeleteConfirm(null);
      fetchKB();
    } catch {
      toast('Could not delete entry.', 'error');
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Support Management</h1>
            <p>Manage escalated tenant tickets and the AI knowledge base</p>
          </div>
        </header>

        {/* Toast */}
        {notification.text && (
          <div className={`toast-notification ${notification.type}`}>{notification.text}</div>
        )}

        {/* Tabs */}
        <div className="support-tabs">
          <button
            className={`support-tab ${activeTab === 'tickets' ? 'active' : ''}`}
            onClick={() => setActiveTab('tickets')}
          >
            Support Tickets
          </button>
          <button
            className={`support-tab ${activeTab === 'kb' ? 'active' : ''}`}
            onClick={() => { setActiveTab('kb'); fetchKB(); }}
          >
            Knowledge Base
          </button>
        </div>

        {/* ── TICKETS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'tickets' && (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8' }}>Filter:</label>
              <select
                value={ticketFilter}
                onChange={e => setTicketFilter(e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
              >
                <option value="All">All</option>
                {TICKET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="table-container">
              <table className="management-table">
                <thead>
                  <tr>
                    <th>TICKET ID</th>
                    <th>TENANT / UNIT</th>
                    <th>ISSUE</th>
                    <th>PRIORITY</th>
                    <th>STATUS</th>
                    <th>DATE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketLoading ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>Loading tickets...</td></tr>
                  ) : tickets.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      No tickets found.
                    </td></tr>
                  ) : tickets.map(t => {
                    const draft = statusDrafts[t.id] || {};
                    return (
                      <tr key={t.id}>
                        <td data-label="ID">
                          <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: '0.85rem' }}>
                            #{t.id.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td data-label="Tenant">
                          <strong>{t.tenantName || <em style={{ color: '#64748b' }}>Unknown</em>}</strong>
                          {t.unitNumber && <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Unit {t.unitNumber}</div>}
                        </td>
                        <td data-label="Issue" style={{ maxWidth: '220px' }}>
                          <div style={{ fontWeight: 600 }}>{t.issueTitle}</div>
                          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '2px' }}>
                            {t.issueDescription?.substring(0, 80)}...
                          </div>
                        </td>
                        <td data-label="Priority">
                          <span className={priorityBadge(t.priority)}>{t.priority}</span>
                        </td>
                        <td data-label="Status">
                          <select
                            value={draft.status ?? t.status}
                            onChange={e => setDraft(t.id, 'status', e.target.value)}
                            style={{ padding: '6px', borderRadius: '6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', marginBottom: '4px', display: 'block' }}
                          >
                            {TICKET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <span className={statusBadge(t.status)}>{t.status}</span>
                        </td>
                        <td data-label="Date" style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {new Date(t.createdAt).toLocaleDateString('en-SG')}
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <textarea
                              placeholder="Resolution notes..."
                              value={draft.resolutionNotes ?? t.resolutionNotes ?? ''}
                              onChange={e => setDraft(t.id, 'resolutionNotes', e.target.value)}
                              rows={2}
                              style={{ width: '160px', padding: '6px', borderRadius: '6px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '0.8rem' }}
                            />
                            <button
                              className="edit-btn"
                              disabled={savingId === t.id}
                              onClick={() => saveStatus(t)}
                            >
                              {savingId === t.id ? 'Saving...' : 'Save Status'}
                            </button>
                            {t.transcript && (
                              <button className="edit-btn" onClick={() => setSelectedTicket(t)}>
                                View Transcript
                              </button>
                            )}
                            <button className="revoke-btn" onClick={() => setDeleteConfirm(t)}>
                              Delete
                            </button>
                          </div>
                          {t.resolvedBy && (
                            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '4px' }}>
                              Resolved by {t.resolvedBy}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── KNOWLEDGE BASE TAB ───────────────────────────────────────────── */}
        {activeTab === 'kb' && (
          <>
            {/* Add / Edit Form */}
            <div className="support-kb-form-card">
              <h3>{kbEditId ? 'Edit FAQ Entry' : 'Add New FAQ'}</h3>
              <form onSubmit={saveKbEntry}>
                <div className="support-form-row">
                  <label>Category</label>
                  <input
                    type="text"
                    value={kbForm.category}
                    onChange={e => setKbForm(p => ({ ...p, category: e.target.value }))}
                    placeholder="e.g. Access Control"
                  />
                </div>
                <div className="support-form-row">
                  <label>Question *</label>
                  <input
                    type="text"
                    value={kbForm.question}
                    onChange={e => setKbForm(p => ({ ...p, question: e.target.value }))}
                    placeholder="e.g. Why does my face scan keep failing?"
                    required
                  />
                </div>
                <div className="support-form-row">
                  <label>Answer *</label>
                  <textarea
                    rows={4}
                    value={kbForm.answer}
                    onChange={e => setKbForm(p => ({ ...p, answer: e.target.value }))}
                    placeholder="Provide a clear, actionable response for the tenant..."
                    required
                  />
                </div>
                <div className="support-form-row">
                  <label>Keywords <span style={{ color: '#64748b' }}>(comma-separated)</span></label>
                  <input
                    type="text"
                    value={kbForm.keywords}
                    onChange={e => setKbForm(p => ({ ...p, keywords: e.target.value }))}
                    placeholder="e.g. face, scan, biometric, access, unit"
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="submit" className="edit-btn support-save-btn" disabled={kbSaving}>
                    {kbSaving ? 'Saving...' : kbEditId ? 'Update Entry' : 'Add Entry'}
                  </button>
                  {kbEditId && (
                    <button type="button" className="cancel-btn" onClick={resetKbForm}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* KB List */}
            <div className="table-container" style={{ marginTop: '1.5rem' }}>
              <table className="management-table">
                <thead>
                  <tr>
                    <th>CATEGORY</th>
                    <th>QUESTION</th>
                    <th>ANSWER</th>
                    <th>KEYWORDS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {kbLoading ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>Loading knowledge base...</td></tr>
                  ) : kbEntries.length === 0 ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      No FAQ entries yet. Add the first one above.
                    </td></tr>
                  ) : kbEntries.map(entry => (
                    <tr key={entry.id}>
                      <td data-label="Category">
                        <span className="status-badge active" style={{ fontSize: '0.7rem' }}>{entry.category}</span>
                      </td>
                      <td data-label="Question" style={{ maxWidth: '200px' }}>
                        <strong>{entry.question}</strong>
                      </td>
                      <td data-label="Answer" style={{ maxWidth: '260px', color: '#94a3b8', fontSize: '0.85rem' }}>
                        {entry.answer.substring(0, 120)}{entry.answer.length > 120 ? '...' : ''}
                      </td>
                      <td data-label="Keywords">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(entry.keywords || []).map(k => (
                            <span key={k} className="support-keyword-tag">{k}</span>
                          ))}
                        </div>
                      </td>
                      <td data-label="Actions">
                        <button className="edit-btn" onClick={() => startKbEdit(entry)}>Edit</button>
                        <button className="revoke-btn" onClick={() => setKbDeleteConfirm(entry)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* ── TRANSCRIPT MODAL ──────────────────────────────────────────────── */}
      {selectedTicket && (
        <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
          <div className="modal-content support-transcript-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>
                Chat Transcript — #{selectedTicket.id.slice(0, 8).toUpperCase()}
              </h3>
              <button className="cancel-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>

            {selectedTicket.transcript?.tenantName && (
              <p style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: '0.85rem' }}>
                Tenant: <strong style={{ color: '#e2e8f0' }}>{selectedTicket.transcript.tenantName}</strong>
                {selectedTicket.transcript.unitNumber && ` · Unit ${selectedTicket.transcript.unitNumber}`}
              </p>
            )}

            <div className="support-transcript-messages">
              {(selectedTicket.transcript?.messages || []).map((msg, i) => (
                <div key={i} className={`support-msg ${msg.role === 'user' ? 'support-msg-user' : 'support-msg-ai'}`}>
                  <div className="support-msg-label">{msg.role === 'user' ? 'Tenant' : 'AI'}</div>
                  <div className="support-msg-text">{msg.text}</div>
                  {msg.timestamp && (
                    <div className="support-msg-time">{new Date(msg.timestamp).toLocaleTimeString('en-SG')}</div>
                  )}
                </div>
              ))}
              {(!selectedTicket.transcript?.messages?.length) && (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No messages in transcript.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE TICKET CONFIRM MODAL ───────────────────────────────────── */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content delete-variant">
            <span className="red-glow">⚠️</span>
            <h3>Delete Ticket?</h3>
            <p className="warning-subtext">
              This will permanently delete Ticket #{deleteConfirm.id.slice(0, 8).toUpperCase()} and its linked chat transcript. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-delete-btn" onClick={() => deleteTicket(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE KB CONFIRM MODAL ───────────────────────────────────────── */}
      {kbDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content delete-variant">
            <span className="red-glow">⚠️</span>
            <h3>Remove FAQ?</h3>
            <p className="warning-subtext">
              "{kbDeleteConfirm.question}" will be removed from the AI knowledge base. Tenants will no longer get this automated answer.
            </p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setKbDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-delete-btn" onClick={() => deleteKbEntry(kbDeleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportDashboard;
