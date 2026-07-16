// Password-reset mail delivery (Nodemailer). Server-only configuration —
// SMTP credentials live exclusively in backend env vars and are NEVER exposed
// through any VITE_ variable or API response. A Gmail App Password is fine for
// the local/school PoC (SMTP_HOST=smtp.gmail.com, SMTP_PORT=465).
const nodemailer = require('nodemailer');

const isMailConfigured = () =>
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const buildTransport = () => {
    const port = Number(process.env.SMTP_PORT || 587);
    // SMTP_SECURE=true → implicit TLS (port 465); false → STARTTLS (port 587).
    // When SMTP_SECURE is unset, infer it from the port.
    const secure = process.env.SMTP_SECURE != null && process.env.SMTP_SECURE !== ''
        ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
        : port === 465;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

/**
 * Send the password-reset link. The caller stores only the SHA-256 hash of the
 * token; the raw link exists only in this outbound email.
 *
 * SMTP not configured:
 *  - development: the send is simulated and the link is printed to the server
 *    console so the flow can be tested locally without a mail account.
 *  - production: NEVER print the token/link — throw a controlled configuration
 *    error instead. The forgot-password route catches it and still returns its
 *    generic public response, so account enumeration stays impossible.
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
    if (!isMailConfigured()) {
        if (process.env.NODE_ENV === 'production') {
            // Controlled internal error — contains no token, link, or address.
            throw new Error('MAIL_NOT_CONFIGURED: SMTP_HOST/SMTP_USER/SMTP_PASS are missing.');
        }
        console.warn(`[mailer] SMTP not configured — simulated password-reset email to ${toEmail}: ${resetUrl}`);
        return { simulated: true };
    }

    const transporter = buildTransport();
    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: toEmail,
        subject: 'FlowGuard — Password Reset',
        text:
            `A password reset was requested for your FlowGuard account.\n\n` +
            `Reset your password (link expires in 15 minutes):\n${resetUrl}\n\n` +
            `If you did not request this, you can safely ignore this email.`,
        html:
            `<p>A password reset was requested for your FlowGuard account.</p>` +
            `<p><a href="${resetUrl}">Reset your password</a> — this link expires in <strong>15 minutes</strong>.</p>` +
            `<p>If you did not request this, you can safely ignore this email.</p>`,
    });
    return { simulated: false };
}

module.exports = { sendPasswordResetEmail, isMailConfigured };
