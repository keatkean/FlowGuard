import React from 'react';

const FeatureCards = () => {
  const features = [
    {
      title: "Facial Recognition & Access Management",
      description: "Enrol authorised personnel, verify identity and motion liveness at facility gates, record attendance and review suspicious access events.",
      items: ["Face ID enrolment", "Gate Scanner", "V-Patrol", "Daily Attendance", "Security Review", "Suspended/unknown-person handling", "Privacy-conscious off-boarding"]
    },
    {
      title: "Object Detection & Space Management",
      description: "Register cameras, configure monitored zones and create detection rules for camera-based operational alerts.",
      items: ["Camera inventory", "Monitoring zones", "Unattended-object thresholds", "Detection enable/disable", "Severity configuration", "Active alerts", "Alert status updates"]
    },
    {
      title: "Smart Logistics & Loading-Bay Management",
      description: "Coordinate delivery bookings, loading-bay schedules, Driver Passes and gate arrival or completion workflows.",
      items: ["Booking creation", "Time-slot conflict checking", "Bay A / Bay B scheduling", "Booking reference", "Public Driver Pass", "Gate entry and exit", "Mock-safe WhatsApp notifications", "Next-driver notification"]
    },
    {
      title: "AI Helpdesk & Incident Support",
      description: "Support tenants through AI-assisted helpdesk conversations, ticket escalation, security review and incident-resolution workflows.",
      items: ["Chat transcripts", "Unresolved-request escalation", "Support tickets", "Knowledge base", "Incident dashboard", "Resolution notes"]
    }
  ];

  return (
    <section id="technology" className="features-section">
      <div className="features-header">
        <h2 className="section-title">Actual Group Modules</h2>
        <p className="section-subtitle">Four implemented areas make up the current FlowGuard proof of concept.</p>
      </div>
      <div className="features-grid module-grid">
        {features.map((f) => (
          <div key={f.title} className="feature-card module-card" data-testid="module-card">
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-description">{f.description}</p>
            <ul className="feature-list">
              {f.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};

export default FeatureCards;
