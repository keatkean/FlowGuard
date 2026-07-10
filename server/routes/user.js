const express = require('express');
const router = express.Router();
const { User, Attendance, Invite, SecurityLog, Booking, sequelize } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const yup = require('yup');
const axios = require('axios');
const crypto = require('crypto');
// Canonical auth middleware: verifies the JWT, then re-reads the account from
// PostgreSQL on EVERY request (deleted → 401, suspended → 403, tokenVersion
// mismatch → 401) and uses the DATABASE role as authoritative.
const { verifyToken, requireRole } = require('../middlewares/auth');
const { createRateLimiter } = require('../middlewares/rateLimit');
const { sendPasswordResetEmail } = require('../services/mailer');
require('dotenv').config();

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
router.post("/invite-tenant", verifyToken, async (req, res) => {
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

// --- FM ONLY: list generated tenant invites (the GET the onboarding page
// calls — previously missing, so the invite list silently rendered empty).
router.get("/tenant-invites", verifyToken, requireRole('FM'), async (req, res) => {
    try {
        const invites = await Invite.findAll({
            order: [['createdAt', 'DESC']],
            limit: 25
        });
        res.json(invites);
    } catch (err) {
        console.error("Invite list error:", err);
        res.status(500).json({ error: "Failed to load invitations." });
    }
});

// --- KEY GENERATION (Updated to reset Hybrid Fields) ---
router.put("/generate-code", verifyToken, async (req, res) => {
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

        // 5. Generate JWT Token. tokenVersion is stamped into the token and
        // re-checked on every authenticated request — bumping it (password
        // change/reset, suspension) instantly revokes tokens on lost devices.
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
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

router.get("/my-code", verifyToken, async (req, res) => {
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

router.get("/my-staff", verifyToken, async (req, res) => {
    try {
        const myStaff = await User.findAll({
            where: { role: 'Staff', managerId: req.user.id },
            // Safe fields only — isEnrolled shows Face ID status, never the template.
            attributes: ['id', 'name', 'email', 'isEnrolled', 'isActive', 'createdAt']
        });
        res.json(myStaff);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.get("/", verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'FM') return res.status(403).json({ message: "Unauthorized." });

        const users = await User.findAll({
            // isEnrolled is a safe boolean flag — the protected biometric
            // template itself (faceVector) is NEVER selected or returned.
            attributes: ['id', 'name', 'email', 'role', 'isActive', 'isEnrolled', 'createdAt'],
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

router.put("/suspend/:id", verifyToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found." });

        // FM may suspend/reactivate anyone; a Tenant only their OWN Staff.
        const isFM = req.user.role === 'FM';
        const isTenantManagingOwnStaff =
            req.user.role === 'Tenant' && user.role === 'Staff' && user.managerId === req.user.id;
        if (!isFM && !isTenantManagingOwnStaff) {
            return res.status(403).json({ message: "Unauthorized." });
        }

        const suspending = user.isActive === true;
        await user.update(
            suspending
                // Suspension also bumps tokenVersion so every already-issued
                // JWT for this account is rejected on its very next request.
                ? { isActive: false, tokenVersion: (user.tokenVersion ?? 0) + 1 }
                : { isActive: true }
        );
        res.json({ message: `User status updated to ${user.isActive ? 'Active' : 'Suspended'}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

router.get("/logs/:id", verifyToken, requireRole('FM'), async (req, res) => {
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

router.delete("/:id", verifyToken, async (req, res) => {
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

        // Tenant off-boarding guard: never leave orphan Staff. The FM must
        // remove or reassign the tenant's Staff before the tenant account
        // itself can be deleted (safest PoC behaviour → 409 Conflict).
        if (staffMember.role === 'Tenant') {
            const linkedStaff = await User.count({ where: { role: 'Staff', managerId: staffMember.id } });
            if (linkedStaff > 0) {
                return res.status(409).json({
                    message: `This tenant still has ${linkedStaff} linked Staff account(s). Remove or reassign them before off-boarding the tenant.`
                });
            }
        }

        const targetId = staffMember.id;
        const targetName = staffMember.name;

        // --- PDPA-COMPLIANT OFF-BOARDING (data minimisation, TRANSACTIONAL) ---
        // Every step commits together or not at all — no half-deleted accounts.
        await sequelize.transaction(async (t) => {
            // 1. Explicitly wipe the protected biometric template first, so it
            //    can never linger even if a later step fails and is retried.
            await staffMember.update({ faceVector: null, isEnrolled: false }, { transaction: t });

            // 2. Hard-delete their attendance trail.
            await Attendance.destroy({ where: { userId: targetId }, transaction: t });

            // 3. Anonymise — not delete — the security/access logs that referenced
            //    this person. The events stay for the security audit trail, but the
            //    personal linkage (name + matched user id) is stripped, and any
            //    description containing their name is replaced with a neutral one.
            await SecurityLog.update(
                { personnelName: null, matchedUserId: null },
                {
                    where: { [Op.or]: [{ personnelName: targetName }, { matchedUserId: targetId }] },
                    transaction: t
                }
            );
            await SecurityLog.update(
                { desc: 'Access event retained for audit — personnel record removed and identity anonymised.' },
                { where: { desc: { [Op.like]: `%${targetName}%` } }, transaction: t }
            );

            // 4. Bookings keep their operational audit trail (ref, company,
            //    schedule, gate scans) but lose the personal account linkage.
            await Booking.update(
                { tenantId: null },
                { where: { tenantId: targetId }, transaction: t }
            );

            // 5. Hard-delete the user row itself.
            await staffMember.destroy({ transaction: t });
        });

        // 4. Ask the AI service to reload its known-face cache so the wiped
        //    template disappears from memory immediately. NON-FATAL: the
        //    off-boarding already succeeded; the cache also reloads on restart.
        try {
            const faceAiUrl = process.env.FACE_AI_URL || 'http://127.0.0.1:8501';
            await axios.get(`${faceAiUrl}/refresh`, {
                timeout: 5000,
                headers: { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY || '' }
            });
        } catch (refreshErr) {
            console.warn("AI face-cache refresh after off-boarding failed (non-fatal):", refreshErr.message);
        }

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

        const targetUser = await User.findByPk(requestedUserId);
        if (!targetUser) {
            return res.status(404).json({ error: "Target user not found." });
        }

        // Enrolment permissions:
        //  - any authenticated user may enrol/re-enrol THEMSELVES
        //  - FM may enrol/re-enrol ANY user
        //  - a Tenant may re-enrol only their OWN Staff (target.managerId === requester.id)
        //  - Staff can never enrol another account
        const isTenantEnrollingOwnStaff =
            requester.role === 'Tenant' &&
            targetUser.role === 'Staff' &&
            targetUser.managerId === requester.id;

        if (!isSelfEnrollment && requester.role !== 'FM' && !isTenantEnrollingOwnStaff) {
            return res.status(403).json({ error: "Only Facilities Managers can re-enroll another user's Face ID." });
        }

        console.log(`Starting face enrollment for User ID: ${targetUser.id}`);

        // 1. Send the images to the Python face AI service (with a timeout so we never hang).
        //    FACE_AI_URL is a BASE url (e.g. http://127.0.0.1:8501); endpoint paths are appended.
        const faceAiUrl = process.env.FACE_AI_URL || 'http://127.0.0.1:8501';
        //    Images live only in request memory (browser → Node → FastAPI); they are
        //    never written to the DB, disk, cloud storage, or logs. Only the resulting
        //    protected biometric template is stored against the User ID.
        const pythonResponse = await axios.post(`${faceAiUrl}/api/encode-faces`, {
            front: images.front,
            left: images.left,
            right: images.right
        }, {
            timeout: 20000,
            headers: { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY || '' }
        });

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
            await axios.get(`${faceAiUrl}/refresh`, {
                timeout: 5000,
                headers: { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY || '' }
            });
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
router.post('/manual-create', verifyToken, async (req, res) => {
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

// --- CHANGE PASSWORD (any authenticated user, own account only) ---
// Verifies the CURRENT password before accepting the new one, then bumps
// tokenVersion so every previously issued JWT (all devices) is revoked and
// the user must log in again with the new password. Never returns hashes.
router.put('/change-password', verifyToken, async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current and new password are required." });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ message: "New password must be at least 8 characters." });
        }
        if (newPassword === currentPassword) {
            return res.status(400).json({ message: "New password must be different from the current password." });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(401).json({ message: "Account no longer exists." });

        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) {
            return res.status(401).json({ message: "Current password is incorrect." });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await user.update({
            password: hashed,
            tokenVersion: (user.tokenVersion ?? 0) + 1 // revoke all existing sessions
        });

        return res.json({ message: "Password changed successfully. Please log in again with your new password." });
    } catch (err) {
        console.error("Change-password error:", err);
        return res.status(500).json({ message: "Internal server error." });
    }
});

// --- FORGOT PASSWORD (public, rate-limited) ---
// ALWAYS answers with the same generic message so the endpoint cannot be used
// to probe which emails exist. Stores only the SHA-256 hash of a random token
// (15-minute expiry) and emails ${CLIENT_URL}/reset-password?token=... via the
// server-only SMTP configuration (services/mailer.js).
const forgotPasswordLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const GENERIC_FORGOT_RESPONSE = {
    message: "If that email matches an authorized FlowGuard profile, a secure reset link has been sent."
};

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const email = String(req.body.email || '').trim();
        if (!email) return res.json(GENERIC_FORGOT_RESPONSE);

        const user = await User.findOne({ where: { email } });
        if (user) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            await user.update({
                passwordResetTokenHash: tokenHash,
                passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
            const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

            try {
                await sendPasswordResetEmail(user.email, resetUrl);
            } catch (mailErr) {
                // Still answer generically — never leak whether the account exists.
                console.error("Password-reset email failed:", mailErr.message);
            }
        }

        return res.json(GENERIC_FORGOT_RESPONSE);
    } catch (err) {
        console.error("Forgot-password error:", err);
        return res.json(GENERIC_FORGOT_RESPONSE);
    }
});

// --- RESET PASSWORD (public, token from the emailed link) ---
router.post('/reset-password', async (req, res) => {
    try {
        const token = String(req.body.token || '');
        const newPassword = String(req.body.newPassword || '');

        if (!token) return res.status(400).json({ message: "Reset token is required." });
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: "New password must be at least 8 characters." });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            where: {
                passwordResetTokenHash: tokenHash,
                passwordResetExpiresAt: { [Op.gt]: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await user.update({
            password: hashed,
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
            tokenVersion: (user.tokenVersion ?? 0) + 1 // revoke every existing session
        });

        return res.json({ message: "Password reset successful. Please log in with your new password." });
    } catch (err) {
        console.error("Reset-password error:", err);
        return res.status(500).json({ message: "Internal server error." });
    }
});

module.exports = router;
