import React, { useState } from 'react';

const ContactForm = () => {
  const [formData, setFormData] = useState({ name: '', email: '', message: '', type: 'General' });
  const [notice, setNotice] = useState("Demo enquiry form - no message will be transmitted.");

  const handleSubmit = (e) => {
    e.preventDefault();
    setNotice("Demo enquiry form - no message will be transmitted.");
  };

  return (
    <section className="contact-section">
      <div className="contact-container">
        <div className="contact-info">
          <h2>Get in Touch</h2>
          <p>Academic Proof of Concept developed for an industrial asset and manpower monitoring problem statement.</p>
          <div className="contact-detail"><strong>Status:</strong> Academic demo only</div>
          <div className="contact-detail"><strong>Scope:</strong> Public information and authenticated PoC portal</div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <p className="demo-form-notice">{notice}</p>
          <input type="text" placeholder="Your Name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
          <input type="email" placeholder="Work Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
          <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
            <option value="General">General Inquiry</option>
            <option value="Access">Access Management</option>
            <option value="Logistics">Smart Logistics</option>
            <option value="Support">Operational Support</option>
          </select>
          <textarea placeholder="Demo enquiry details" value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} required></textarea>
          <button type="submit" className="hero-button">Review Demo Notice</button>
        </form>
      </div>
    </section>
  );
};

export default ContactForm;
