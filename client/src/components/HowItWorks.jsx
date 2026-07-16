import React from 'react';

const HowItWorks = () => {
  const steps = [
    { title: "Configure", text: "FM enrols personnel, registers cameras, creates monitored zones and manages loading-bay operations." },
    { title: "Monitor", text: "Camera frames and operational actions are processed through FlowGuard's facial and object-detection services." },
    { title: "Respond", text: "Relevant access events, alerts, bookings, incidents and support requests are surfaced to authorised personnel." },
    { title: "Review", text: "FM reviews attendance, security logs, object alerts, incidents and service records through role-protected dashboards." }
  ];

  return (
    <section id="how-it-works" className="features-section how-section">
      <div className="features-header">
        <h2 className="section-title">How FlowGuard Works</h2>
      </div>
      <div className="features-grid workflow-grid">
        {steps.map((step, index) => (
          <div key={step.title} className="feature-card workflow-card" data-testid="workflow-step">
            <span className="step-index">{index + 1}</span>
            <h3 className="feature-title">{step.title}</h3>
            <p className="feature-description">{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default HowItWorks;
