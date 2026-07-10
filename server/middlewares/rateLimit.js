// Minimal in-memory fixed-window rate limiter for the PoC (single Node
// process). Keyed per client IP by default; used to throttle the public
// forgot-password endpoint so it can't be used to spam mail or probe accounts.
const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 5, keyFn } = {}) => {
    const hits = new Map(); // key -> { count, windowStart }

    return (req, res, next) => {
        const now = Date.now();
        const key = keyFn ? keyFn(req) : (req.ip || req.socket?.remoteAddress || 'unknown');

        const entry = hits.get(key);
        if (!entry || now - entry.windowStart >= windowMs) {
            hits.set(key, { count: 1, windowStart: now });
            return next();
        }

        entry.count += 1;
        if (entry.count > max) {
            return res.status(429).json({ message: "Too many requests. Please try again later." });
        }
        next();
    };
};

module.exports = { createRateLimiter };
