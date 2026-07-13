import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'; 
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import LogoIcon from '../components/LogoIcon';
import PasswordInput from '../components/PasswordInput';
import '../css/Login.css';
import '../css/DriverPass.css';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const { executeRecaptcha } = useGoogleReCaptcha();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);

    if (!executeRecaptcha) {
      setError("Security system is still loading. Please try again in a second.");
      return;
    }

    try {
      const token = await executeRecaptcha('login_submit');
      
      // 🎯 THE FIX: Get the IP dynamically so phones can talk to the laptop
      const currentIP = window.location.hostname;

      const res = await axios.post(`/user/login`, { 
        email, 
        password,
        recaptchaToken: token 
      });

      // Save credentials to local storage
      localStorage.setItem("accessToken", res.data.token);
      localStorage.setItem("userRole", res.data.user.role);
      localStorage.setItem("userName", res.data.user.name);
      localStorage.setItem("userId", res.data.user.id);
      
      console.log(`Authenticated as ${res.data.user.role}. Welcome to FlowGuard.`);
      
      // --- THE NEW BIOMETRIC LOCKOUT LOGIC ---
      if (res.data.user.isEnrolled) {
          // They have a face vector. Welcome to the factory.
          navigate('/dashboard'); 
      } else {
          // First time? Go take your 3 angles.
          navigate('/enrollment'); 
      }

    } catch (err) {
      setError(err.response?.data?.message || "Authentication failed");
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
              <h1>Sign in to FlowGuard</h1>
              <p>Harrison Food Factory IoT Portal</p>
            </header>

            <form className="login-form" onSubmit={handleLogin}>
              {error && <div className="error-message" style={{color: 'red', marginBottom: '10px'}}>{error}</div>}
              
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

              <div className="input-group">
                <label>Access Key</label>
                <PasswordInput
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div className="forgot-link-wrapper">
                  <Link to="/forgot-password" className="forgot-link">Forgot Key?</Link>
                </div>
              </div>

              <button type="submit" className="login-submit-btn">
                Authenticate <span className="button-icon">→</span>
              </button>
            </form>

            <footer className="login-footer">
              <p className="security-badge">Protected by FlowGuard AI Monitoring</p>
              <div className="auth-links">
                <Link to="/register">New to FlowGuard?</Link>
              </div>
            </footer>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;