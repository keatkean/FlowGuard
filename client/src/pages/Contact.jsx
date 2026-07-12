import React, { useState } from 'react';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import "../css/Contact.css";

const Contact = () => {
  const [notice, setNotice] = useState("Demo enquiry form - no message will be transmitted.");

  return (
    <div className="contact-page-wrapper">
      <NavBar />
      <main className="contact-main">
        <div className="contact-header">
          <h2 className="section-title">Academic Proof of Concept</h2>
          <p className="section-subtitle">Developed for an industrial asset and manpower monitoring problem statement.</p>
        </div>
        <section className="contact-container">
          <div className="contact-info">
            <h2>FlowGuard PoC</h2>
            <div className="info-item">
              <div className="info-icon">FG</div>
              <div className="info-text">
                <strong>Project Scope</strong>
                <p>Public overview plus authenticated demo workflows.</p>
              </div>
            </div>
            <div className="info-item">
              <div className="info-icon">POC</div>
              <div className="info-text">
                <strong>Status</strong>
                <p>Academic proof of concept; not a production support channel.</p>
              </div>
            </div>
          </div>
          <form className="contact-form" onSubmit={(e) => { e.preventDefault(); setNotice("Demo enquiry form - no message will be transmitted."); }}>
            <p className="demo-form-notice">{notice}</p>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="Enter your full name" required />
            </div>
            <div className="form-group">
              <label>Work Email</label>
              <input type="email" placeholder="name@example.com" required />
            </div>
            <div className="form-group">
              <label>Inquiry Type</label>
              <select required defaultValue="">
                <option value="" disabled>Select Inquiry Type</option>
                <option value="overview">PoC Overview</option>
                <option value="capabilities">Capabilities</option>
                <option value="technology">Technology Stack</option>
              </select>
            </div>
            <div className="form-group">
              <label>Your Message</label>
              <textarea placeholder="Demo enquiry details" required></textarea>
            </div>
            <button type="submit" className="contact-submit-btn">Review Demo Notice</button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
