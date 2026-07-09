// Environment-based CORS allowlist.
//
// Origins come from:
//   CLIENT_URL       — the primary frontend origin (localhost:5173 in dev,
//                      the Vercel URL when deployed)
//   ALLOWED_ORIGINS  — optional comma-separated extras (e.g. LAN dev origins
//                      like http://192.168.1.20:5173, a preview deployment)
//
// Behaviour:
//   - No origins configured  → development fallback: allow any origin
//     (matches the old behaviour so local/LAN testing keeps working), but
//     WITHOUT credentials — a wildcard must never be combined with credentials.
//   - Origins configured     → only listed origins are allowed. Requests with
//     no Origin header (curl, server-to-server, the Python AI engine) pass
//     through; CORS only governs browsers.

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');

const buildAllowedOrigins = (env = process.env) => {
  const origins = [env.CLIENT_URL, ...(env.ALLOWED_ORIGINS || '').split(',')]
    .map(normalizeOrigin)
    .filter(Boolean);
  return [...new Set(origins)];
};

const buildCorsOptions = (env = process.env) => {
  const allowed = buildAllowedOrigins(env);

  if (allowed.length === 0) {
    // Dev fallback — nothing configured. Never pair this with credentials.
    return { origin: '*' };
  }

  return {
    origin: (origin, callback) => {
      // Non-browser callers send no Origin header — let them through.
      if (!origin || allowed.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      return callback(null, false); // browser gets no CORS headers → blocked
    },
  };
};

module.exports = { buildAllowedOrigins, buildCorsOptions, normalizeOrigin };
