import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/ObjectDetection.css';

const ZONES_URL = '/api/zones';
const RESPONDERS_STORAGE_KEY = 'flowguard-response-teams';
const emptyForm = { zone_name: '', location: '', time_threshold: '' };
const emptyResponder = { name: '', team: 'Security', contact: '' };

export default function DetectionSettings() {
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [nodeOffline, setNodeOffline] = useState(false);
  const [responders, setResponders] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RESPONDERS_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {
      // Invalid local storage should not block the settings page.
    }
    return [
      { id: 1, name: 'Security Team Alpha', team: 'Security', contact: 'ext. 201' },
      { id: 2, name: 'Floor Supervisor', team: 'Operations', contact: 'ext. 118' },
    ];
  });
  const [responderForm, setResponderForm] = useState(emptyResponder);
  const [responderEditId, setResponderEditId] = useState(null);
  const [workflowMessage, setWorkflowMessage] = useState('');

  const token = localStorage.getItem('accessToken');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchZones = useCallback(() => {
    axios.get(ZONES_URL, { headers })
      .then((res) => {
        setZones(res.data);
        setNodeOffline(false);
      })
      .catch(() => setNodeOffline(true));
  }, []);

  useEffect(() => {
    fetchZones();
  }, []);

  useEffect(() => {
    localStorage.setItem(RESPONDERS_STORAGE_KEY, JSON.stringify(responders));
  }, [responders]);

  const handleCreateZone = async (event) => {
    event.preventDefault();
    setFormError('');
    const { zone_name, location, time_threshold } = form;
    if (!zone_name.trim() || !location.trim() || !time_threshold) {
      setFormError('All fields are required.');
      return;
    }
    if (parseInt(time_threshold, 10) < 1) {
      setFormError('Threshold must be at least 1 minute.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(ZONES_URL, {
        zone_name: zone_name.trim(),
        location: location.trim(),
        time_threshold: parseInt(time_threshold, 10),
      }, { headers });
      setForm(emptyForm);
      fetchZones();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create zone.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteZone = async (id) => {
    try {
      await axios.delete(`${ZONES_URL}/${id}`, { headers });
      setZones((prev) => prev.filter((zone) => zone.id !== id));
      if (editId === id) setEditId(null);
    } catch {
      setFormError('Failed to delete zone.');
    }
  };

  const startEdit = (zone) => {
    setEditId(zone.id);
    setEditForm({
      zone_name: zone.zone_name,
      location: zone.location,
      time_threshold: String(zone.time_threshold),
    });
  };

  const handleUpdateZone = async (id) => {
    if (!editForm.zone_name.trim() || !editForm.location.trim() || parseInt(editForm.time_threshold, 10) < 1) {
      setFormError('Zone name, location, and a threshold of at least 1 minute are required.');
      return;
    }
    setFormError('');
    try {
      const res = await axios.put(`${ZONES_URL}/${id}`, {
        zone_name: editForm.zone_name.trim(),
        location: editForm.location.trim(),
        time_threshold: parseInt(editForm.time_threshold, 10),
      }, { headers });
      setZones((prev) => prev.map((zone) => (zone.id === id ? res.data : zone)));
      setEditId(null);
    } catch {
      setFormError('Failed to update zone.');
    }
  };

  const saveResponder = (event) => {
    event.preventDefault();
    if (!responderForm.name.trim()) return;
    const payload = {
      ...responderForm,
      name: responderForm.name.trim(),
      contact: responderForm.contact.trim(),
    };

    if (responderEditId) {
      setResponders((prev) => prev.map((responder) => (
        responder.id === responderEditId ? { ...payload, id: responderEditId } : responder
      )));
      setWorkflowMessage('Response team updated.');
    } else {
      setResponders((prev) => [{ ...payload, id: Date.now() }, ...prev]);
      setWorkflowMessage('Response team added.');
    }
    setResponderForm(emptyResponder);
    setResponderEditId(null);
  };

  const editResponder = (responder) => {
    setResponderForm({ name: responder.name, team: responder.team, contact: responder.contact });
    setResponderEditId(responder.id);
  };

  const deleteResponder = (id) => {
    setResponders((prev) => prev.filter((responder) => responder.id !== id));
    setWorkflowMessage('Response team deleted.');
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main od-main">
        <header className="dashboard-header od-header">
          <div className="header-titles">
            <h1>Detection Setup</h1>
            <p>Configure restricted-zone thresholds and response teams without crowding the live detection console.</p>
          </div>
          <Link className="od-btn-primary od-link-button" to="/object-detection">Back to Detection Console</Link>
        </header>

        {nodeOffline && (
          <div className="od-system-banner danger">
            Node.js server offline - zone records are unavailable.
          </div>
        )}

        <section className="od-settings-grid">
          <div className="od-card od-settings-card">
            <div className="od-card-heading">
              <div>
                <span>Restricted Zones</span>
                <h2>Zone Thresholds</h2>
              </div>
              <strong>{zones.length}</strong>
            </div>

            <form className="od-form" onSubmit={handleCreateZone}>
              <input className="od-input" placeholder="Zone name" value={form.zone_name} onChange={(event) => setForm((prev) => ({ ...prev, zone_name: event.target.value }))} />
              <input className="od-input" placeholder="Location" value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
              <input className="od-input" type="number" min="1" placeholder="Threshold minutes" value={form.time_threshold} onChange={(event) => setForm((prev) => ({ ...prev, time_threshold: event.target.value }))} />
              {formError && <p className="od-form-error">{formError}</p>}
              <button className="od-btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Add Zone'}</button>
            </form>

            <div className="od-zone-list relaxed">
              {zones.length === 0 && <p className="od-empty">No zones configured yet.</p>}
              {zones.map((zone) => (
                <div key={zone.id}>
                  {editId === zone.id ? (
                    <div className="od-edit-form">
                      <input className="od-input" value={editForm.zone_name} onChange={(event) => setEditForm((prev) => ({ ...prev, zone_name: event.target.value }))} />
                      <input className="od-input" value={editForm.location} onChange={(event) => setEditForm((prev) => ({ ...prev, location: event.target.value }))} />
                      <input className="od-input" type="number" min="1" value={editForm.time_threshold} onChange={(event) => setEditForm((prev) => ({ ...prev, time_threshold: event.target.value }))} />
                      <div className="od-edit-actions">
                        <button className="od-btn-save" type="button" onClick={() => handleUpdateZone(zone.id)}>Save</button>
                        <button className="od-btn-cancel" type="button" onClick={() => setEditId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="od-zone-item">
                      <div className="od-zone-top">
                        <span className="od-zone-name">{zone.zone_name}</span>
                        <div className="od-zone-actions">
                          <button className="od-btn-icon" type="button" onClick={() => startEdit(zone)}>Edit</button>
                          <button className="od-btn-icon danger" type="button" onClick={() => handleDeleteZone(zone.id)}>Delete</button>
                        </div>
                      </div>
                      <p className="od-zone-meta">{zone.location} - <span>{zone.time_threshold} min threshold</span></p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="od-card od-settings-card">
            <div className="od-card-heading">
              <div>
                <span>Dispatch Directory</span>
                <h2>Response Teams</h2>
              </div>
              <strong>{responders.length}</strong>
            </div>

            <form className="od-form" onSubmit={saveResponder}>
              <input className="od-input" placeholder="Responder or team name" value={responderForm.name} onChange={(event) => setResponderForm((prev) => ({ ...prev, name: event.target.value }))} />
              <select className="od-input" value={responderForm.team} onChange={(event) => setResponderForm((prev) => ({ ...prev, team: event.target.value }))}>
                <option>Security</option>
                <option>Operations</option>
                <option>Maintenance</option>
                <option>Safety</option>
              </select>
              <input className="od-input" placeholder="Contact / extension" value={responderForm.contact} onChange={(event) => setResponderForm((prev) => ({ ...prev, contact: event.target.value }))} />
              <button className="od-btn-primary" type="submit">{responderEditId ? 'Save Team' : 'Add Team'}</button>
              {responderEditId && <button className="od-btn-cancel" type="button" onClick={() => { setResponderForm(emptyResponder); setResponderEditId(null); }}>Cancel Edit</button>}
            </form>
            {workflowMessage && <p className="od-workflow-note">{workflowMessage}</p>}

            <div className="od-zone-list relaxed">
              {responders.map((responder) => (
                <div key={responder.id} className="od-zone-item">
                  <div className="od-zone-top">
                    <span className="od-zone-name">{responder.name}</span>
                    <div className="od-zone-actions">
                      <button className="od-btn-icon" type="button" onClick={() => editResponder(responder)}>Edit</button>
                      <button className="od-btn-icon danger" type="button" onClick={() => deleteResponder(responder.id)}>Delete</button>
                    </div>
                  </div>
                  <p className="od-zone-meta">{responder.team} {responder.contact && <>- <span>{responder.contact}</span></>}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
