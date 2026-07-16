// client/src/components/Sidebar.jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

    // Restore BEFORE the browser paints so the active item never flashes at
    // the top; the rAF reapply is only a fallback for late layout/CSS shifts.
    restoreScroll();
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

  // While the mobile drawer is open: Escape closes it, and body scrolling is locked
  // so the page behind the overlay can't scroll under the user's finger. Both are
  // fully reverted on close/unmount so desktop (where the drawer is always "open"
  // visually but this state stays false) is never affected.
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Visibility helpers — keep these in lock-step with the route wrappers in App.jsx
  // so a user never sees a link that would only bounce them to the 403 page.
  const isFM = user.role === ROLES.FM;
  const isStaff = user.role === ROLES.STAFF;
  const isTenant = user.role === ROLES.TENANT;

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  // Shared NavLink click handler: persist the current sidebar scroll position
  // BEFORE the route change remounts the layout, then close the mobile drawer.
  const handleNavClick = () => {
    const nav = navRef.current;
    if (nav) {
      sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(nav.scrollTop));
    }
    setIsOpen(false);
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
          
          <button className="close-sidebar-btn" onClick={handleNavClick}>
            ✕
          </button>
        </div>
        
        <nav className="sidebar-nav" ref={navRef}>
          {/* Everyone with a session */}
          <NavLink to="/dashboard" onClick={handleNavClick}>Dashboard</NavLink>

          {/* Live monitoring / AI & security — FM only (Staff are factory workers) */}
          {isFM && (
            <>
              <NavLink to="/cameras" onClick={handleNavClick}>Cameras</NavLink>
              <NavLink to="/camera-inventory" onClick={handleNavClick}>Camera Inventory</NavLink>
              <NavLink to="/vpatrol" onClick={handleNavClick}>V-Patrol</NavLink>
              <NavLink to="/object-detection" onClick={handleNavClick}>Object Detection</NavLink>
              <NavLink to="/detection-settings" onClick={handleNavClick}>Detection Setup</NavLink>
              <NavLink to="/gate-scanner" onClick={handleNavClick}>Gate Scanner</NavLink>
            </>
          )}

          {/* Workforce attendance — FM + Tenant + Staff (Staff see their own records) */}
          {(isFM || isTenant || isStaff) && (
            <NavLink to="/attendance" onClick={handleNavClick}>Daily Attendance</NavLink>
          )}

          {/* Logistics & bays — FM + Tenant (book) + Staff (operational view) */}
          {(isFM || isStaff || isTenant) && (
            <NavLink to="/logistics" onClick={handleNavClick}>Logistics & Bays</NavLink>
          )}

          {/* Tenant's own staff */}
          {isTenant && (
            <NavLink to="/staff" onClick={handleNavClick}>My Staff</NavLink>
          )}

          {/* FM-only administration */}
          {isFM && (
            <>
              <NavLink to="/users" onClick={handleNavClick}>User Management</NavLink>
              <NavLink to="/security-review" onClick={handleNavClick}>Security Review</NavLink>
              <NavLink to="/incidents" onClick={handleNavClick}>Incident Dashboard</NavLink>
              <NavLink to="/support-dashboard" onClick={handleNavClick}>Support Tickets</NavLink>
              <NavLink to="/tenant-management" onClick={handleNavClick}>Tenant Onboarding</NavLink>
            </>
          )}

          {/* Settings — all authenticated roles (content inside is role-gated) */}
          <NavLink to="/settings" onClick={handleNavClick}>Settings</NavLink>
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
      {isOpen && <div className="sidebar-overlay" onClick={handleNavClick}></div>}
    </>
  );
};

export default Sidebar;
