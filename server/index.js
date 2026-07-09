const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Environment-based CORS allowlist (CLIENT_URL + ALLOWED_ORIGINS). When no
// origins are configured it falls back to allow-all for local/LAN development —
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
const userRoute = require('./routes/user');
app.use("/user", userRoute);
const bookingRoutes = require('./routes/booking');
app.use('/api/bookings', bookingRoutes);
const securityRoutes = require('./routes/security');
app.use('/api/security', securityRoutes);
const attendanceRoutes = require('./routes/attendance');
app.use('/api/attendance', attendanceRoutes);
const facialRecognitionRoutes = require('./routes/facialRecognition');
app.use('/api/facial-recognition', facialRecognitionRoutes);
const supportRoutes = require('./routes/support');
app.use('/api/support', supportRoutes);

// Fallback handlers — MUST stay last, after every route is mounted.
const { notFound, errorHandler } = require('./middlewares/errorHandlers');
app.use(notFound);       // unknown route → 404 JSON
app.use(errorHandler);   // anything thrown/forwarded → 500 JSON (no stack leak)

// Sync DB and Start Server
const db = require('./models');
const startCleanupCron = require('./cron/cleanupTranscripts');

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

        for (const name of modelNames) {
            try {
                await db[name].sync({ alter: true });
                console.log(`  ✔ Synced: ${name}`);
            } catch (syncErr) {
                failedModels.push(name);
                console.error(`  ✖ Failed to sync ${name}:`, syncErr.message);
            }
        }

        if (failedModels.length > 0) {
            console.warn(`\nWARNING: ${failedModels.length} model(s) failed to sync: ${failedModels.join(', ')}`);
            console.warn("The server will start, but those tables may be missing or outdated.\n");
        }

        // Start PDPA 90-day transcript cleanup cron
        startCleanupCron(db);

        let port = process.env.APP_PORT || 5000;
        app.listen(port, '127.0.0.1', () => {
            console.log("--------------------------------------------------");
            console.log(`FlowGuard Server is FULLY READY on port ${port}`);
            console.log("--------------------------------------------------");
        });
    } catch (err) {
        console.error("Database Sync Error: ", err);
    }
}

startServer();
