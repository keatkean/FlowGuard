import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../css/Login.css';
import LogoIcon from '../components/LogoIcon';
import { API_BASE_URL } from '../constants/api';

// Landing page for the emailed link: /reset-password?token=...
// Posts the raw token + new password to the backend, which matches it against
// the stored SHA-256 hash (15-minute expiry) and revokes all existing sessions.
const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/user/reset-password`, { token, newPassword });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Password reset failed. Please request a new link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <NavBar />

      <div className="login-content-area">
        <div className="login-container">
          <div className="login-box">
            <header className="login-header">
              <div className="login-logo-centered">
                <LogoIcon size={48} />
              </div>
              <h1>Reset Password</h1>
              <p>Choose a new password for your FlowGuard account.</p>
            </header>

            {!token ? (
              <div className="success-state">
                <h3>Invalid Link</h3>
                <p className="success-text">
                  This reset link is missing its security token. Request a fresh link from the recovery page.
                </p>
                <Link to="/forgot-password" className="back-to-login">Request a new link</Link>
              </div>
            ) : done ? (
              <div className="success-state">
                <div className="success-icon">✓</div>
                <h3>Password Reset</h3>
                <p className="success-text">
                  Your password has been updated and all previous sessions were signed out. Redirecting you to login…
                </p>
              </div>
            ) : (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="input-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {errorMessage && (
                  <p role="alert" style={{ color: '#f87171', fontSize: '0.85rem' }}>{errorMessage}</p>
                )}

                <button type="submit" className="login-submit-btn" disabled={submitting}>
                  {submitting ? 'Resetting…' : 'Reset Password'} <span className="button-icon"></span>
                </button>
              </form>
            )}

            <footer className="login-footer">
              <div className="auth-links">
                <Link to="/login" className="back-to-login">
                  Back to Client Portal Login
                </Link>
              </div>
            </footer>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ResetPassword;
