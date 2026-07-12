import React from 'react';

const Roadmap = () => {
  const milestones = [
    { date: "Phase 1", title: "Core Platform", desc: "Authentication and RBAC, facial enrolment and access workflows, camera and monitoring-zone setup." },
    { date: "Phase 2", title: "Operational Integration", desc: "Attendance, object alerts, Smart Logistics, security review, helpdesk and incident support." },
    { date: "Phase 3", title: "PoC Validation", desc: "Raspberry Pi camera integration, real-time tracking and motion liveness, automated tests, usability and security review, deployment-readiness assessment." }
  ];

  return (
    <section id="roadmap" className="roadmap-section">
      <div className="roadmap-header">
        <h2 className="section-title">PoC Development Journey</h2>
        <p className="section-subtitle">Current project progress is documented as a proof-of-concept journey.</p>
      </div>
      <div className="timeline-container">
        {milestones.map((item) => (
          <div key={item.title} className="timeline-item">
            <div className="timeline-dot"></div>
            <div className="timeline-content">
              <span className="timeline-date">{item.date}</span>
              <h3 className="timeline-title">{item.title}</h3>
              <p className="timeline-desc">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Roadmap;
