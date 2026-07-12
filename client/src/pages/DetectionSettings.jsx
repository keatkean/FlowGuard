import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { ROLES } from '../constants/roles';
import { DETECTION_TYPES, buildZonePayload } from './detectionSettingsPayload';
import '../css/Dashboard.css';
import '../css/ObjectDetection.css';

const ZONES_URL = '/api/zones';
const CAMERAS_URL = '/api/cameras';
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const emptyForm = {
  zone_name: '',
  location: '',
  camera_id: '',
  detection_type: 'unattended_object',
  time_threshold: '5',
  monitored_classes: '',
  density_threshold: '',
  unattended_threshold_seconds: '',
  alert_cooldown_seconds: '',
  severity: DETECTION_TYPES.unattended_object.defaults.severity,
  assigned_team: '',
  detection_enabled: true,
};

const getDetectionTypeLabel = (key) => DETECTION_TYPES[key]?.label || DETECTION_TYPES.unattended_object.label;

// The backend always serializes an explicit detection_type (falling back to
// 'unattended_object' for rows saved before the field existed) — read it directly
// instead of re-guessing from severity/density/monitored_classes on every reload.
const zoneDetectionType = (zone) => zone.detection_type || 'unattended_object';

const applyDetectionDefaults = (form, detectionType) => ({
  ...form,
  detection_type: detectionType,
  severity: DETECTION_TYPES[detectionType].defaults.severity,
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

  const camerasByZone = useMemo(() => (
    cameras.reduce((acc, camera) => {
      const key = camera.zone_id || 'unassigned';
      acc[key] = [...(acc[key] || []), camera];
      return acc;
    }, {})
  ), [cameras]);

  const toEditForm = (zone) => {
    const detectionType = zoneDetectionType(zone);
    const mappedCamera = cameras.find((cam) => cam.zone_id === zone.id);
    return {
      zone_name: zone.zone_name,
      location: zone.location,
      camera_id: mappedCamera?.id || '',
      detection_type: detectionType,
      time_threshold: String(zone.time_threshold),
      monitored_classes: (zone.monitored_classes || []).join(', '),
      density_threshold: zone.density_threshold ?? '',
      unattended_threshold_seconds: zone.unattended_threshold_seconds ?? '',
      alert_cooldown_seconds: zone.alert_cooldown_seconds ?? '',
      severity: zone.severity || DETECTION_TYPES[detectionType].defaults.severity,
      assigned_team: zone.assigned_team || '',
      detection_enabled: zone.detection_enabled !== false,
    };
  };

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
      // camera_id travels inside the same zone-create request now — the backend
      // creates the zone and assigns the camera in one transaction, so a rejected
      // camera (already active elsewhere) never leaves an orphaned zone behind.
      await axios.post(ZONES_URL, buildZonePayload(form), { headers });
      setForm(emptyForm);
      fetchZones();
      fetchCameras();
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
      fetchCameras();
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
      // camera_id travels inside the same zone-update request — the backend releases
      // the old camera and assigns the new one atomically, so a rejected replacement
      // (camera already active on another rule) leaves the previous assignment intact.
      const res = await axios.put(`${ZONES_URL}/${id}`, buildZonePayload(editForm), { headers });
      setZones((prev) => prev.map((zone) => (zone.id === id ? res.data : zone)));
      setEditId(null);
      fetchCameras();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update zone.');
    }
  };

  const mapCameraFromList = async (zoneId) => {
    const cameraId = cameraPickerByZone[zoneId];
    if (!cameraId) return;
    try {
      // Partial update: only camera_id travels, so the zone's other fields are untouched.
      const res = await axios.put(`${ZONES_URL}/${zoneId}`, { camera_id: cameraId }, { headers });
      setZones((prev) => prev.map((zone) => (zone.id === zoneId ? res.data : zone)));
      setCameraPickerByZone((prev) => ({ ...prev, [zoneId]: '' }));
      fetchCameras();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to map camera to zone.');
    }
  };

  const renderRuleFields = (activeForm, setActiveForm, isEditing = false) => {
    const availableCameras = cameras.filter((cam) => !cam.zone_id || String(cam.id) === String(activeForm.camera_id));
    return (
      <>
        <input className="od-input" placeholder="Zone name" value={activeForm.zone_name} onChange={(event) => setActiveForm((prev) => ({ ...prev, zone_name: event.target.value }))} />
        <input className="od-input" placeholder="Location" value={activeForm.location} onChange={(event) => setActiveForm((prev) => ({ ...prev, location: event.target.value }))} />
        <select className="od-input" value={activeForm.camera_id} onChange={(event) => setActiveForm((prev) => ({ ...prev, camera_id: event.target.value }))}>
          <option value="">No camera assigned yet</option>
          {availableCameras.map((cam) => <option key={cam.id} value={cam.id}>{cam.camera_code} - {cam.camera_name}</option>)}
        </select>
        <select className="od-input" value={activeForm.detection_type} onChange={(event) => setActiveForm((prev) => applyDetectionDefaults(prev, event.target.value))}>
          {Object.entries(DETECTION_TYPES).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}
        </select>
        <input className="od-input" type="number" min="1" placeholder="Threshold (minutes)" value={activeForm.time_threshold} onChange={(event) => setActiveForm((prev) => ({ ...prev, time_threshold: event.target.value }))} />
        <select className="od-input" value={activeForm.severity} onChange={(event) => setActiveForm((prev) => ({ ...prev, severity: event.target.value }))}>
          {SEVERITIES.map((severity) => <option key={severity}>{severity}</option>)}
        </select>
        <label className="od-checkbox-row">
          <input type="checkbox" checked={activeForm.detection_enabled} onChange={(event) => setActiveForm((prev) => ({ ...prev, detection_enabled: event.target.checked }))} />
          Detection enabled
        </label>
        <details className="od-advanced-details">
          <summary>Advanced settings</summary>
          <input className="od-input" placeholder="Raw monitored classes" value={activeForm.monitored_classes} onChange={(event) => setActiveForm((prev) => ({ ...prev, monitored_classes: event.target.value }))} />
          <input className="od-input" type="number" min="1" placeholder="Density threshold" value={activeForm.density_threshold} onChange={(event) => setActiveForm((prev) => ({ ...prev, density_threshold: event.target.value }))} />
          <input className="od-input" type="number" min="1" placeholder="Unattended threshold (seconds)" value={activeForm.unattended_threshold_seconds} onChange={(event) => setActiveForm((prev) => ({ ...prev, unattended_threshold_seconds: event.target.value }))} />
          <input className="od-input" type="number" min="1" placeholder="Alert cooldown (seconds)" value={activeForm.alert_cooldown_seconds} onChange={(event) => setActiveForm((prev) => ({ ...prev, alert_cooldown_seconds: event.target.value }))} />
          <input className="od-input" placeholder="Assigned team contact" value={activeForm.assigned_team} onChange={(event) => setActiveForm((prev) => ({ ...prev, assigned_team: event.target.value }))} />
        </details>
        {isEditing && (
          <div className="od-edit-actions">
            <button className="od-btn-save" type="button" onClick={() => handleUpdateZone(editId)}>Save</button>
            <button className="od-btn-cancel" type="button" onClick={() => setEditId(null)}>Cancel</button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main od-main">
        <header className="dashboard-header od-header">
          <div className="header-titles">
            <h1>Detection Setup</h1>
            <p>Create practical object-detection rules without exposing backend tuning by default.</p>
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

        <section className="od-settings-grid od-settings-grid-single">
          <div className="od-card od-settings-card">
            <div className="od-card-heading">
              <div>
                <span>Detection Rules</span>
                <h2>Zones and Camera Mapping</h2>
              </div>
              <strong>{zones.length}</strong>
            </div>

            {canEdit && (
              <form className="od-form od-rule-form" onSubmit={handleCreateZone}>
                {renderRuleFields(form, setForm)}
                {formError && <p className="od-form-error">{formError}</p>}
                <button className="od-btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Detection Rule'}</button>
              </form>
            )}

            <div className="od-zone-list relaxed od-zone-summary-list">
              {zones.length === 0 && <p className="od-empty">No detection rules configured yet.</p>}
              {zones.map((zone) => {
                const zoneCameras = camerasByZone[zone.id] || [];
                const availableCameras = cameras.filter((cam) => !cam.zone_id || cam.zone_id === zone.id);
                const detectionType = zoneDetectionType(zone);
                return (
                  <div key={zone.id}>
                    {editId === zone.id ? (
                      <div className="od-edit-form">
                        {renderRuleFields(editForm, setEditForm, true)}
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
                        <div className="od-zone-summary-grid">
                          <span>Location <strong>{zone.location}</strong></span>
                          <span>Assigned camera <strong>{zoneCameras.map((cam) => cam.camera_code).join(', ') || 'Unassigned'}</strong></span>
                          <span>Detection type <strong>{getDetectionTypeLabel(detectionType)}</strong></span>
                          <span>Threshold <strong>{zone.time_threshold} min</strong></span>
                          <span>Severity <strong>{zone.severity}</strong></span>
                          <span>Status <strong>{zone.detection_enabled ? 'Enabled' : 'Disabled'}</strong></span>
                        </div>
                        {canEdit && (
                          <div className="od-edit-actions od-inline-map">
                            <select className="od-input" value={cameraPickerByZone[zone.id] || ''} onChange={(event) => setCameraPickerByZone((prev) => ({ ...prev, [zone.id]: event.target.value }))}>
                              <option value="">Change assigned camera...</option>
                              {availableCameras.map((cam) => <option key={cam.id} value={cam.id}>{cam.camera_code} - {cam.camera_name}</option>)}
                            </select>
                            <button className="od-btn-save" type="button" onClick={() => mapCameraFromList(zone.id)}>Map</button>
                          </div>
                        )}
                        <details className="od-advanced-details od-zone-details">
                          <summary>Technical details</summary>
                          <p className="od-zone-meta">Classes <span>{(zone.monitored_classes || []).join(', ') || 'none set'}</span></p>
                          <p className="od-zone-meta">Cooldown <span>{zone.alert_cooldown_seconds ?? 'n/a'}s</span> - Density <span>{zone.density_threshold ?? 'n/a'}</span> - Unattended <span>{zone.unattended_threshold_seconds ?? 'n/a'}s</span></p>
                          <p className="od-zone-meta">Assigned team <span>{zone.assigned_team || 'unassigned'}</span></p>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
