import React from 'react';
import { Link } from 'react-router-dom'; 

const Hero = () => {
  return (
    <section className="hero-container" data-testid="homepage-hero">
      <span className="hero-badge">Academic Proof of Concept</span>
      <h1 className="hero-title">FlowGuard</h1>
      <p className="hero-subheading">
        AI-assisted asset, access and manpower monitoring for safer industrial operations.
      </p>
      <p className="hero-description">
        FlowGuard combines facial access management, camera-based object monitoring,
        loading-bay coordination and operational support in one integrated proof of concept.
      </p>
      <div className="hero-actions hero-actions-single">
        <Link to="/innovation" className="hero-button">
          Explore Capabilities
          <svg className="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </Link>
      </div>
    </section>
  );
};

export default Hero;
