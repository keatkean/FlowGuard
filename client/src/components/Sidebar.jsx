// client/src/components/Sidebar.jsx
import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import LogoIcon from './LogoIcon';
import { ROLES, roleLabel } from '../constants/roles';

export const SIDEBAR_SCROLL_STORAGE_KEY = 'flowguard_sidebar_scroll';

const Sidebar = () => {
  const navigate = useNavigate();
  const navRef = useRef(null);
  const [user] = useState(() => {
    const storedName = localStorage.getItem("userName");
    const storedRole = localStorage.getItem("userRole");
    return storedName && storedRole
      ? { name: storedName, role: storedRole }
      : { name: 'Guest', role: ROLES.TENANT };
  });
  const [isOpen, setIsOpen] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    const restoreScroll = () => {
      const stored = Number(sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY) || 0);
      if (Number.isFinite(stored) && stored > 0) {
        nav.scrollTop = stored;
      }
    };

    const frame = requestAnimationFrame(restoreScroll);

    const saveScroll = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(nav.scrollTop));
    };
    nav.addEventListener('scroll', saveScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      nav.removeEventListener('scroll', saveScroll);
      saveScroll();
    };
  }, []);

  // Visibility helpers — keep these in lock-step with the route wrappers in App.jsx
  // so a user never sees a link that would only bounce them to the 403 page.
  const isFM = user.role === ROLES.FM;
  const isStaff = user.role === ROLES.STAFF;
  const isTenant = user.role === ROLES.TENANT;

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <>
      {/* 1. Hamburger Button (Hidden when sidebar is open) */}
      {!isOpen && (
        <button className="mobile-menu-btn" onClick={() => setIsOpen(true)}>
          ☰
        </button>
      )}

      {/* 2. Sidebar with dynamic "open" class */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-title">
            <LogoIcon size={28} />
            <h2 className="gradient-text">FlowGuard</h2>
          </div>
          
          <button className="close-sidebar-btn" onClick={() => setIsOpen(false)}>
            ✕
          </button>
        </div>
        
        <nav className="sidebar-nav" ref={navRef}>
          {/* Everyone with a session */}
          <NavLink to="/dashboard" onClick={() => setIsOpen(false)}>Dashboard</NavLink>

          {/* Live monitoring / AI & security — FM only (Staff are factory workers) */}
          {isFM && (
            <>
              <NavLink to="/cameras" onClick={() => setIsOpen(false)}>Cameras</NavLink>
              <NavLink to="/camera-inventory" onClick={() => setIsOpen(false)}>Camera Inventory</NavLink>
              <NavLink to="/vpatrol" onClick={() => setIsOpen(false)}>V-Patrol</NavLink>
              <NavLink to="/object-detection" onClick={() => setIsOpen(false)}>Object Detection</NavLink>
              <NavLink to="/detection-settings" onClick={() => setIsOpen(false)}>Detection Setup</NavLink>
              <NavLink to="/gate-scanner" onClick={() => setIsOpen(false)}>Gate Scanner</NavLink>
            </>
          )}

          {/* Workforce attendance — FM + Tenant + Staff (Staff see their own records) */}
          {(isFM || isTenant || isStaff) && (
            <NavLink to="/attendance" onClick={() => setIsOpen(false)}>Daily Attendance</NavLink>
          )}

          {/* Logistics & bays — FM + Tenant (book) + Staff (operational view) */}
          {(isFM || isStaff || isTenant) && (
            <NavLink to="/logistics" onClick={() => setIsOpen(false)}>Logistics & Bays</NavLink>
          )}

          {/* Tenant's own staff */}
          {isTenant && (
            <NavLink to="/staff" onClick={() => setIsOpen(false)}>My Staff</NavLink>
          )}

          {/* FM-only administration */}
          {isFM && (
            <>
              <NavLink to="/users" onClick={() => setIsOpen(false)}>User Management</NavLink>
              <NavLink to="/security-review" onClick={() => setIsOpen(false)}>Security Review</NavLink>
              <NavLink to="/facial-evaluation" onClick={() => setIsOpen(false)}>Facial Evaluation</NavLink>
              <NavLink to="/incidents" onClick={() => setIsOpen(false)}>Incident Dashboard</NavLink>
              <NavLink to="/support-dashboard" onClick={() => setIsOpen(false)}>Support Tickets</NavLink>
              <NavLink to="/tenant-management" onClick={() => setIsOpen(false)}>Tenant Onboarding</NavLink>
            </>
          )}

          {/* Settings — all authenticated roles (content inside is role-gated) */}
          <NavLink to="/settings" onClick={() => setIsOpen(false)}>Settings</NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-profile">
            <span className="user-avatar">👤</span>
            <div className="user-meta">
              <span className="user-name">{user.name}</span>
              <span className="user-role-tag">
                {roleLabel(user.role)}
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn">Log Out</button>
        </div>
      </aside>

      {/* 3. Overlay to close menu when clicking outside */}
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)}></div>}
    </>
  );
};

export default Sidebar;
