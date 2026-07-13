const express = require('express');
const router = express.Router();
const { User, Attendance, Invite, SecurityLog } = require('../models');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const yup = require('yup');
const axios = require('axios');
const crypto = require('crypto');
const { verifyToken, requireRole } = require('../middlewares/auth');
require('dotenv').config();

// --- MIDDLEWARE ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

    jwt.verify(token, process.env.APP_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token." });

        const user = await User.findByPk(decoded.id);
        if (!user || user.isActive === false) {
            return res.status(403).json({ message: "Account suspended. Session terminated." });
        }

        req.user = decoded;
        next();
    });
};

// --- REGISTRATION (Multi-Level Security Gate) ---
router.post("/register", async (req, res) => {
    const { recaptchaToken, ...userData } = req.body;
    try {
        if (!recaptchaToken) return res.status(400).json({ errors: ["Security token missing."] });

        // 1. reCAPTCHA Verification
        const params = new URLSearchParams();
        params.append('secret', process.env.RECAPTCHA_SECRET_KEY);
        params.append('response', recaptchaToken);

        const googleResponse = await axios.post('https://www.google.com/recaptcha/api/siteverify', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!googleResponse.data.success || googleResponse.data.score < 0.5) {
            return res.status(403).json({ errors: ["Security check failed. Please try again."] });
        }

        // 2. Data Validation
        let validationSchema = yup.object({
            name: yup.string().trim().required("Full name is required"),
            email: yup.string().trim().email("Invalid email format").required("Email is required"),
            password: yup.string().trim().min(8, "Password must be at least 8 characters").required(),
            role: yup.string().oneOf(['FM', 'Tenant', 'Staff']).required("Role is required"),
            tenantCode: yup.string().required("Access code is required")
        });

        let validatedData = await validationSchema.validate(userData, { abortEarly: false });

        // --- 3. THE SECURITY GATE ---

        // BLOCK A: Prevent anyone from registering as FM publicly
        if (validatedData.role === 'FM') {
            return res.status(403).json({ errors: ["Administrative accounts cannot be created publicly."] });
        }

        // BLOCK B: Tenant Registration (One-Time Invite Check)
        if (validatedData.role === 'Tenant') {
            const invite = await Invite.findOne({
                where: { code: validatedData.tenantCode, role: 'Tenant', isUsed: false }
            });

            if (!invite) {
                return res.status(401).json({ errors: ["Invalid or used Invitation Code. Contact the FM office."] });
            }

            // Check Expiration (e.g., 24h/48h set when invite was created)
            if (new Date() > invite.expiresAt) {
                return res.status(401).json({ errors: ["This invitation code has expired."] });
            }

            // Mark invite as used so it cannot be used again
            await invite.update({ isUsed: true });
        }

        // BLOCK C: Staff Registration (Hybrid Security Logic)
        if (validatedData.role === 'Staff') {
            const employer = await User.findOne({
                where: { role: 'Tenant', companyCode: validatedData.tenantCode }
            });

            if (!employer) {
                return res.status(400).json({ errors: ["Invalid Unit Registration Code. Contact your manager."] });
            }

            // Time Expiration Check (48 Hours)
            const fortyEightHours = 48 * 60 * 60 * 1000;
            const isExpired = Date.now() - new Date(employer.codeCreatedAt).getTime() > fortyEightHours;

            if (isExpired) {
                return res.status(401).json({ errors: ["This unit code has expired (48h limit). Ask your manager to refresh it."] });
            }

            // Usage Limit Check (Capacity)
            if (employer.codeCurrentUsage >= employer.codeMaxUsage) {
                return res.status(401).json({ errors: ["Registration capacity reached for this unit."] });
            }

            // Link Staff to Tenant and increment usage
            validatedData.managerId = employer.id;
            await employer.increment('codeCurrentUsage');
        }

        // 4. Hash & Save
        validatedData.password = await bcrypt.hash(validatedData.password, 10);
        let result = await User.create(validatedData);

        res.json({ message: "Account registered successfully.", id: result.id });

    } catch (err) {
        console.error("Registration Error Logic:", err);
        let errorMessages = [];
        if (err.name === 'SequelizeUniqueConstraintError') {
            errorMessages = ["This email is already registered in our system."];
        } else if (err.errors) {
            errorMessages = err.errors.map(e => (typeof e === 'object' ? e.message : e));
        } else {
            errorMessages = [err.message || "An unexpected system error occurred."];
        }
        res.status(400).json({ errors: errorMessages });
    }
});

