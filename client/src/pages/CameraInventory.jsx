import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import UiIcon from '../components/UiIcon';
import '../css/Dashboard.css';
import '../css/Cameras.css';

const emptyCamera = {
  id: '',
  zone: '',
  status: 'Live',
  video: '/videos/loading.mp4',
  model: 'YOLOv9-L',
  resolution: '1080p',
  bitrate: '4.8 Mbps',
  detections: 0,
  uptime: '47h 22m',
  lastEvent: 'Calibration check passed',
};

const starterCameras = [
  { id: 'CAM-01', zone: 'Zone A - Loading Bay', status: 'Live', video: '/videos/loading.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '4.2 Mbps', detections: 1, uptime: '23h 14m', lastEvent: 'Forklift lane clear' },
  { id: 'CAM-02', zone: 'Zone B - Warehouse Floor', status: 'Warning', video: '/videos/assembly.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '4.8 Mbps', detections: 2, uptime: '47h 22m', lastEvent: 'PPE violation detected' },
  { id: 'CAM-03', zone: 'Zone C - Restricted Storage', status: 'Critical', video: '/videos/chemical_storage.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '5.1 Mbps', detections: 1, uptime: '12h 06m', lastEvent: 'Unauthorized object detected' },
  { id: 'CAM-04', zone: 'Zone D - Exit Corridor', status: 'Critical', video: '/videos/command.mp4', model: 'YOLOv9-L', resolution: '1080p', bitrate: '4.6 Mbps', detections: 1, uptime: '31h 40m', lastEvent: 'Emergency exit blocked' },
  { id: 'CAM-05', zone: 'Zone E - Main Gate', status: 'Live', video: '/videos/entrance.mp4', model: 'YOLOv8-N', resolution: '720p', bitrate: '2.9 Mbps', detections: 0, uptime: '68h 11m', lastEvent: 'Access lane normal' },
  { id: 'CAM-06', zone: 'Zone F - Packaging', status: 'Live', video: '/videos/packaging.mp4', model: 'YOLOv8-N', resolution: '1080p', bitrate: '3.7 Mbps', detections: 0, uptime: '19h 03m', lastEvent: 'Operator viewport opened' },
];

export default function CameraInventory() {
  const [cameraFeeds, setCameraFeeds] = useState(starterCameras);
  const [form, setForm] = useState(emptyCamera);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [formError, setFormError] = useState('');

  const filteredCameras = useMemo(() => (
    cameraFeeds.filter((cam) => `${cam.id} ${cam.zone} ${cam.status}`.toLowerCase().includes(query.toLowerCase()))
  ), [cameraFeeds, query]);
  const inventoryStats = useMemo(() => ({
    total: cameraFeeds.length,
    live: cameraFeeds.filter((cam) => cam.status === 'Live').length,
    attention: cameraFeeds.filter((cam) => ['Warning', 'Critical'].includes(cam.status)).length,
  }), [cameraFeeds]);

  const startCreate = () => {
    const nextNumber = String(cameraFeeds.length + 1).padStart(2, '0');
    setForm({ ...emptyCamera, id: `CAM-${nextNumber}` });
    setEditingId(null);
    setFormError('');
  };

  const startEdit = (cam) => {
    setForm({ ...cam });
    setEditingId(cam.id);
    setFormError('');
  };

  const resetForm = () => {
    setForm(emptyCamera);
    setEditingId(null);
    setFormError('');
  };

  const saveCamera = (event) => {
    event.preventDefault();
    if (!form.id.trim() || !form.zone.trim()) {
      setFormError('Camera ID and zone are required.');
      return;
    }

    const normalizedCamera = {
      ...form,
      id: form.id.trim().toUpperCase(),
      zone: form.zone.trim(),
      detections: Number(form.detections || 0),
    };

    const duplicate = cameraFeeds.some((cam) => cam.id === normalizedCamera.id && cam.id !== editingId);
    if (duplicate) {
      setFormError('That camera ID already exists.');
      return;
    }

    setCameraFeeds((prev) => (
      editingId
        ? prev.map((cam) => (cam.id === editingId ? normalizedCamera : cam))
        : [normalizedCamera, ...prev]
    ));
    resetForm();
  };

  const deleteCamera = (id) => {
    setCameraFeeds((prev) => prev.filter((cam) => cam.id !== id));
    if (editingId === id) resetForm();
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main cameras-main">
        <header className="dashboard-header cameras-header">
          <div className="header-titles">
            <h1>Camera Inventory</h1>
            <p>Maintain camera locations, stream sources, and operational metadata away from the live wall.</p>
          </div>
          <div className="camera-header-actions">
            <Link className="camera-secondary-link" to="/cameras">
              <UiIcon name="arrowBack" />
              Live Wall
            </Link>
            <button className="camera-primary-btn" onClick={startCreate} type="button">
              <UiIcon name="add" />
              Add Camera
            </button>
          </div>
        </header>

        <section className="camera-inventory-summary" aria-label="Camera inventory summary">
          <div>
            <UiIcon name="camera" />
            <span>Total Cameras</span>
            <strong>{inventoryStats.total}</strong>
          </div>
          <div className="healthy">
            <UiIcon name="check" />
            <span>Live</span>
            <strong>{inventoryStats.live}</strong>
          </div>
          <div className="attention">
            <UiIcon name="warning" />
            <span>Need Attention</span>
            <strong>{inventoryStats.attention}</strong>
          </div>
        </section>

        <section className="camera-admin-layout">
          <div className="camera-inventory-list">
            <div className="camera-section-title">
              <div>
                <h2>Camera Register</h2>
                <p>{filteredCameras.length} cameras visible - edit records without disturbing monitoring.</p>
              </div>
              <label className="camera-search compact">
                <UiIcon name="search" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory..." />
              </label>
            </div>

            <div className="camera-table">
              {filteredCameras.map((cam) => (
                <article key={cam.id} className="camera-row-card">
                  <div className="camera-row-main">
                    <span className="camera-row-icon">
                      <UiIcon name="camera" />
                    </span>
                    <div>
                      <h3>{cam.id}</h3>
                      <p>{cam.zone}</p>
                    </div>
                  </div>
                  <div className="camera-row-meta">
                    <span className={`camera-status-pill ${cam.status.toLowerCase()}`}>{cam.status}</span>
                    <span>{cam.model}</span>
                    <span>{cam.resolution}</span>
                    <span>{cam.video.replace('/videos/', '').replace('.mp4', '')}</span>
                  </div>
                  <div className="camera-row-actions">
                    <button type="button" onClick={() => startEdit(cam)} aria-label={`Edit ${cam.id}`}>
                      <UiIcon name="edit" />
                    </button>
                    <button type="button" className="danger" onClick={() => deleteCamera(cam.id)} aria-label={`Delete ${cam.id}`}>
                      <UiIcon name="delete" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form className="camera-crud-card camera-admin-form" onSubmit={saveCamera}>
            <div className="camera-panel-heading">
              <div>
                <span className="camera-kicker">Inventory Form</span>
                <h2>{editingId ? 'Update Camera' : 'Create Camera'}</h2>
              </div>
              <button type="button" className="camera-icon-btn" onClick={resetForm} aria-label="Clear camera form">
                <UiIcon name="close" />
              </button>
            </div>
            <div className="camera-form-grid">
              <label>Camera ID<input value={form.id} onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))} placeholder="CAM-07" /></label>
              <label>Status<select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}><option>Live</option><option>Warning</option><option>Critical</option><option>Offline</option></select></label>
              <label className="wide">Zone / Location<input value={form.zone} onChange={(event) => setForm((prev) => ({ ...prev, zone: event.target.value }))} placeholder="Zone G - Dispatch" /></label>
              <label>Video Source<select value={form.video} onChange={(event) => setForm((prev) => ({ ...prev, video: event.target.value }))}><option value="/videos/loading.mp4">Loading Bay</option><option value="/videos/assembly.mp4">Assembly Line</option><option value="/videos/chemical_storage.mp4">Chemical Storage</option><option value="/videos/command.mp4">Command Center</option><option value="/videos/entrance.mp4">Main Gate</option><option value="/videos/packaging.mp4">Packaging</option></select></label>
              <label>Detections<input type="number" min="0" value={form.detections} onChange={(event) => setForm((prev) => ({ ...prev, detections: event.target.value }))} /></label>
            </div>
            {formError && <p className="camera-form-error">{formError}</p>}
            <button className="camera-primary-btn full" type="submit">
              <UiIcon name="check" />
              {editingId ? 'Save Changes' : 'Create Camera'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
