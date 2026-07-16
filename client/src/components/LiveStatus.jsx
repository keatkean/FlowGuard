import React from 'react';

const LiveStatus = () => {
  const capabilityData = [
    {
      label: "Access & Attendance",
      value: "Facial enrolment, motion-liveness verification, gate attendance and access audit records.",
      status: "Integrated"
    },
    {
      label: "Object & Zone Monitoring",
      value: "Camera inventory, configurable monitoring zones, detection thresholds and active alert review.",
      status: "PoC Ready"
    },
    {
      label: "Smart Logistics",
      value: "Loading-bay bookings, Driver Passes, gate arrival/completion and driver notifications.",
      status: "Demo Available"
    },
    {
      label: "Operational Support",
      value: "Security review, incident handling, AI-helpdesk transcripts and support-ticket resolution.",
      status: "Integrated"
    }
  ];

  return (
    <section className="live-status-section">
      <div className="status-header">
        <h2 className="status-title">PoC Capability Snapshot</h2>
        <div className="live-indicator">Academic Demo</div>
      </div>
      <div className="status-grid">
        {capabilityData.map((sensor) => (
          <div key={sensor.label} className="sensor-card">
            <span className="sensor-label">{sensor.label}</span>
            <p className="sensor-value sensor-copy">{sensor.value}</p>
            <span className="sensor-tag active">{sensor.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default LiveStatus;
