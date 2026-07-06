import React from 'react';
import { Navigate } from 'react-router-dom';

const isTokenExpired = (token) => {
    try {
        // JWT uses base64url (- and _ instead of + and /); convert before atob.
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        return payload.exp * 1000 < Date.now();
    } catch {
        return true;
    }
};

const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
    const token = localStorage.getItem("accessToken");
    const userRole = localStorage.getItem("userRole");

    // 1. No token or expired token? Redirect to login.
    if (!token || isTokenExpired(token)) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        localStorage.removeItem('userId');
        return <Navigate to="/login" replace />;
    }

    // 2. Build the list of roles that may view this page.
    //    - `requiredRole="FM"`              → single-role pages (back-compatible)
    //    - `allowedRoles={['FM','Tenant']}` → pages shared by a few roles
    const permitted = allowedRoles
        ? allowedRoles
        : requiredRole
            ? [requiredRole]
            : null;

    // 3. Wrong Role? Redirect to Forbidden Error
    if (permitted && !permitted.includes(userRole)) {
        return <Navigate to="/error/403" replace />;
    }

    // 4. Authenticated (and authorised)? Show the page
    return children;
};

export default ProtectedRoute;