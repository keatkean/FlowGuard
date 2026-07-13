import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import '../css/Management.css'; 

const TenantManagement = () => {
  const [invites, setInvites] = useState([]);
  const [newCode, setNewCode] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Pull credentials from storage
  const token = localStorage.getItem("accessToken");
  const userName = localStorage.getItem("userName");

  useEffect(() => {
    fetchInvites();
  }, []);

  const fetchInvites = async () => {
    try {
      const res = await axios.get('/user/tenant-invites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvites(res.data);
    } catch (err) {
      console.error("Failed to fetch invites");
    }
  };

  const handleGenerateInvite = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/user/invite-tenant', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewCode(res.data.inviteCode);
      fetchInvites(); 
    } catch (err) {
      alert("Error generating invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        {/* Header matches Staff Management Style */}
        <header className="dashboard-header">
          <div className="header-titles">
            <h1>Tenant Onboarding</h1>
            <p>Unit Controller: <strong>{userName}</strong></p>
          </div>
        </header>

        <div className="management-container">
          <div className="code-generator-card">
            {/* --- TOP ROW: Title and Instructions aligned horizontally --- */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '10px' 
            }}>
                <h3 style={{ margin: 0 }}>Issue New Invitation</h3>
                
                <p style={{ 
                    margin: 0, 
                    color: '#64748b', 
                    fontSize: '0.8rem', 
                    fontWeight: '500' 
                }}>
                    Generate secure invitation codes for new Unit Owners.
                </p>
            </div>

            {/* --- SUB ROW: Secondary info text --- */}
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '25px' }}>
                Each code is one-time use and expires in 48 hours. New unit owners can self-register
                securely with this invite code — an alternative to adding them from User Management.
            </p>

            {/* --- ACTION ROW: Code Display and Button --- */}
            <div className="code-flex-row">
              <div className="code-display-box" style={{ minWidth: '250px' }}>
                {newCode || "---- ---- ----"}
              </div>
              <button 
                onClick={handleGenerateInvite} 
                className="edit-btn" 
                disabled={loading}
                style={{ background: '#3b82f6', color: 'white', padding: '14px 24px' }}
              >
                {loading ? "Generating..." : "Generate Invite Code"}
              </button>
            </div>
            
            {newCode && (
              <p style={{ marginTop: '15px', color: '#10b981', fontSize: '0.85rem', fontWeight: '600' }}>
                ✅ Copy this code and send it to the new Tenant.
              </p>
            )}
          </div>

          <div className="table-container">
            <table className="management-table">
              <thead>
                <tr>
                  <th>INVITATION CODE</th>
                  <th>EXPIRATION</th>
                  <th>STATUS</th>
                  <th>CREATED ON</th>
                </tr>
              </thead>
              <tbody>
                {invites.length > 0 ? invites.map(invite => (
                  <tr key={invite.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '1px' }}>
                        {invite.code}
                    </td>
                    <td data-label="Expiration">{new Date(invite.expiresAt).toLocaleDateString('en-SG')}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${invite.isUsed ? 'expired' : 'active'}`}>
                        {invite.isUsed ? 'USED' : 'PENDING'}
                      </span>
                    </td>
                    <td data-label="Created">{new Date(invite.createdAt).toLocaleDateString('en-SG')}</td>
                  </tr>
                )) : (
                    <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                            No active invitations found.
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

export default TenantManagement;