import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [autoRecord, setAutoRecord] = useState(true);
  const [ppeStrictness, setPpeStrictness] = useState(85);
  const currentUserId = localStorage.getItem("userId");
  const currentUserName = localStorage.getItem("userName");
  const role = localStorage.getItem("userRole");
  const isFM = role === 'FM';

  const handleSelfReEnroll = () => {
    const params = new URLSearchParams({
      userId: currentUserId,
      name: currentUserName || 'My profile',
      returnTo: '/settings'
    });
    navigate(`/enrollment?${params.toString()}`);
  };

  return (
    <div className="dashboard-layout">
      {/* 2. Replace the entire <aside> block with this one line */}
      <Sidebar />

      {/* --- MAIN SETTINGS CONTENT --- */}
      <main className="dashboard-main">
        <header className="dashboard-header settings-header">
          <div className="header-titles">
            <h1>{isFM ? 'System Configuration' : 'Settings'}</h1>
            <p>
              {isFM
                ? 'Manage AI thresholds, camera networks, and alert routing'
                : 'Manage your personal biometric profile and access settings.'}
            </p>
          </div>
        </header>

        <div className="settings-grid">

          {/* --- FM-only system administration --- */}
          {isFM && (
            <>
          {/* AI Configuration Card */}
          <section className="settings-card">
            <div className="card-header">
              <h3>🧠 FlowGuard AI Engine</h3>
              <p>Adjust the machine learning detection parameters.</p>
            </div>
            
            <div className="setting-row">
              <div className="setting-info">
                <h4>PPE Detection Strictness</h4>
                <p>Minimum confidence required to flag an anomaly.</p>
              </div>
              <div className="setting-control slider-control">
                <span className="slider-value">{ppeStrictness}%</span>
                <input 
                  type="range" min="50" max="99" 
                  value={ppeStrictness} 
                  onChange={(e) => setPpeStrictness(e.target.value)} 
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <h4>Auto-Record on Incident</h4>
                <p>Save 30 seconds of footage before and after a triggered alert.</p>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input type="checkbox" checked={autoRecord} onChange={() => setAutoRecord(!autoRecord)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          {/* Network & Alerts Card */}
          <section className="settings-card">
            <div className="card-header">
              <h3>📡 Network & Notifications</h3>
              <p>Manage how FlowGuard communicates with the floor managers.</p>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <h4>Push Notifications to Mobile</h4>
                <p>Instantly alert floor supervisors of hygiene violations.</p>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input type="checkbox" checked={alertsEnabled} onChange={() => setAlertsEnabled(!alertsEnabled)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <h4>Camera Feed Quality</h4>
                <p>Lower quality saves bandwidth but reduces AI accuracy.</p>
              </div>
              <div className="setting-control">
                <select className="dark-select">
                  <option>1080p (Standard)</option>
                  <option>4K (High AI Accuracy)</option>
                  <option>720p (Bandwidth Saver)</option>
                </select>
              </div>
            </div>
          </section>
            </>
          )}

          {/* --- Biometric Profile: available to ALL authenticated users --- */}
          <section className="settings-card">
            <div className="card-header">
              <h3>Biometric Profile</h3>
              <p>Refresh your Face ID if gate recognition becomes unreliable.</p>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <h4>Face ID Re-enrollment</h4>
                <p>Use either camera capture or manual photo upload to replace your current facial vector.</p>
              </div>
              <div className="setting-control">
                <button className="save-btn" onClick={handleSelfReEnroll}>Re-enroll My Face ID</button>
              </div>
            </div>
          </section>

          {/* --- FM-only: Danger Zone + system save --- */}
          {isFM && (
            <>
          {/* Danger Zone Card */}
          <section className="settings-card danger-zone">
            <div className="card-header">
              <h3 className="text-red">⚠️ Danger Zone</h3>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <h4>Reboot Network Nodes</h4>
                <p>Force restart all 128 active CCTV cameras. Expect 3 minutes of downtime.</p>
              </div>
              <div className="setting-control">
                <button className="danger-btn">Initiate Reboot</button>
              </div>
            </div>
          </section>

          <div className="settings-actions">
            <button className="save-btn">Save Changes</button>
          </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
};

export default Settings;
