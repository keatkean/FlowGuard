import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import PasswordInput from '../components/PasswordInput';
import '../css/Dashboard.css';
import '../css/Management.css';

const StaffManagement = () => {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [companyCode, setCompanyCode] = useState('');
  
  // Track Usage Capacity and Expiration Timestamp
  const [usage, setUsage] = useState({ current: 0, max: 10, createdAt: null });
  
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, user: null });
  const [notification, setNotification] = useState({ message: '', type: '' });

  const token = localStorage.getItem("accessToken");
  const userName = localStorage.getItem("userName");
  const role = localStorage.getItem("userRole");

  // Manual "Add Staff" modal (Tenant only)
  const [addOpen, setAddOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '' });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');

  const onNewField = (e) => setNewStaff(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const openAdd = () => { setAddError(''); setNewStaff({ name: '', email: '', password: '' }); setAddOpen(true); };
  const closeAdd = () => setAddOpen(false);

  const createStaff = async (e) => {
    e.preventDefault();
    setAddSubmitting(true);
    setAddError('');
    try {
      await axios.post('/user/manual-create', newStaff, { headers: { Authorization: `Bearer ${token}` } });
      setAddOpen(false);
      triggerNotify(`Staff account created for ${newStaff.name}.`, "success");
      fetchData();
    } catch (err) {
      setAddError(err.response?.data?.errors?.[0] || err.response?.data?.message || 'Failed to create account.');
    } finally {
      setAddSubmitting(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const triggerNotify = (msg, type = 'error') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const codeRes = await axios.get('/user/my-code', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCompanyCode(codeRes.data.companyCode);
      setUsage({ 
        current: codeRes.data.codeCurrentUsage || 0, 
        max: codeRes.data.codeMaxUsage || 10,
        createdAt: codeRes.data.codeCreatedAt // Received from Hybrid logic backend
      });

      const staffRes = await axios.get('/user/my-staff', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStaff(staffRes.data);
      setLoading(false);
    } catch (err) {
      triggerNotify("Sync Error: Unable to fetch personnel data.");
      setLoading(false);
    }
  };

  // Helper to determine if the security key is dead
  const checkIsExpired = () => {
    if (!usage.createdAt) return false;
    const fortyEightHours = 48 * 60 * 60 * 1000;
    const timeElapsed = Date.now() - new Date(usage.createdAt).getTime();
    return timeElapsed > fortyEightHours;
  };

  const isExpired = checkIsExpired();
  const isAtCapacity = usage.current >= usage.max;

  const openDeleteModal = (user) => setDeleteModal({ isOpen: true, user });
  const closeDeleteModal = () => setDeleteModal({ isOpen: false, user: null });

  const handleConfirmDelete = async () => {
    const { id, name } = deleteModal.user;
    try {
      await axios.delete(`/user/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStaff(prev => prev.filter(m => m.id !== id));
      triggerNotify(`${name} removed from system.`, "success");
      closeDeleteModal();
    } catch (err) {
      triggerNotify("Operation failed: Database restriction.");
      closeDeleteModal();
    }
  };

  const handleGenerateCode = async () => {
    try {
      const res = await axios.put('/user/generate-code', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanyCode(res.data.companyCode);
      // Backend resets these, so we update UI immediately
      setUsage({ current: 0, max: 10, createdAt: new Date() }); 
      triggerNotify("New security key generated!", "success");
    } catch (err) {
      triggerNotify("Error generating key."); 
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        {deleteModal.isOpen && (
          <div className="modal-overlay">
            <div className="modal-content security-modal delete-variant">
              <div className="modal-header">
                <span className="modal-icon red-glow">⚠️</span>
                <h3>System Deletion Alert</h3>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to permanently remove <strong>{deleteModal.user.name}</strong>?</p>
                <p className="warning-subtext">
                  This action is <strong>irreversible</strong>. All sector access for this personnel will be revoked across the network.
                </p>
              </div>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={closeDeleteModal}>Cancel</button>
                <button className="confirm-delete-btn" onClick={handleConfirmDelete}>
                  Confirm Deletion
                </button>
              </div>
            </div>
          </div>
        )}

        {notification.message && (
          <div className={`toast-notification ${notification.type}`}>
            <span className="toast-icon">{notification.type === 'success' ? '✅' : '⚠️'}</span>
            <div className="toast-content"><p>{notification.message}</p></div>
          </div>
        )}

        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Staff Management</h1>
            <p>Unit Controller: <strong>{userName}</strong></p>
          </div>
          {role === 'Tenant' && (
            <button className="add-user-btn" onClick={openAdd}>+ Add Staff</button>
          )}
        </header>

        {/* Manual Add Staff modal (Tenant only) */}
        {addOpen && (
          <div className="modal-overlay" onClick={closeAdd}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-icon">➕</span>
                <h3>Add Staff Account</h3>
              </div>
              {addError && <div className="add-user-error">⚠️ {addError}</div>}
              <form className="add-user-form" onSubmit={createStaff}>
                <div>
                  <label>Full Name</label>
                  <input name="name" value={newStaff.name} onChange={onNewField} placeholder="e.g., Ahmad bin Ali" required />
                </div>
                <div>
                  <label>Email</label>
                  <input name="email" type="email" value={newStaff.email} onChange={onNewField} placeholder="name@company.com" required />
                </div>
                <div>
                  <label>Temporary Password</label>
                  <PasswordInput variant="dark" name="password" value={newStaff.password} onChange={onNewField} placeholder="min 8 characters" required />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeAdd}>Cancel</button>
                  <button type="submit" className="add-user-btn" disabled={addSubmitting}>
                    {addSubmitting ? 'Creating...' : 'Create Staff'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="management-container">
          <div className="code-generator-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3>Unit Registration Code</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '20px' }}>
                        {isExpired 
                          ? "SECURITY ALERT: This key has expired. Generate a new one to resume onboarding." 
                          : `Expires 48h after generation. Limited to ${usage.max} total uses. Share this code for secure self-registration, or add staff manually above.`}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    {/* Dynamic Badge: Capacity vs Expired */}
                    {isExpired ? (
                      <span className="status-badge" style={{ background: '#f43f5e', color: 'white', boxShadow: '0 0 10px rgba(244, 63, 94, 0.4)' }}>
                          CODE EXPIRED
                      </span>
                    ) : (
                      <span className="status-badge" style={{ background: isAtCapacity ? '#f59e0b' : '#3b82f6', color: 'white' }}>
                          CAPACITY: {usage.current} / {usage.max}
                      </span>
                    )}
                </div>
            </div>

            <div className="code-flex-row">
              {/* If expired, we obscure the code to prevent people from trying to use it */}
              <div className={`code-display-box ${isExpired ? 'expired-box' : ''}`}>
                {isExpired ? "-------" : (companyCode || "NO CODE SET")}
              </div>
              <button onClick={handleGenerateCode} className="edit-btn" style={{ padding: '14px 24px' }}>
                {isExpired ? 'Generate New Key' : 'Refresh Key'}
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="management-table">
              <thead>
                <tr>
                  <th>PERSONNEL</th>
                  <th>EMAIL ADDRESS</th>
                  <th>STATUS</th>
                  <th>JOINED DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {staff.length > 0 ? staff.map(member => (
                  <tr key={member.id}>
                    <td data-label="Personnel">
                      <div className="user-info">
                        <span className="user-initial">{member.name.charAt(0).toUpperCase()}</span>
                        <span>{member.name}</span>
                      </div>
                    </td>
                    <td data-label="Email">{member.email}</td>
                    <td data-label="Status"><span className="status-badge active">On-Site</span></td>
                    <td data-label="Joined">{new Date(member.createdAt).toLocaleDateString('en-SG')}</td>
                    <td data-label="Actions">
                      <button className="edit-btn" onClick={() => navigate(`/user-logs/${member.id}`)}>
                        Logs
                      </button>
                      <button className="revoke-btn" onClick={() => openDeleteModal(member)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )) : (
                    <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
                            {loading ? "Accessing unit data..." : "No personnel registered to this unit."}
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StaffManagement;