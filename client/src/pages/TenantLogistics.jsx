import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Management.css';
import '../css/Booking.css';

const BAYS = ['Bay A', 'Bay B'];
const STATUSES = ['Pending', 'Confirmed', 'Arrived', 'Completed', 'Cancelled'];
const STATUS_FLOW = { Pending: 'Confirmed', Confirmed: 'Arrived', Arrived: 'Completed' };
const CLOSED = ['Completed', 'Cancelled'];

const emptyForm = {
  transport_company: '', license_plate: '', driver_phone: '',
  driver_name: '', loading_bay: '', slot_start: '', slot_end: '', notes: ''
};

const TenantLogistics = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Booking form is hidden by default and opens in a modal (keeps the list roomy).
  const [isFormOpen, setIsFormOpen] = useState(false);
  // Frontend-only filtering (backend has no booking filter endpoint).
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterBay, setFilterBay] = useState('All');
  const [filterDate, setFilterDate] = useState(''); // YYYY-MM-DD; empty = all dates

  // Gate Scan (FM/Staff) — verify a driver pass by booking ref at the loading bay.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateRef, setGateRef] = useState('');
  const [gatePlate, setGatePlate] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState('');

  const token = localStorage.getItem('accessToken');
  const role = localStorage.getItem('userRole');
  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  const canManage = role === 'FM';                                    // status updates (facility-level) — FM only
  const canGateScan = role === 'FM';                                  // gate entry/exit — FM only
  const canCreate = role === 'FM' || role === 'Tenant' || role === 'Staff'; // create bookings (Staff books for their unit)

  const fetchBookings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/bookings/', authHeader);
      setBookings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
      setError('Could not load bookings. Please try again.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBookings(); }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const onField = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openForm = () => { setError(''); setForm(emptyForm); setIsFormOpen(true); };
  const closeForm = () => setIsFormOpen(false);

  const describeWhatsapp = (wa) => {
    if (!wa) return '';
    if (wa.simulated) return ' (WhatsApp simulated — disabled)';
    return wa.success ? ' (WhatsApp sent)' : ' (WhatsApp delivery pending)';
  };

  const createBooking = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post('/api/bookings/create', form, authHeader);
      setNotice(`Booking created (status: Pending).${describeWhatsapp(res.data?.whatsapp)}`);
      setForm(emptyForm);
      setIsFormOpen(false);
      fetchBookings();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create booking.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await axios.patch(`/api/bookings/${id}/status`, { status }, authHeader);
      setNotice(`Booking ${status}.${describeWhatsapp(res.data?.whatsapp)}`);
      fetchBookings();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status.');
    }
  };

  const cancelBooking = async (id) => {
    try {
      const res = await axios.patch(`/api/bookings/${id}/cancel`, {}, authHeader);
      setNotice(`Booking cancelled.${describeWhatsapp(res.data?.whatsapp)}`);
      fetchBookings();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel booking.');
    }
  };

  const openGate = () => { setGateError(''); setGateRef(''); setGatePlate(''); setGateOpen(true); };
  const closeGate = () => setGateOpen(false);

  const gateScan = async (action) => {
    const ref = gateRef.trim();
    if (!ref) { setGateError('Enter a booking reference.'); return; }
    setGateBusy(true);
    setGateError('');
    try {
      const res = await axios.patch(
        `/api/bookings/${encodeURIComponent(ref)}/gate-scan`,
        { action, observedPlate: gatePlate.trim() || undefined },
        authHeader
      );
      const d = res.data || {};
      let msg = d.message || `Gate ${action} recorded.`;
      if (d.plateMatched === false) msg += ' ⚠ Plate mismatch — please verify the vehicle.';
      if (d.nextInLine) msg += ` Next in line: ${d.nextInLine}.`;
      msg += describeWhatsapp(d.whatsappStatus);
      setNotice(msg);
      setGateOpen(false);
      fetchBookings();
    } catch (err) {
      setGateError(err.response?.data?.error || 'Gate scan failed.');
    } finally {
      setGateBusy(false);
    }
  };

  const fmtSlot = (b) => {
    if (!b.slot_start) return '—';
    try { return new Date(b.slot_start).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return b.slot_start; }
  };

  // --- Summary stats (from the full list) ---
  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'Pending').length,
    bayA: bookings.filter(b => b.loading_bay === 'Bay A' && !CLOSED.includes(b.status)).length,
    bayB: bookings.filter(b => b.loading_bay === 'Bay B' && !CLOSED.includes(b.status)).length,
  };

  // Local YYYY-MM-DD of a booking's slot start (matches the date input + displayed Slot).
  const slotDateKey = (b) => {
    if (!b.slot_start) return '';
    const d = new Date(b.slot_start);
    if (isNaN(d.getTime())) return String(b.slot_start).slice(0, 10);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // --- Frontend filtering ---
  const q = searchText.trim().toLowerCase();
  const filtered = bookings.filter((b) => {
    const matchesQ = !q || [b.booking_ref, b.license_plate, b.transport_company, b.driver_name]
      .some(v => String(v || '').toLowerCase().includes(q));
    const matchesStatus = filterStatus === 'All' || b.status === filterStatus;
    const matchesBay = filterBay === 'All' || b.loading_bay === filterBay;
    const matchesDate = !filterDate || slotDateKey(b) === filterDate;
    return matchesQ && matchesStatus && matchesBay && matchesDate;
  });

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Loading Bay Logistics</h1>
            <p>Smart queue management for the {BAYS.length} loading bays — book slots and avoid congestion</p>
          </div>
          <div className="header-actions">
            <button className="edit-btn" onClick={fetchBookings}>Refresh</button>
            {canGateScan && (
              <button className="edit-btn" onClick={openGate}>Gate Scan</button>
            )}
            {canCreate && (
              <button className="new-booking-btn" onClick={openForm}>+ New Booking</button>
            )}
          </div>
        </header>

        {notice && <div className="toast-notification">{notice}</div>}
        {error && !isFormOpen && <div className="error-banner" style={{ margin: '0 0 16px' }}>⚠️ {error}</div>}

        {/* Summary cards */}
        <div className="logistics-stats">
          <div className="logistics-stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Today's Bookings</div>
          </div>
          <div className="logistics-stat-card">
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="logistics-stat-card">
            <div className="stat-value">{stats.bayA}</div>
            <div className="stat-label">Bay A Active</div>
          </div>
          <div className="logistics-stat-card">
            <div className="stat-value">{stats.bayB}</div>
            <div className="stat-label">Bay B Active</div>
          </div>
        </div>

        {/* Filters */}
        <div className="logistics-toolbar">
          <div className="logistics-search">
            <input
              type="text"
              placeholder="Search ref / plate / company / driver..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Search bookings"
            />
          </div>
          <select className="logistics-filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
            <option value="All">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="logistics-filter" value={filterBay} onChange={(e) => setFilterBay(e.target.value)} aria-label="Filter by bay">
            <option value="All">All bays</option>
            {BAYS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input
            type="date"
            className="logistics-filter logistics-date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filter by slot date"
          />
          {filterDate && (
            <button type="button" className="edit-btn" onClick={() => setFilterDate('')} aria-label="Clear date filter">
              Clear date
            </button>
          )}
        </div>

        {/* Booking list — plain table styled like Workforce Attendance (no bulky card/heading) */}
        <div className="active-bookings">
          {loading ? (
            <p style={{ padding: '24px', color: '#94a3b8' }}>Loading bookings...</p>
          ) : bookings.length === 0 ? (
            <p style={{ padding: '24px', color: '#94a3b8' }}>No bookings scheduled yet.</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: '24px', color: '#94a3b8' }}>No bookings match your filters.</p>
          ) : (
            <div className="table-container">
              <table className="management-table">
                <thead>
                  <tr>
                    <th>Ref</th><th>Plate</th><th>Company</th><th>Driver</th><th>Bay</th>
                    <th>Slot</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const nextStatus = STATUS_FLOW[b.status];
                    const isClosed = CLOSED.includes(b.status);
                    return (
                      <tr key={b.id}>
                        <td data-label="Ref" style={{ fontFamily: 'monospace' }}>{b.booking_ref}</td>
                        <td data-label="Plate">{b.license_plate}</td>
                        <td data-label="Company">{b.transport_company}</td>
                        <td data-label="Driver">{b.driver_name || '—'}</td>
                        <td data-label="Bay">{b.loading_bay}</td>
                        <td data-label="Slot">{fmtSlot(b)}</td>
                        <td data-label="Status"><span className={`status-badge ${String(b.status).toLowerCase()}`}>{b.status}</span></td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {canManage && nextStatus && (
                              <button className="edit-btn" onClick={() => updateStatus(b.id, nextStatus)}>
                                Mark {nextStatus}
                              </button>
                            )}
                            {!isClosed && (role === 'FM' || role === 'Tenant') && (
                              <button className="edit-btn" style={{ background: '#7f1d1d' }} onClick={() => cancelBooking(b.id)}>
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create-booking modal (opens via "+ New Booking") */}
        {isFormOpen && canCreate && (
          <div className="modal-overlay" onClick={closeForm}>
            <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
              <div className="booking-modal-head">
                <h2>Schedule New Delivery</h2>
                <button className="modal-x" onClick={closeForm} aria-label="Close">✕</button>
              </div>

              {error && <div className="error-banner" style={{ margin: '0 0 14px' }}>⚠️ {error}</div>}

              <form onSubmit={createBooking} className="dark-form">
                <div className="form-group">
                  <label>Transport Company *</label>
                  <input name="transport_company" value={form.transport_company} onChange={onField} placeholder="e.g., NinjaVan" required />
                </div>
                <div className="form-group">
                  <label>Vehicle License Plate *</label>
                  <input name="license_plate" value={form.license_plate} onChange={onField} placeholder="e.g., GBG 1234M" required />
                </div>
                <div className="form-group">
                  <label>Driver Name</label>
                  <input name="driver_name" value={form.driver_name} onChange={onField} placeholder="e.g., Ahmad" />
                </div>
                <div className="form-group">
                  <label>Driver Phone *</label>
                  <input name="driver_phone" type="tel" value={form.driver_phone} onChange={onField} placeholder="+65..." required />
                </div>
                <div className="form-group">
                  <label>Loading Bay *</label>
                  <select name="loading_bay" value={form.loading_bay} onChange={onField} required>
                    <option value="">Select a bay...</option>
                    {BAYS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Slot Start</label>
                  <input name="slot_start" type="datetime-local" value={form.slot_start} onChange={onField} />
                </div>
                <div className="form-group">
                  <label>Slot End</label>
                  <input name="slot_end" type="datetime-local" value={form.slot_end} onChange={onField} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input name="notes" value={form.notes} onChange={onField} placeholder="Optional" />
                </div>
                <div className="booking-modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeForm}>Cancel</button>
                  <button type="submit" className="submit-booking-btn" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create Booking'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Gate Scan modal (FM/Staff) — verify a driver pass at the loading bay */}
        {gateOpen && canGateScan && (
          <div className="modal-overlay" onClick={closeGate}>
            <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
              <div className="booking-modal-head">
                <h2>Loading Bay Gate Scan</h2>
                <button className="modal-x" onClick={closeGate} aria-label="Close">✕</button>
              </div>

              {gateError && <div className="error-banner" style={{ margin: '0 0 14px' }}>⚠️ {gateError}</div>}

              <div className="dark-form">
                <div className="form-group">
                  <label>Booking Reference *</label>
                  <input
                    value={gateRef}
                    onChange={(e) => setGateRef(e.target.value)}
                    placeholder="e.g., FG-02C7F5"
                    aria-label="Booking reference"
                  />
                </div>
                <div className="form-group">
                  <label>Observed Vehicle Plate (optional)</label>
                  <input
                    value={gatePlate}
                    onChange={(e) => setGatePlate(e.target.value)}
                    placeholder="e.g., GBG 1234M"
                    aria-label="Observed vehicle plate"
                  />
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 12px' }}>
                  Scan the driver's QR or type the booking reference, then record entry or exit.
                </p>
                <div className="booking-modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeGate}>Cancel</button>
                  <button type="button" className="edit-btn" disabled={gateBusy} onClick={() => gateScan('entry')}>
                    {gateBusy ? 'Working…' : 'Mark Arrived (Entry)'}
                  </button>
                  <button type="button" className="new-booking-btn" disabled={gateBusy} onClick={() => gateScan('exit')}>
                    {gateBusy ? 'Working…' : 'Mark Completed (Exit)'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TenantLogistics;