// --- FM ONLY: Get all generated invites ---
router.post("/invite-tenant", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'FM') return res.status(403).json({ message: "Access Denied." });

        const inviteCode = `INVITE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

        // CRITICAL: Ensure Invite is imported at the top of this file
        await Invite.create({
            code: inviteCode,
            role: 'Tenant',
            expiresAt: expiry
        });

        res.json({ inviteCode, message: "Invitation generated." });
    } catch (err) {
        console.error("Invite Error:", err);
        res.status(500).json({ error: "Failed to generate invitation." });
    }
});

// --- KEY GENERATION (Updated to reset Hybrid Fields) ---
router.put("/generate-code", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Tenant') return res.status(403).json({ message: "Access Denied." });

        const randomString = crypto.randomBytes(3).toString('hex').toUpperCase();
        const newCode = `FLOW-${randomString}`;

        await User.update({
            companyCode: newCode,
            codeCreatedAt: new Date(),
            codeCurrentUsage: 0,
            codeMaxUsage: 10
        }, {
            where: { id: req.user.id }
        });

        res.json({ companyCode: newCode });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});


router.post("/login", async (req, res) => {
    let { email, password, recaptchaToken } = req.body;

    try {
        // 1. Validate ReCAPTCHA Token with Google
        const recaptchaRes = await fetch(
            `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`,
            { method: 'POST' }
        );
        const recaptchaData = await recaptchaRes.json();

        if (!recaptchaData.success) {
            return res.status(400).json({ message: "Security verification failed." });
        }

        // 2. Find User (Use timing-attack protection logic)
        const user = await User.findOne({ where: { email } });

        // Define a dummy hash to compare against if user doesn't exist
        const dummyHash = "$2b$10$abcdefghijklmnopqrstuv";
        const passwordToCompare = user ? user.password : dummyHash;

        // 3. Compare password
        const match = await bcrypt.compare(password, passwordToCompare);

        // If user not found OR password doesn't match
        if (!user || !match) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // 4. Check account status
        if (user.isActive === false) {
            return res.status(403).json({ message: "Access Denied: Account suspended." });
        }

        // 5. Generate JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.APP_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                isEnrolled: user.isEnrolled
            }
        });

    } catch (err) {
        console.error("Login Route Error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get("/my-code", authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['companyCode', 'codeCurrentUsage', 'codeMaxUsage', 'codeCreatedAt']
        });
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.get("/my-staff", authenticateToken, async (req, res) => {
    try {
        const myStaff = await User.findAll({
            where: { role: 'Staff', managerId: req.user.id },
            attributes: ['id', 'name', 'email', 'createdAt']
        });
        res.json(myStaff);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.get("/", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'FM') return res.status(403).json({ message: "Unauthorized." });

        const users = await User.findAll({
            attributes: ['id', 'name', 'email', 'role', 'isActive', 'createdAt'],
            include: [{
                model: Attendance,
                as: 'Attendances',
                limit: 1,
                order: [['timestamp', 'DESC']]
            }]
        });

        const userList = users.map(user => {
            const latestScan = user.Attendances[0];
            return {
                ...user.toJSON(),
                locationStatus: latestScan ? (latestScan.type === 'IN' ? 'On-Site' : 'Off-Site') : 'Off-Site'
            };
        });

        res.json(userList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.put("/suspend/:id", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'FM') return res.status(403).json({ message: "Unauthorized." });

        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found." });

        await user.update({ isActive: !user.isActive });
        res.json({ message: `User status updated to ${user.isActive ? 'Active' : 'Suspended'}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.get("/logs/:id", authenticateToken, requireRole('FM'), async (req, res) => {
    try {
        const logs = await Attendance.findAll({
            where: { userId: req.params.id },
            order: [['timestamp', 'DESC']],
            limit: 50
        });
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const staffMember = await User.findByPk(req.params.id);
        if (!staffMember) return res.status(404).json({ message: "Not found." });

        if (String(staffMember.id) === String(req.user.id)) {
            return res.status(400).json({ message: "Self-deletion is restricted. Ask another Facilities Manager to off-board this account." });
        }

        const isFacilitiesManager = req.user.role === 'FM';
        const isTenantDeletingOwnStaff = req.user.role === 'Tenant' && staffMember.managerId === req.user.id;

        if (!isFacilitiesManager && !isTenantDeletingOwnStaff) {
            return res.status(403).json({ message: "Unauthorized action." });
        }

        // --- PDPA-COMPLIANT OFF-BOARDING (data minimisation) ---
        // 1. Explicitly wipe the biometric vector before removing the row, so the
        //    face embedding can never linger even if the delete is interrupted.
        await staffMember.update({ faceVector: null, isEnrolled: false });

        // 2. Hard-delete the user record + their attendance trail (cascade).
        await Attendance.destroy({ where: { userId: staffMember.id } });

        // 3. Anonymise — not delete — the security/access logs that referenced this
        //    person. We keep the events for the security audit trail, but strip the
        //    PII (name) so no biometric-linked identity remains. SecurityLog links by
        //    name (no FK), so we match on the stored personnelName.
        await SecurityLog.update(
            { personnelName: null },
            { where: { personnelName: staffMember.name } }
        );

        await staffMember.destroy();
        res.json({ message: "Removed successfully. Biometric data wiped and access logs anonymised." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

// POST: /user/enroll-face
router.post('/enroll-face', verifyToken, async (req, res) => {
    try {
        const { images, targetUserId } = req.body;

        if (!images?.front || !images?.left || !images?.right) {
            return res.status(400).json({ error: "Front, left, and right face images are required." });
        }

        const requester = await User.findByPk(req.user.id);
        if (!requester || requester.isActive === false) {
            return res.status(403).json({ error: "Account is inactive or no longer exists." });
        }

        const requestedUserId = targetUserId || req.user.id;
        const isSelfEnrollment = String(requestedUserId) === String(req.user.id);

        if (!isSelfEnrollment && requester.role !== 'FM') {
            return res.status(403).json({ error: "Only Facilities Managers can re-enroll another user's Face ID." });
        }

        const targetUser = await User.findByPk(requestedUserId);
        if (!targetUser) {
            return res.status(404).json({ error: "Target user not found." });
        }

        console.log(`Starting face enrollment for User ID: ${targetUser.id}`);

        // 1. Send the images to the Python face AI service (with a timeout so we never hang).
        //    FACE_AI_URL is a BASE url (e.g. http://127.0.0.1:8501); endpoint paths are appended.
        const faceAiUrl = process.env.FACE_AI_URL || 'http://127.0.0.1:8501';
        const pythonResponse = await axios.post(`${faceAiUrl}/api/encode-faces`, {
            front: images.front,
            left: images.left,
            right: images.right
        }, { timeout: 20000 });

        const faceVector = pythonResponse.data?.vector; // The 512-number array

        // Guard against an unexpected/empty AI response so we don't store junk.
        if (!Array.isArray(faceVector) || faceVector.length === 0) {
            return res.status(502).json({ error: "Unexpected response from facial recognition service." });
        }

        // 2. Save to PostgreSQL using Sequelize
        await User.update(
            { faceVector, isEnrolled: true },
            { where: { id: targetUser.id } }
        );

        // 3. Ask the AI service to reload its in-memory known-face cache so the newly
        //    enrolled face is recognised immediately on V-Patrol/Gate Scanner — no AI
        //    restart needed. A refresh failure must NOT fail the enrolment (the cache
        //    reloads on the next AI-service restart anyway).
        try {
            await axios.get(`${faceAiUrl}/refresh`, { timeout: 5000 });
            return res.status(200).json({ message: "Biometric enrollment successful" });
        } catch (refreshErr) {
            console.warn("AI face-cache refresh failed (enrolment still saved):", refreshErr.message);
            return res.status(200).json({ message: "Face enrolled, AI cache refresh pending." });
        }

    } catch (error) {
        // Developer log only.
        console.error("Enrollment Error:", error.response ? error.response.data : error.message);

        // AI service offline / unreachable / timed out → 503 (clear, not a generic 500).
        const isConnError = !error.response &&
            ['ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code);
        if (isConnError) {
            return res.status(503).json({ error: "Facial recognition service is offline. Please try again shortly." });
        }

        // AI service replied with an error (e.g. 400 "No face detected") → forward its status.
        if (error.response) {
            const status = error.response.status === 400 ? 400 : 502;
            return res.status(status).json({
                error: error.response.data?.detail || "Failed to generate biometric vector."
            });
        }

        // Anything else → safe generic 500.
        res.status(500).json({ error: "Failed to generate biometric vector." });
    }
});

// --- MANUAL USER CREATION (role-gated, additive) ---
// Role rules (enforced server-side):
//   FM     -> may create Tenant accounts
//   Tenant -> may create Staff accounts (linked to that Tenant via managerId)
//   Staff / Public -> cannot create users
//   No one can create FM accounts through this flow.
// The invite-code self-registration flow (POST /register) remains unchanged as an alternative.
router.post('/manual-create', authenticateToken, async (req, res) => {
    try {
        const creatorRole = req.user.role;

        let targetRole;
        if (creatorRole === 'FM') targetRole = 'Tenant';
        else if (creatorRole === 'Tenant') targetRole = 'Staff';
        else return res.status(403).json({ errors: ["You do not have permission to add users."] });

        // If the client sends an explicit role, it must match what this creator may create.
        // This blocks FM->FM/Staff and Tenant->Tenant/FM even if the request is tampered with.
        if (req.body.role && req.body.role !== targetRole) {
            return res.status(403).json({ errors: [`You can only create ${targetRole} accounts.`] });
        }

        const { firstName, lastName, name, email, password } = req.body;
        const displayName = (name && String(name).trim())
            || [firstName, lastName].map(v => (v || '').trim()).filter(Boolean).join(' ');

        const schema = yup.object({
            name: yup.string().trim().min(2, "Name is required").required("Name is required"),
            email: yup.string().trim().email("Invalid email format").required("Email is required"),
            password: yup.string().min(8, "Temporary password must be at least 8 characters").required("Password is required"),
        });
        const validated = await schema.validate(
            { name: displayName, email, password },
            { abortEarly: false }
        );

        const hashedPassword = await bcrypt.hash(validated.password, 10);

        const newUser = await User.create({
            name: validated.name,
            email: validated.email,
            password: hashedPassword,
            role: targetRole,
            isActive: true,
            // Tenant-created Staff belong to that Tenant so they appear in /my-staff.
            managerId: creatorRole === 'Tenant' ? req.user.id : null,
        });

        // Never return the password hash.
        return res.status(201).json({
            message: `${targetRole} account created.`,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isActive: newUser.isActive,
            }
        });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ errors: ["This email is already registered in our system."] });
        }
        if (err.errors && Array.isArray(err.errors)) {
            return res.status(400).json({ errors: err.errors.map(e => (typeof e === 'object' ? e.message : e)) });
        }
        console.error("Manual create error:", err);
        return res.status(500).json({ errors: ["An unexpected error occurred while creating the account."] });
    }
});

module.exports = router;
