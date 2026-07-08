// Canonical role values — these MUST match the Sequelize ENUM in server/models/User.js
// (`ENUM('FM','Tenant','Staff')`) and the value Login.jsx stores in localStorage.userRole.
// Centralising them here prevents "FM" vs "Admin" vs "Facilities Manager" drift.
export const ROLES = Object.freeze({
  FM: 'FM',         // Facilities Manager — highest internal access
  STAFF: 'Staff',   // Security / operational staff
  TENANT: 'Tenant', // Tenant — own unit only
});

// Reusable allow-lists for route wrappers and sidebar visibility.
export const ACCESS = Object.freeze({
  FM_ONLY: [ROLES.FM],
  FM_STAFF: [ROLES.FM, ROLES.STAFF],     // live monitoring / operational pages
  FM_TENANT: [ROLES.FM, ROLES.TENANT],   // attendance, own-staff, own-logistics
  ANY: [ROLES.FM, ROLES.STAFF, ROLES.TENANT],
});

// Human-readable label for a stored role value (display only).
export const roleLabel = (role) =>
  role === ROLES.FM ? 'Facilities Manager'
    : role === ROLES.TENANT ? 'Tenant'
      : role === ROLES.STAFF ? 'Staff'
        : 'Guest';
