import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import PasswordInput from '../components/PasswordInput';
import '../css/Dashboard.css';
import '../css/Users.css';

const Users = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, user: null, action: null });
  const [notification, setNotification] = useState(location.state?.notice || "");

  const token = localStorage.getItem("accessToken");
  const currentUserId = localStorage.getItem("userId");
  const role = localStorage.getItem("userRole");

  // Manual "Add Tenant" modal (FM only)
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');

  const onNewField = (e) => setNewUser(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const openAdd = () => { setAddError(''); setNewUser({ name: '', email: '', password: '' }); setAddOpen(true); };
  const closeAdd = () => setAddOpen(false);

  const createTenant = async (e) => {
    e.preventDefault();
    setAddSubmitting(true);
    setAddError('');
    try {
      await axios.post('/user/manual-create', newUser, { headers: { Authorization: `Bearer ${token}` } });
      setAddOpen(false);
      setNotification(`Tenant account created for ${newUser.name}.`);
      fetchUsers();
    } catch (err) {
      setAddError(err.response?.data?.errors?.[0] || err.response?.data?.message || 'Failed to create account.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true); 
    try {
      const response = await axios.get('/user', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (Array.isArray(response.data)) {
        setUsers(response.data);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error("Database sync failed:", error);
      setUsers([]); 
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(""), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const openModal = (user, action = 'suspend') => {
    setModal({ isOpen: true, user, action });
  };

  const closeModal = () => {
    setModal({ isOpen: false, user: null, action: null });
  };

  const handleConfirmAction = async () => {
    const { id, isActive, name } = modal.user;

    try {
      if (modal.action === 'delete') {
        await axios.delete(`/user/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        setUsers(prevUsers => prevUsers.filter(u => u.id !== id));
        setNotification(`${name} was permanently removed from FlowGuard.`);
        closeModal();
        return;
      }

      await axios.put(`/user/suspend/${id}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setUsers(prevUsers => 
        prevUsers.map(u => u.id === id ? { ...u, isActive: !isActive } : u)
      );
      
      closeModal();
    } catch (error) {
      alert(`Failed to ${modal.action === 'delete' ? 'remove' : 'update access for'} ${name}.`);
      console.error(error);
      closeModal();
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        {/* Security Modal Logic */}
        {modal.isOpen && (
          <div className="modal-overlay">
            <div className={`modal-content security-modal ${modal.action === 'delete' ? 'delete-variant' : ''}`}>
              <div className="modal-header">
                <span className="modal-icon">{modal.user.isActive ? '⚠️' : '🔓'}</span>
                <h3>{modal.action === 'delete' ? 'Permanent Off-boarding' : 'Security Confirmation'}</h3>
              </div>
              <p>
                {modal.action === 'delete'
                  ? <>Permanently remove <strong>{modal.user.name}</strong> from FlowGuard? This removes their login access and biometric profile from the database.</>
                  : <>Are you sure you want to <strong>{modal.user.isActive ? 'Suspend' : 'Reactivate'}</strong> access for <strong>{modal.user.name}</strong>?</>}
              </p>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button 
                  className={`confirm-btn ${modal.action === 'delete' ? 'delete-btn' : modal.user.isActive ? 'suspend-btn' : 'reactivate-btn'}`}
                  onClick={handleConfirmAction}
                >
                  {modal.action === 'delete' ? 'Confirm Deletion' : `Confirm ${modal.user.isActive ? 'Suspension' : 'Reactivation'}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Add Tenant modal (FM only) */}
        {addOpen && (
          <div className="modal-overlay" onClick={closeAdd}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-icon">➕</span>
                <h3>Add Tenant Account</h3>
              </div>
              {addError && <div className="add-user-error">⚠️ {addError}</div>}
              <form className="add-user-form" onSubmit={createTenant}>
                <div>
                  <label>Full Name</label>
                  <input name="name" value={newUser.name} onChange={onNewField} placeholder="e.g., Jane Tan" required />
                </div>
                <div>
                  <label>Email</label>
                  <input name="email" type="email" value={newUser.email} onChange={onNewField} placeholder="name@company.com" required />
                </div>
                <div>
                  <label>Temporary Password</label>
                  <PasswordInput variant="dark" name="password" value={newUser.password} onChange={onNewField} placeholder="min 8 characters" required />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeAdd}>Cancel</button>
                  <button type="submit" className="add-user-btn" disabled={addSubmitting}>
                    {addSubmitting ? 'Creating...' : 'Create Tenant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {notification && (
          <div className="users-toast">
            {notification}
          </div>
        )}

        <div className="users-container">
          {/* Header titles are wrapped to maintain consistency across the app */}
          <header className="dashboard-header">
            <div className="header-titles">
              <h1>User Access Management</h1>
              <p>Security oversight for personnel roles and factory presence</p>
            </div>
            {role === 'FM' && (
              <button className="add-user-btn" onClick={openAdd}>+ Add Tenant</button>
            )}
          </header>

          <div className="table-wrapper">
            {loading ? (
              <p style={{ padding: '40px', color: '#94a3b8', textAlign: 'center' }}>
                Syncing with FlowGuard Database...
              </p>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>System Role</th>
                    <th>Email Address</th> 
                    <th>Physical Presence</th>
                    <th>Joined Date</th> 
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        No users found in database.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelf = String(u.id) === String(currentUserId);

                      return (
                        <tr key={u.id} className={u.isActive === false ? 'row-suspended' : ''}>
                          <td className="user-name-cell" data-label="Personnel">
                            <div className="user-identity">
                              <div className="user-avatar-small">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="user-name-text">
                                {u.name} {isSelf && <span className="self-tag">(You)</span>}
                              </span>
                            </div>
                          </td>
                          <td data-label="System Role">
                            <span className={`role-badge role-${u.role.toLowerCase()}`}>
                              {u.role === 'FM' ? 'Facilities Manager' : u.role === 'Tenant' ? 'Tenant' : 'Staff'}
                            </span>
                          </td>
                          <td className="access-cell" data-label="Email Address">{u.email}</td>
                          <td data-label="Presence">
                            <div className={`presence-tag ${u.locationStatus === 'On-Site' ? 'on-site' : 'off-site'}`}>
                              {u.locationStatus === 'On-Site' ? (
                                <><span>📍</span> On-Site</>
                              ) : (
                                <><span>🏠</span> Off-Site</>
                              )}
                            </div>
                          </td>
                          <td className="time-cell" data-label="Joined Date">
                            {new Date(u.createdAt).toLocaleDateString('en-SG')}
                          </td>
                          <td className="actions-cell" data-label="Actions">
                            <div className="action-button-group" aria-label={`Actions for ${u.name}`}>
                              <button 
                                className="action-btn action-neutral"
                                onClick={() => navigate(`/user-logs/${u.id}`)}
                              >
                                Logs
                              </button>

                              <button
                                className={`action-btn ${u.isActive === false ? 'action-restore' : 'action-warning'} ${isSelf ? 'disabled-action' : ''}`}
                                onClick={() => !isSelf && openModal(u, 'suspend')}
                                disabled={isSelf}
                                title={isSelf ? "Self-suspension restricted" : ""}
                              >
                                {u.isActive === false ? 'Reactivate' : 'Suspend'}
                              </button>

                              <button
                                className={`action-btn action-danger ${isSelf ? 'disabled-action' : ''}`}
                                onClick={() => !isSelf && openModal(u, 'delete')}
                                disabled={isSelf}
                                title={isSelf ? "Self-deletion restricted" : "Permanently delete user"}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Users;
