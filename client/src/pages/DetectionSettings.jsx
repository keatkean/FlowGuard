import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { ROLES } from '../constants/roles';
import '../css/Dashboard.css';
import '../css/ObjectDetection.css';

const ZONES_URL = '/api/zones';
const CAMERAS_URL = '/api/cameras';
const RESPONDERS_STORAGE_KEY = 'flowguard-response-teams';
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const emptyForm = {
  zone_name: '',
  location: '',
  time_threshold: '',
  monitored_classes: '',
  density_threshold: '',
  unattended_threshold_seconds: '',
  alert_cooldown_seconds: '',
  severity: 'Medium',
  assigned_team: '',
  detection_enabled: true,
};
const emptyResponder = { name: '', team: 'Security', contact: '' };

const toEditForm = (zone) => ({
  zone_name: zone.zone_name,
  location: zone.location,
  time_threshold: String(zone.time_threshold),
  monitored_classes: (zone.monitored_classes || []).join(', '),
  density_threshold: zone.density_threshold ?? '',
  unattended_threshold_seconds: zone.unattended_threshold_seconds ?? '',
  alert_cooldown_seconds: zone.alert_cooldown_seconds ?? '',
  severity: zone.severity || 'Medium',
  assigned_team: zone.assigned_team || '',
  detection_enabled: zone.detection_enabled !== false,
});

const buildZonePayload = (form) => ({
  zone_name: form.zone_name.trim(),
  location: form.location.trim(),
  time_threshold: parseInt(form.time_threshold, 10),
  monitored_classes: form.monitored_classes.split(',').map((item) => item.trim()).filter(Boolean),
  density_threshold: form.density_threshold === '' ? null : parseInt(form.density_threshold, 10),
  unattended_threshold_seconds: form.unattended_threshold_seconds === '' ? null : parseInt(form.unattended_threshold_seconds, 10),
  alert_cooldown_seconds: form.alert_cooldown_seconds === '' ? null : parseInt(form.alert_cooldown_seconds, 10),
  severity: form.severity,
  assigned_team: form.assigned_team.trim() || null,
  detection_enabled: form.detection_enabled,
});

