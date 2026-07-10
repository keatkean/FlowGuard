import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../css/Login.css';
import LogoIcon from '../components/LogoIcon';
import { API_BASE_URL } from '../constants/api';

const ForgotKey = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSending(true);
    try {
      // The backend ALWAYS answers with the same generic message (no account
      // enumeration) and emails a 15-minute reset link when the email matches.
      await axios.post(`${API_BASE_URL}/user/forgot-password`, { email });
      setIsSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setErrorMessage('Too many recovery requests. Please wait a few minutes and try again.');
      } else {
        setErrorMessage('Recovery service is unreachable right now. Please try again shortly.');
      }
    } finally {
      setSending(false);
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
              <h1>Key Recovery</h1>
              <p>Secure access reset for the Harrison Food Factory.</p>
            </header>

            {!isSubmitted ? (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="input-group">
                  <label>Authorized Email</label>
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {errorMessage && (
                  <p role="alert" style={{ color: '#f87171', fontSize: '0.85rem' }}>{errorMessage}</p>
                )}

                <button type="submit" className="login-submit-btn" disabled={sending}>
                  {sending ? 'Sending…' : 'Send Recovery Link'} <span className="button-icon"></span>
                </button>
              </form>
            ) : (
              <div className="success-state">
                <div className="success-icon">✓</div>
                <h3>Transmission Sent</h3>
                <p className="success-text">
                  If that email matches an authorized FlowGuard profile, you will receive a secure recovery link shortly. The link expires in 15 minutes.
                </p>
              </div>
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

export default ForgotKey;
