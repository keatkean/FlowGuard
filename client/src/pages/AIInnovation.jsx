import React from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import '../css/AIInnovation.css';

const AIInnovation = () => {
  return (
    <div className="ai-page-wrapper">
      <NavBar />
      <main className="ai-main-content">
        <header className="ai-hero">
          <h1 className="gradient-text">FlowGuard AI Monitoring</h1>
          <p>FlowGuard combines biometric access verification and configurable object monitoring to support continuous facility oversight.</p>
        </header>
        <section className="vision-showcase">
          <div className="vision-container">
            <div className="camera-feed mock-feed-1">
              <div className="bounding-box hygiene-box">
                <span className="confidence-tag">Authorised Access</span>
              </div>
              <div className="feed-label">Illustrative PoC View - Monitoring Zone Active</div>
            </div>
            <div className="camera-feed mock-feed-2">
              <div className="bounding-box alert-box">
                <span className="confidence-tag alert-tag">Unattended Object Alert</span>
              </div>
              <div className="feed-label">Illustrative PoC View - Unknown Person Alert</div>
            </div>
          </div>
        </section>
        <section className="ai-feature-grid">
          <div className="ai-feature-card">
            <h3>Biometric Access Monitoring</h3>
            <p>Recognises enrolled personnel, performs motion-liveness verification and records access outcomes.</p>
          </div>
          <div className="ai-feature-card">
            <h3>Object & Zone Monitoring</h3>
            <p>Applies configurable monitoring rules to camera-linked zones and surfaces active alerts.</p>
          </div>
          <div className="ai-feature-card">
            <h3>Operational Response</h3>
            <p>Routes access events, alerts, attendance and support records to authorised operational dashboards.</p>
          </div>
        </section>
        <section className="ai-cta-section">
          <h2>Ready to see it in action?</h2>
          <p>Access the authenticated proof-of-concept portal for role-protected operational workflows.</p>
          <Link to="/login" className="cta-button">Launch Client Portal ?</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AIInnovation;
