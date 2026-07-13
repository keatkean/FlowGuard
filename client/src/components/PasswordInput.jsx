import React, { useState } from 'react';
import './PasswordInput.css';

// Reusable password input with a show/hide toggle.
// All props (value, onChange, name, placeholder, required, minLength, className…)
// are spread onto the underlying <input>, so it works with plain controlled
// inputs and Formik field props without changing any validation logic.
// variant="dark" applies the dashboard-modal dark theme (Add Tenant / Add Staff).
// Auth pages (Login/Register) omit it and keep their existing light styling.
const PasswordInput = ({ className = '', variant, ...props }) => {
  const [visible, setVisible] = useState(false);
  const wrapperClass = `password-field${variant === 'dark' ? ' password-field--dark' : ''}`;

  return (
    <div className={wrapperClass}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={className}
      />
      <button
        type="button"                 // never submits the form
        className="password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  );
};

export default PasswordInput;
