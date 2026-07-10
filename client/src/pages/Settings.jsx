import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Dashboard.css';
import '../css/Settings.css';
import { API_BASE_URL } from '../constants/api';

const Settings = () => {
  const navigate = useNavigate();
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [autoRecord, setAutoRecord] = useState(true);
  const [ppeStrictness, setPpeStrictness] = useState(85);
  const currentUserId = localStorage.getItem("userId");
  const currentUserName = localStorage.getItem("userName");
  const role = localStorage.getItem("userRole");
  const isFM = role === 'FM';

  // Change Password (all authenticated users)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState(null); // { type: 'error'|'success', text }
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSelfReEnroll = () => {
    const params = new URLSearchParams({
      userId: currentUserId,
      name: currentUserName || 'My profile',
      returnTo: '/settings'
    });
    navigate(`/enrollment?${params.toString()}`);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'All three password fields are required.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordMessage({ type: 'error', text: 'New password must be different from the current password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setChangingPassword(true);
    try {
      const token = localStorage.getItem('accessToken');
      await axios.put(`${API_BASE_URL}/user/change-password`, {
        currentPassword,
        newPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // The backend revoked every existing session (tokenVersion bump), so the
      // current token is dead too — clear the session and require a fresh login.
      setPasswordMessage({ type: 'success', text: 'Password changed. Redirecting to login…' });
      localStorage.clear();
      navigate('/login', { state: { notice: 'Password changed successfully. Please log in with your new password.' } });
    } catch (err) {
      const text = err.response?.data?.message || 'Password change failed. Please try again.';
      setPasswordMessage({ type: 'error', text });
    } finally {
      setChangingPassword(false);
    }
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

          {/* --- Account Security: available to ALL authenticated users --- */}
          <section className="settings-card">
            <div className="card-header">
              <h3>🔐 Account Security</h3>
              <p>Change your FlowGuard sign-in password. You will be logged out of all devices.</p>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="setting-row">
                <div className="setting-info">
                  <h4>Current Password</h4>
                </div>
                <div className="setting-control">
                  <input
                    type="password"
                    className="dark-select"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    aria-label="Current Password"
                  />
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <h4>New Password</h4>
                  <p>Minimum 8 characters, different from your current password.</p>
                </div>
                <div className="setting-control">
                  <input
                    type="password"
                    className="dark-select"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    aria-label="New Password"
                  />
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <h4>Confirm New Password</h4>
                </div>
                <div className="setting-control">
                  <input
                    type="password"
                    className="dark-select"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    aria-label="Confirm New Password"
                  />
                </div>
              </div>
              {passwordMessage && (
                <p
                  role="alert"
                  style={{ color: passwordMessage.type === 'error' ? '#f87171' : '#34d399', padding: '0 4px' }}
                >
                  {passwordMessage.text}
                </p>
              )}
              <div className="setting-row">
                <div className="setting-info" />
                <div className="setting-control">
                  <button type="submit" className="save-btn" disabled={changingPassword}>
                    {changingPassword ? 'Changing…' : 'Change Password'}
                  </button>
                </div>
              </div>
            </form>
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
