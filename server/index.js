const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Environment-based CORS allowlist (CLIENT_URL + ALLOWED_ORIGINS). When no
// origins are configured it falls back to allow-all for local/LAN development â€”
// configure CLIENT_URL (and optionally ALLOWED_ORIGINS) for any deployment.
const { buildCorsOptions } = require('./middlewares/corsOptions');
app.use(cors(buildCorsOptions()));

// Simple Route
app.get("/", (req, res) => {
    res.send("FlowGuard Node.js Backend is Active.");
});

// Map Routes
const incidentRoute = require('./routes/incident');
app.use("/api/incident", incidentRoute);
const zonesRoute = require('./routes/zones');
app.use("/api/zones", zonesRoute);
const camerasRoute = require('./routes/cameras');
app.use("/api/cameras", camerasRoute);
const detectionAlertsRoute = require('./routes/detectionAlerts');
app.use("/api/detection-alerts", detectionAlertsRoute);
const edgeDetectionAlertsRoute = require('./routes/edgeDetectionAlerts');
app.use("/api/edge", edgeDetectionAlertsRoute);
const userRoute = require('./routes/user');
app.use("/user", userRoute);
const bookingRoutes = require('./routes/booking');
app.use('/api/bookings', bookingRoutes);
const securityRoutes = require('./routes/security');
app.use('/api/security', securityRoutes);
const attendanceRoutes = require('./routes/attendance');
app.use('/api/attendance', attendanceRoutes);
const dashboardRoutes = require('./routes/dashboard');
app.use('/api/dashboard', dashboardRoutes);
const facialRecognitionRoutes = require('./routes/facialRecognition');
app.use('/api/facial-recognition', facialRecognitionRoutes);
const supportRoutes = require('./routes/support');
app.use('/api/support', supportRoutes);

// Fallback handlers â€” MUST stay last, after every route is mounted.
const { notFound, errorHandler } = require('./middlewares/errorHandlers');
app.use(notFound);       // unknown route â†’ 404 JSON
app.use(errorHandler);   // anything thrown/forwarded â†’ 500 JSON (no stack leak)

// Sync DB and Start Server
const db = require('./models');
const startCleanupCron = require('./cron/cleanupTranscripts');
// Cloud-compatible binding: PORT (cloud) â†’ APP_PORT (local .env) â†’ 5001,
// listening on 0.0.0.0 so deployed containers accept external traffic.
const { resolvePort, resolveHost } = require('./config/serverConfig');

async function startServer() {
    try {
        // IMPORTANT: faceVector is stored as a PostgreSQL FLOAT[] (Sequelize ARRAY(FLOAT)),
        // NOT pgvector. We intentionally do NOT create the pgvector extension or drop the
        // "faceVector" column on startup. The previous drop-on-fallback logic wiped every
        // enrolled face on each restart, so it has been removed. Sequelize sync (below)
        // manages the column safely without data loss.

        const modelNames = Object.keys(db).filter(
            k => k !== 'sequelize' && k !== 'Sequelize'
        );
        const failedModels = [];

        // Visible startup progress: the HTTP listener only binds AFTER this
        // loop, so a slow remote database must never look like a silent hang
        // (the classic symptom is the Vite proxy timing out on 127.0.0.1:5001).
        console.log(`Syncing ${modelNames.length} models (alter:true) â€” port ${resolvePort()} opens when this finishes...`);
        const syncStart = Date.now();

        for (const [i, name] of modelNames.entries()) {
            // Heartbeat: if one model sync stalls (slow/unreachable DB), keep
            // saying so instead of going quiet.
            const heartbeat = setInterval(() => {
                console.log(`  â€¦ still syncing ${name} (${Math.round((Date.now() - syncStart) / 1000)}s elapsed) â€” check DB_HOST/network if this persists`);
            }, 10000);
            const modelStart = Date.now();
            try {
                await db[name].sync({ alter: true });
                console.log(`  âœ” [${i + 1}/${modelNames.length}] Synced: ${name} (${Date.now() - modelStart}ms)`);
            } catch (syncErr) {
                failedModels.push(name);
                console.error(`  âœ– [${i + 1}/${modelNames.length}] Failed to sync ${name}:`, syncErr.message);
            } finally {
                clearInterval(heartbeat);
            }
        }
        console.log(`Model sync finished in ${Math.round((Date.now() - syncStart) / 1000)}s.`);

        if (failedModels.length > 0) {
            console.warn(`\nWARNING: ${failedModels.length} model(s) failed to sync: ${failedModels.join(', ')}`);
            console.warn("The server will start, but those tables may be missing or outdated.\n");
        }

        // Start PDPA 90-day transcript cleanup cron
        startCleanupCron(db);

        const port = resolvePort();
        const host = resolveHost();
        app.listen(port, host, () => {
            console.log("--------------------------------------------------");
            console.log(`FlowGuard Server is FULLY READY on ${host}:${port}`);
            console.log("--------------------------------------------------");
        });
    } catch (err) {
        console.error("Database Sync Error: ", err);
    }
}

startServer();