export default function DetectionSettings() {
  const [zones, setZones] = useState([]);
  const [cameras, setCameras] = useState([]);
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
  const [cameraPickerByZone, setCameraPickerByZone] = useState({});

  const token = localStorage.getItem('accessToken');
  const headers = { Authorization: `Bearer ${token}` };
  const canEdit = localStorage.getItem('userRole') === ROLES.FM;

  const fetchZones = useCallback(() => {
    axios.get(ZONES_URL, { headers })
      .then((res) => {
        setZones(res.data);
        setNodeOffline(false);
      })
      .catch(() => setNodeOffline(true));
  }, []);

  const fetchCameras = useCallback(() => {
    axios.get(CAMERAS_URL, { headers })
      .then((res) => setCameras(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCameras([]));
  }, []);

  useEffect(() => {
    fetchZones();
    fetchCameras();
  }, [fetchZones, fetchCameras]);

  useEffect(() => {
    localStorage.setItem(RESPONDERS_STORAGE_KEY, JSON.stringify(responders));
  }, [responders]);

  const handleCreateZone = async (event) => {
    event.preventDefault();
    setFormError('');
    const { zone_name, location, time_threshold } = form;
    if (!zone_name.trim() || !location.trim() || !time_threshold) {
      setFormError('Zone name, location, and threshold are required.');
      return;
    }
    if (parseInt(time_threshold, 10) < 1) {
      setFormError('Threshold must be at least 1 minute.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(ZONES_URL, buildZonePayload(form), { headers });
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
    setEditForm(toEditForm(zone));
  };

  const handleUpdateZone = async (id) => {
    if (!editForm.zone_name.trim() || !editForm.location.trim() || parseInt(editForm.time_threshold, 10) < 1) {
      setFormError('Zone name, location, and a threshold of at least 1 minute are required.');
      return;
    }
    setFormError('');
    try {
      const res = await axios.put(`${ZONES_URL}/${id}`, buildZonePayload(editForm), { headers });
      setZones((prev) => prev.map((zone) => (zone.id === id ? res.data : zone)));
      setEditId(null);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update zone.');
    }
  };

  const assignCameraToZone = async (zoneId) => {
    const cameraId = cameraPickerByZone[zoneId];
    if (!cameraId) return;
    try {
      await axios.put(`${CAMERAS_URL}/${cameraId}`, { zone_id: zoneId }, { headers });
      setCameraPickerByZone((prev) => ({ ...prev, [zoneId]: '' }));
      fetchCameras();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to map camera to zone.');
    }
  };

  const unassignCamera = async (cameraId) => {
    try {
      await axios.put(`${CAMERAS_URL}/${cameraId}`, { zone_id: null }, { headers });
      fetchCameras();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to unassign camera.');
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
        {!canEdit && (
          <div className="od-system-banner warning">
            You have view-only access to Detection Setup. Only a Facilities Manager can create, edit, or delete zone configuration.
          </div>
        )}

        <section className="od-settings-grid">
          <div className="od-card od-settings-card">
            <div className="od-card-heading">
              <div>
                <span>Restricted Zones</span>
                <h2>Zone Thresholds &amp; Detection Rules</h2>
              </div>
              <strong>{zones.length}</strong>
            </div>

            {canEdit && (
              <form className="od-form" onSubmit={handleCreateZone}>
                <input className="od-input" placeholder="Zone name" value={form.zone_name} onChange={(event) => setForm((prev) => ({ ...prev, zone_name: event.target.value }))} />
                <input className="od-input" placeholder="Location" value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
                <input className="od-input" type="number" min="1" placeholder="Unattended threshold (minutes, legacy)" value={form.time_threshold} onChange={(event) => setForm((prev) => ({ ...prev, time_threshold: event.target.value }))} />
                <input className="od-input" placeholder="Monitored object classes (comma-separated, e.g. person, backpack)" value={form.monitored_classes} onChange={(event) => setForm((prev) => ({ ...prev, monitored_classes: event.target.value }))} />
                <input className="od-input" type="number" min="1" placeholder="Density / people-count threshold" value={form.density_threshold} onChange={(event) => setForm((prev) => ({ ...prev, density_threshold: event.target.value }))} />
                <input className="od-input" type="number" min="1" placeholder="Unattended-object threshold (seconds)" value={form.unattended_threshold_seconds} onChange={(event) => setForm((prev) => ({ ...prev, unattended_threshold_seconds: event.target.value }))} />
                <input className="od-input" type="number" min="1" placeholder="Alert cooldown (seconds)" value={form.alert_cooldown_seconds} onChange={(event) => setForm((prev) => ({ ...prev, alert_cooldown_seconds: event.target.value }))} />
                <select className="od-input" value={form.severity} onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))}>
                  {SEVERITIES.map((severity) => <option key={severity}>{severity}</option>)}
                </select>
                <input className="od-input" placeholder="Assigned team (e.g. Security Team Alpha)" value={form.assigned_team} onChange={(event) => setForm((prev) => ({ ...prev, assigned_team: event.target.value }))} />
                <label className="od-checkbox-row">
                  <input type="checkbox" checked={form.detection_enabled} onChange={(event) => setForm((prev) => ({ ...prev, detection_enabled: event.target.checked }))} />
                  Detection enabled for this zone
                </label>
                {formError && <p className="od-form-error">{formError}</p>}
                <button className="od-btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Add Zone'}</button>
              </form>
            )}

            <div className="od-zone-list relaxed">
              {zones.length === 0 && <p className="od-empty">No zones configured yet.</p>}
              {zones.map((zone) => {
                const zoneCameras = cameras.filter((cam) => cam.zone_id === zone.id);
                const unassignedCameras = cameras.filter((cam) => cam.zone_id !== zone.id);
                return (
                <div key={zone.id}>
                  {editId === zone.id ? (
                    <div className="od-edit-form">
                      <input className="od-input" value={editForm.zone_name} onChange={(event) => setEditForm((prev) => ({ ...prev, zone_name: event.target.value }))} />
                      <input className="od-input" value={editForm.location} onChange={(event) => setEditForm((prev) => ({ ...prev, location: event.target.value }))} />
                      <input className="od-input" type="number" min="1" value={editForm.time_threshold} onChange={(event) => setEditForm((prev) => ({ ...prev, time_threshold: event.target.value }))} />
                      <input className="od-input" placeholder="Monitored classes" value={editForm.monitored_classes} onChange={(event) => setEditForm((prev) => ({ ...prev, monitored_classes: event.target.value }))} />
                      <input className="od-input" type="number" min="1" placeholder="Density threshold" value={editForm.density_threshold} onChange={(event) => setEditForm((prev) => ({ ...prev, density_threshold: event.target.value }))} />
                      <input className="od-input" type="number" min="1" placeholder="Unattended threshold (seconds)" value={editForm.unattended_threshold_seconds} onChange={(event) => setEditForm((prev) => ({ ...prev, unattended_threshold_seconds: event.target.value }))} />
                      <input className="od-input" type="number" min="1" placeholder="Alert cooldown (seconds)" value={editForm.alert_cooldown_seconds} onChange={(event) => setEditForm((prev) => ({ ...prev, alert_cooldown_seconds: event.target.value }))} />
                      <select className="od-input" value={editForm.severity} onChange={(event) => setEditForm((prev) => ({ ...prev, severity: event.target.value }))}>
                        {SEVERITIES.map((severity) => <option key={severity}>{severity}</option>)}
                      </select>
                      <input className="od-input" placeholder="Assigned team" value={editForm.assigned_team} onChange={(event) => setEditForm((prev) => ({ ...prev, assigned_team: event.target.value }))} />
                      <label className="od-checkbox-row">
                        <input type="checkbox" checked={editForm.detection_enabled} onChange={(event) => setEditForm((prev) => ({ ...prev, detection_enabled: event.target.checked }))} />
                        Detection enabled
                      </label>
                      <div className="od-edit-actions">
                        <button className="od-btn-save" type="button" onClick={() => handleUpdateZone(zone.id)}>Save</button>
                        <button className="od-btn-cancel" type="button" onClick={() => setEditId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="od-zone-item">
                      <div className="od-zone-top">
                        <span className="od-zone-name">{zone.zone_name}</span>
                        {canEdit && (
                          <div className="od-zone-actions">
                            <button className="od-btn-icon" type="button" onClick={() => startEdit(zone)}>Edit</button>
                            <button className="od-btn-icon danger" type="button" onClick={() => handleDeleteZone(zone.id)}>Delete</button>
                          </div>
                        )}
                      </div>
                      <p className="od-zone-meta">{zone.location} - <span>{zone.time_threshold} min legacy threshold</span></p>
                      <p className="od-zone-meta">
                        Severity <span>{zone.severity}</span> - Cooldown <span>{zone.alert_cooldown_seconds ?? 'n/a'}s</span> - Density <span>{zone.density_threshold ?? 'n/a'}</span> - Unattended <span>{zone.unattended_threshold_seconds ?? 'n/a'}s</span>
                      </p>
                      <p className="od-zone-meta">
                        Classes <span>{(zone.monitored_classes || []).join(', ') || 'none set'}</span> - Team <span>{zone.assigned_team || 'unassigned'}</span> - {zone.detection_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                      <p className="od-zone-meta">
                        Cameras <span>{zoneCameras.map((cam) => cam.camera_code).join(', ') || 'none mapped'}</span>
                      </p>
                      {canEdit && (
                        <div className="od-edit-actions">
                          <select className="od-input" value={cameraPickerByZone[zone.id] || ''} onChange={(event) => setCameraPickerByZone((prev) => ({ ...prev, [zone.id]: event.target.value }))}>
                            <option value="">Map a camera to this zone...</option>
                            {unassignedCameras.map((cam) => <option key={cam.id} value={cam.id}>{cam.camera_code} - {cam.camera_name}</option>)}
                          </select>
                          <button className="od-btn-save" type="button" onClick={() => assignCameraToZone(zone.id)}>Map</button>
                          {zoneCameras.map((cam) => (
                            <button key={cam.id} className="od-btn-icon danger" type="button" onClick={() => unassignCamera(cam.id)}>
                              Unmap {cam.camera_code}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );})}
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
            <p className="od-workflow-note">
              Response teams are a temporary demo directory stored only in this browser's localStorage — not persisted in the database.
            </p>

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
