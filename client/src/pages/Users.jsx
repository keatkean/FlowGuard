import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Sidebar from '../components/Sidebar';
import SafeMuiIcon from '../components/SafeMuiIcon';
import PasswordInput from '../components/PasswordInput';
import '../css/Dashboard.css';
import '../css/Users.css';
import { API_BASE_URL } from '../constants/api';

// Compact badge + separate readable description — never one long combined label.
const ROLE_META = {
  FM: { badge: 'FM', description: 'Facilities Manager' },
  Tenant: { badge: 'Tenant', description: 'Unit Owner' },
  Staff: { badge: 'Staff', description: 'Worker' }
};

const emptyFilters = {
  query: '',
  role: 'All',
  status: 'All',
  faceId: 'All'
};

const Users = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, user: null, action: null });
  const [confirmText, setConfirmText] = useState('');
  const [modalError, setModalError] = useState('');
  const [notification, setNotification] = useState(location.state?.notice || '');
  const [filters, setFilters] = useState(emptyFilters);

  const token = localStorage.getItem('accessToken');
  const currentUserId = localStorage.getItem('userId');
  const role = localStorage.getItem('userRole');

  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/user`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Database sync failed:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!notification) return undefined;
    const timer = setTimeout(() => setNotification(''), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.isActive !== false).length,
    suspended: users.filter((u) => u.isActive === false).length,
    enrolled: users.filter((u) => Boolean(u.isEnrolled)).length
  }), [users]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const query = filters.query.trim().toLowerCase();
    const matchesQuery = !query
      || user.name?.toLowerCase().includes(query)
      || user.email?.toLowerCase().includes(query);
    const matchesRole = filters.role === 'All' || user.role === filters.role;
    const matchesStatus = filters.status === 'All'
      || (filters.status === 'Active' ? user.isActive !== false : user.isActive === false);
    const matchesFaceId = filters.faceId === 'All'
      || (filters.faceId === 'Enrolled' ? Boolean(user.isEnrolled) : !user.isEnrolled);
    return matchesQuery && matchesRole && matchesStatus && matchesFaceId;
  }), [users, filters]);

  const onNewField = (e) => setNewUser((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const onFilterChange = (e) => setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const openAdd = () => {
    setAddError('');
    setNewUser({ name: '', email: '', password: '' });
    setAddOpen(true);
  };
  const closeAdd = () => setAddOpen(false);

  const createTenant = async (e) => {
    e.preventDefault();
    setAddSubmitting(true);
    setAddError('');
    try {
      await axios.post(`${API_BASE_URL}/user/manual-create`, newUser, { headers: { Authorization: `Bearer ${token}` } });
      setAddOpen(false);
      setNotification(`Tenant account created for ${newUser.name}.`);
      fetchUsers();
    } catch (err) {
      setAddError(err.response?.data?.errors?.[0] || err.response?.data?.message || 'Failed to create account.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const openModal = (user, action = 'suspend') => {
    setConfirmText('');
    setModalError('');
    setModal({ isOpen: true, user, action });
  };

  const closeModal = () => {
    setModal({ isOpen: false, user: null, action: null });
    setConfirmText('');
    setModalError('');
  };

  const handleConfirmAction = async () => {
    const { id, isActive, name } = modal.user;
    setModalError('');

    if (modal.action === 'delete' && confirmText !== name) {
      setModalError(`Type ${name} to confirm permanent off-boarding.`);
      return;
    }

    try {
      if (modal.action === 'delete') {
        await axios.delete(`${API_BASE_URL}/user/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        await fetchUsers();
        setNotification(`${name} was permanently removed from FlowGuard.`);
        closeModal();
        return;
      }

      await axios.put(`${API_BASE_URL}/user/suspend/${id}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers((prevUsers) => prevUsers.map((u) => (u.id === id ? { ...u, isActive: !isActive } : u)));
      closeModal();
    } catch (error) {
      setModalError(error.response?.data?.message || error.response?.data?.error || `Failed to ${modal.action === 'delete' ? 'remove' : 'update access for'} ${name}.`);
      console.error(error);
    }
  };

  const renderRoleBadge = (userRole) => {
    const meta = ROLE_META[userRole] || { badge: String(userRole), description: '' };
    return (
      <div className="role-cell">
        <span className={`role-badge role-${String(userRole).toLowerCase()}`}>{meta.badge}</span>
        {meta.description && <span className="role-description">{meta.description}</span>}
      </div>
    );
  };

  const renderStatusBadge = (user) => (
    <span className={`account-status-badge ${user.isActive === false ? 'suspended' : 'active'}`} role="status">
      {user.isActive === false ? 'Suspended' : 'Active'}
    </span>
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        {modal.isOpen && (
          <div className="modal-overlay">
            <div className={`modal-content security-modal ${modal.action === 'delete' ? 'delete-variant' : ''}`}>
              <div className="modal-header">
                <span className="modal-icon">{modal.action === 'delete' ? '!' : modal.user.isActive ? '!' : '+'}</span>
                <h3>{modal.action === 'delete' ? 'Permanent Off-boarding' : 'Security Confirmation'}</h3>
              </div>
              {modal.action === 'delete' ? (
                <>
                  <p>
                    Permanently remove login access, Face ID enrolment and operational access for this user (<strong>{modal.user.name}</strong>)?
                  </p>
                  <p className="delete-warning-copy">
                    Attendance records will be deleted, linked security logs will remain anonymised, and operational bookings will be safely unlinked where applicable.
                  </p>
                  <label className="confirm-name-field">
                    Type the user's full name to confirm
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={modal.user.name} />
                  </label>
                </>
              ) : (
                <p>
                  Are you sure you want to <strong>{modal.user.isActive ? 'Suspend' : 'Reactivate'}</strong> access for <strong>{modal.user.name}</strong>?
                </p>
              )}
              {modalError && <div className="modal-error" role="alert">{modalError}</div>}
              <div className="modal-actions">
                <button className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button
                  className={`confirm-btn ${modal.action === 'delete' ? 'delete-btn' : modal.user.isActive ? 'suspend-btn' : 'reactivate-btn'}`}
                  onClick={handleConfirmAction}
                  disabled={modal.action === 'delete' && confirmText !== modal.user.name}
                >
                  {modal.action === 'delete' ? 'Permanently Delete' : `Confirm ${modal.user.isActive ? 'Suspension' : 'Reactivation'}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {addOpen && (
          <div className="modal-overlay" onClick={closeAdd}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-icon">+</span>
                <h3>Add Tenant Account</h3>
              </div>
              {addError && <div className="add-user-error">{addError}</div>}
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

        {notification && <div className="users-toast">{notification}</div>}

        <div className="users-container">
          <header className="dashboard-header users-header">
            <div className="header-titles">
              <h1>User Management</h1>
              <p>Manage user accounts, roles, Face ID enrolment and access status.</p>
            </div>
            {role === 'FM' && <button className="add-user-btn" onClick={openAdd}>+ Add Tenant</button>}
          </header>

          <section className="user-summary-grid" aria-label="User summary">
            <div><span>Total Users</span><strong>{summary.total}</strong></div>
            <div><span>Active</span><strong>{summary.active}</strong></div>
            <div><span>Suspended</span><strong>{summary.suspended}</strong></div>
            <div><span>Face ID Enrolled</span><strong>{summary.enrolled}</strong></div>
          </section>

          <section className="user-filter-bar" aria-label="User filters">
            <input name="query" value={filters.query} onChange={onFilterChange} placeholder="Search name or email" aria-label="Search by name or email" />
            <select name="role" value={filters.role} onChange={onFilterChange} aria-label="Filter by role">
              <option>All</option><option>FM</option><option>Tenant</option><option>Staff</option>
            </select>
            <select name="status" value={filters.status} onChange={onFilterChange} aria-label="Filter by status">
              <option>All</option><option>Active</option><option>Suspended</option>
            </select>
            <select name="faceId" value={filters.faceId} onChange={onFilterChange} aria-label="Filter by Face ID">
              <option>All</option><option>Enrolled</option><option>Not Enrolled</option>
            </select>
          </section>

          <div className="table-wrapper">
            {loading ? (
              <p style={{ padding: '40px', color: '#94a3b8', textAlign: 'center' }}>Syncing with FlowGuard Database...</p>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Face ID</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No users match the current filters.</td></tr>
                  ) : filteredUsers.map((u) => {
                    const isSelf = String(u.id) === String(currentUserId);
                    return (
                      <tr key={u.id} className={u.isActive === false ? 'row-suspended' : ''}>
                        <td className="user-name-cell" data-label="Personnel">
                          <div className="user-identity">
                            <div className="user-avatar-small">{u.name?.charAt(0).toUpperCase()}</div>
                            <span className="user-name-text">{u.name} {isSelf && <span className="self-tag">(You)</span>}</span>
                          </div>
                        </td>
                        <td data-label="Role">{renderRoleBadge(u.role)}</td>
                        <td className="access-cell email-cell" data-label="Email" title={u.email}>{u.email}</td>
                        <td data-label="Status">{renderStatusBadge(u)}</td>
                        <td data-label="Face ID">
                          <span className={`presence-tag ${u.isEnrolled ? 'on-site' : 'off-site'}`} title={u.isEnrolled ? 'A protected biometric template is enrolled' : 'No Face ID enrolled yet'}>
                            {u.isEnrolled ? <><SafeMuiIcon icon={CheckCircleIcon} fontSize="small" aria-hidden="true" /> Enrolled</> : <><SafeMuiIcon icon={CancelIcon} fontSize="small" aria-hidden="true" /> Not Enrolled</>}
                          </span>
                        </td>
                        <td className="time-cell" data-label="Joined">{new Date(u.createdAt).toLocaleDateString('en-SG')}</td>
                        <td className="actions-cell" data-label="Actions">
                          {/* Face ID enrol/re-enrol intentionally lives in the
                              enrolment flow (first-time) and Settings (self
                              re-enrolment) — never as a row action here. */}
                          <div className="action-button-group" aria-label={`Actions for ${u.name}`}>
                            <button className="action-btn action-neutral" onClick={() => navigate(`/user-logs/${u.id}`)}>
                              <SafeMuiIcon icon={VisibilityIcon} fontSize="inherit" aria-hidden="true" />
                              View Logs
                            </button>
                            <button className={`action-btn ${u.isActive === false ? 'action-restore' : 'action-warning'} ${isSelf ? 'disabled-action' : ''}`} onClick={() => !isSelf && openModal(u, 'suspend')} disabled={isSelf}>
                              <SafeMuiIcon icon={u.isActive === false ? CheckCircleIcon : BlockIcon} fontSize="inherit" aria-hidden="true" />
                              {u.isActive === false ? 'Reactivate' : 'Suspend'}
                            </button>
                            <button className={`action-btn action-danger ${isSelf ? 'disabled-action' : ''}`} onClick={() => !isSelf && openModal(u, 'delete')} disabled={isSelf}>
                              <SafeMuiIcon icon={DeleteOutlineIcon} fontSize="inherit" aria-hidden="true" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
