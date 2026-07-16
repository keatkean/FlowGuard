const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
    // 1. Grab the token from the request header
    const authHeader = req.headers['authorization'];

    // Tokens usually come in as "Bearer <token_string>", so we split it to just get the string
    const token = authHeader && authHeader.split(' ')[1];

    // 2. If there is no token, kick them out
    if (!token) {
        return res.status(401).json({ message: "Access Denied. No security token provided." });
    }

    // 3. Verify the token signature/expiry
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.APP_SECRET);
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired security token." });
    }

    try {
        // 4. The DATABASE is authoritative, not the JWT payload. Every protected
        //    request re-reads the account so that deletion, suspension, role
        //    changes, and session revocation (tokenVersion bump on password
        //    change/reset or suspension) take effect immediately — e.g. a
        //    stolen/lost-device token dies the moment the account is secured.
        //    Lazy-required so unit tests can jest.mock('../models'); suites that
        //    stub the models without a User model keep the JWT-only behaviour.
        const { User } = require('../models');
        if (User && typeof User.findByPk === 'function') {
            const account = await User.findByPk(decoded.id);
            if (!account) {
                return res.status(401).json({ message: "Account no longer exists. Session terminated." });
            }
            if (account.isActive === false) {
                return res.status(403).json({ message: "Account suspended. Session terminated." });
            }
            const issuedVersion = Number(decoded.tokenVersion ?? 0);
            const currentVersion = Number(account.tokenVersion ?? 0);
            if (issuedVersion !== currentVersion) {
                return res.status(401).json({ message: "Session revoked. Please log in again." });
            }
            req.user = {
                id: account.id,
                email: account.email,
                role: account.role,          // DB role wins over whatever the JWT claims
                tokenVersion: currentVersion
            };
        } else {
            req.user = decoded;
        }

        next();
    } catch (err) {
        console.error("verifyToken account lookup failed:", err.message);
        return res.status(500).json({ message: "Authentication service unavailable." });
    }
};

// Canonical role values — must match the Sequelize ENUM in models/User.js.
const ROLES = Object.freeze({ FM: 'FM', STAFF: 'Staff', TENANT: 'Tenant' });

// Role-gate middleware. Use AFTER verifyToken (needs req.user populated).
//   router.get('/admin', verifyToken, requireRole('FM'), handler)
//   router.get('/ops',   verifyToken, requireRole('FM', 'Staff'), handler)
// 401 = no/invalid token (handled by verifyToken); 403 = valid token, wrong role.
const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: "Insufficient permissions for this resource." });
    }
    next();
};

// Allows a trusted internal service (the Python AI engine) to call an endpoint using a
// shared secret header instead of a user JWT, OR a logged-in user with an allowed role.
//   router.post('/detection-alerts', verifyServiceOrRole('FM', 'Staff'), handler)
// Used only where a backend service posts data server-to-server (e.g. AI-generated alerts).
const verifyServiceOrRole = (...allowedRoles) => (req, res, next) => {
    const serviceKey = req.headers['x-service-key'];
    if (serviceKey && process.env.AI_SERVICE_KEY && serviceKey === process.env.AI_SERVICE_KEY) {
        return next();
    }
    return verifyToken(req, res, () => requireRole(...allowedRoles)(req, res, next));
};

module.exports = { verifyToken, requireRole, verifyServiceOrRole, ROLES };
