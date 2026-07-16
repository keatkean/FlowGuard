import React from 'react';

const ImpactStats = () => {
  return (
    <section className="stats-container" id="mission">
      <div className="impact-header">
        <h2 className="section-title">Why FlowGuard</h2>
        <p className="section-subtitle">
          Industrial facilities may rely on separate manual workflows for access checks,
          attendance, unattended-object monitoring, loading-bay coordination, security
          review and tenant support.
        </p>
        <p className="section-subtitle section-subtitle-spaced">
          FlowGuard centralises these workflows and surfaces events that require human attention.
        </p>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Reduce repetitive manual monitoring</div>
          <div className="stat-subtext">Designed to support the project goal of reducing repetitive manual monitoring.</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Improve visibility across access, assets and logistics</div>
          <div className="stat-subtext">Shared dashboards bring related operational records into role-protected views.</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Preserve human review for security decisions</div>
          <div className="stat-subtext">The PoC surfaces access events, alerts and support records for authorised review.</div>
        </div>
      </div>
    </section>
  );
};

export default ImpactStats;
