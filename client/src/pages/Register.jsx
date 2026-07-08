import React, { useState } from 'react'; 
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios'; 
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'; 
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import LogoIcon from '../components/LogoIcon';
import PasswordInput from '../components/PasswordInput';
import '../css/Login.css';

const Register = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Staff'); // Defaulting to Staff
  const [tenantCode, setTenantCode] = useState(''); 
  const [error, setError] = useState(null);

  const { executeRecaptcha } = useGoogleReCaptcha();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    if (!executeRecaptcha) {
      setError("Security system is still loading. Please try again.");
      return;
    }

    try {
      const token = await executeRecaptcha('register_submit');

      // 1. Updated Payload: tenantCode is now required for both Staff AND Tenant roles
      const payload = { 
        name, 
        email, 
        password, 
        role,
        tenantCode: (role === 'Staff' || role === 'Tenant') ? tenantCode : null, 
        recaptchaToken: token 
      };

      const res = await axios.post('/user/register', payload);
      console.log("Registration successful.");
      navigate('/login');

    } catch (err) {
      // Cleaner error handling to prevent React objects-in-render crash
      const errorData = err.response?.data?.errors;
      let displayMessage = "Registration failed. Please check your credentials.";

      if (Array.isArray(errorData) && errorData.length > 0) {
        displayMessage = typeof errorData[0] === 'object' ? errorData[0].message : errorData[0];
      }
      
      setError(displayMessage);
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
              <h1>Request Access</h1>
              <p>Register for authorization to the FlowGuard network.</p>
            </header>

            <form className="login-form" onSubmit={handleRegister}>
              {error && (
                <div className="error-message" style={{ color: '#fb7185', marginBottom: '15px', fontSize: '0.875rem', background: 'rgba(251, 113, 133, 0.1)', padding: '10px', borderRadius: '6px' }}>
                  {String(error)}
                </div>
              )}
              
              <div className="input-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  placeholder="Enter your full name" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required 
                />
              </div>

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
                <label>Create Access Key</label>
                <PasswordInput
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength="8"
                />
              </div>

              <div className="input-group">
                <label>Account Type</label>
                <select 
                  className="role-select"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    setTenantCode(''); // Clear code when switching roles
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#1e293b', color: 'white', border: '1px solid #334155' }}
                >
                  <option value="Staff">Factory Staff</option>
                  <option value="Tenant">Unit Owner / Tenant</option>
                  {/* FM is removed for security; admins are created internally */}
                </select>
              </div>

              {/* 2. DYNAMIC INPUT: Label changes based on selection */}
              <div className="input-group" style={{ animation: 'fadeIn 0.3s ease-in-out', marginTop: '15px', marginBottom: '15px' }}>
                <label>
                  {role === 'Staff' ? "Unit Registration Code" : "One-Time Invitation Code"}
                </label>
                <input 
                  type="text" 
                  placeholder={role === 'Staff' ? "e.g. FLOW-XXXXXX" : "e.g. INVITE-XXXXXX"} 
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value)}
                  required
                  style={{ borderColor: '#3b82f6', outline: 'none', boxShadow: '0 0 0 1px #3b82f6' }}
                />
                <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '5px', display: 'block' }}>
                  {role === 'Staff' 
                    ? "Ask your unit manager for this code." 
                    : "Required for first-time setup. Contact the FM office."}
                </small>
              </div>

              <button type="submit" className="login-submit-btn">
                Submit Request <span className="button-icon">→</span>
              </button>
            </form>

            <footer className="login-footer">
              <p className="security-badge">Subject to Industrial Security Protocol Approval</p>
              <div className="auth-links">
                <Link to="/login">Already authorized?</Link>
              </div>
            </footer>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Register;