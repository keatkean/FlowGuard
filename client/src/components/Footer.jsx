import React from 'react';
import { Link } from 'react-router-dom';
import LogoIcon from './LogoIcon';

const Footer = () => {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        <div className="footer-column">
          <div className="footer-logo">
            <LogoIcon size={32} />
            <span>FlowGuard</span>
          </div>
          <p className="footer-desc">FlowGuard - AI-assisted access, asset and operational monitoring.</p>
        </div>
        <div className="footer-column">
          <h4>Solutions</h4>
          <ul>
            <li><Link to="/innovation">Access Management</Link></li>
            <li><Link to="/innovation">Object & Zone Monitoring</Link></li>
            <li><Link to="/innovation">Smart Logistics</Link></li>
            <li><Link to="/innovation">Operational Support</Link></li>
          </ul>
        </div>
        <div className="footer-column">
          <h4>Company</h4>
          <ul>
            <li><Link to="/">Overview</Link></li>
            <li><Link to="/innovation">Capabilities</Link></li>
            <li><Link to="/system-health">Platform Overview</Link></li>
          </ul>
        </div>
        <div className="footer-column">
          <h4>Status</h4>
          <p className="contact-text">Academic Proof of Concept</p>
          <p className="contact-text">Integrated demo modules</p>
          <p className="contact-sub">Human review preserved</p>
        </div>
      </div>
      <div className="footer-bottom">
        <p>(c) 2026 FlowGuard. Academic Proof of Concept.</p>
      </div>
    </footer>
  );
};

export default Footer;
