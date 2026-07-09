const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // 1. Grab the token from the request header
    const authHeader = req.headers['authorization'];
    
    // Tokens usually come in as "Bearer <token_string>", so we split it to just get the string
    const token = authHeader && authHeader.split(' ')[1]; 

    // 2. If there is no token, kick them out
    if (!token) {
        return res.status(401).json({ message: "Access Denied. No security token provided." });
    }

    try {
        // 3. Verify the token using your secret key
        const decoded = jwt.verify(token, process.env.APP_SECRET);
        
        // 4. Attach the decoded user data (like their ID) to the request
        req.user = decoded; 
        
        // 5. Let them through to the actual route!
        next(); 

    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired security token." });
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
