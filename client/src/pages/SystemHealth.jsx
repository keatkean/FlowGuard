import React from 'react';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import NodeCard from '../components/NodeCard';
import '../css/SystemHealth.css'; 

const SystemHealth = () => {
  const capabilities = [
    { id: 'FG-01', name: 'Facial Recognition Service', type: 'Identity matching and final same-person confirmation.', status: 'Integrated' },
    { id: 'FG-02', name: 'Motion-Liveness Tracking', type: 'Lightweight face tracking and head-turn challenge verification.', status: 'PoC Ready' },
    { id: 'FG-03', name: 'Object Detection Service', type: 'Camera-based object analysis for configured monitoring zones.', status: 'Demo Available' },
    { id: 'FG-04', name: 'Access & Attendance', type: 'Gate access decisions, attendance transactions and security audit records.', status: 'Integrated' },
    { id: 'FG-05', name: 'Smart Logistics', type: 'Bookings, Driver Passes, bay status and driver notifications.', status: 'PoC Ready' },
    { id: 'FG-06', name: 'Helpdesk & Incident Support', type: 'Support-ticket escalation, security review and incident resolution.', status: 'Integrated' }
  ];

  return (
    <div className="system-health-page">
      <NavBar />
      <main className="health-main">
        <header className="health-header">
          <h1>Platform Overview</h1>
          <p>Overview of the integrated services demonstrated by the FlowGuard proof of concept.</p>
        </header>
        <section className="node-grid">
          {capabilities.map((node) => <NodeCard key={node.id} {...node} />)}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default SystemHealth;
