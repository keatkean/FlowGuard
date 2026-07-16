import React from 'react';
import { Link } from 'react-router-dom';
import { HashLink } from 'react-router-hash-link'; 
import LogoIcon from './LogoIcon';

const NavBar = () => {
  return (
    <nav className="navbar-container">
      <Link to="/" className="nav-logo">
        <LogoIcon size={32} />
        <span>FlowGuard</span>
      </Link>
      <div className="nav-right-section">
        <div className="nav-links">
          <HashLink smooth to="/#mission">Overview</HashLink>
          <Link to="/innovation">Capabilities</Link>
          <HashLink smooth to="/#how-it-works">How It Works</HashLink>
          <HashLink smooth to="/#technology">Technology</HashLink>
        </div>
        <Link to="/login" className="nav-login-btn">Client Login</Link>
      </div>
    </nav>
  );
};

export default NavBar;
