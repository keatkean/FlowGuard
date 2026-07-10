const express = require('express');
const router = express.Router();
const axios = require('axios');
const { User } = require('../models');
const { verifyToken, requireRole } = require('../middlewares/auth');
const { shouldWriteLog, createSecurityLog } = require('../services/securityAudit');

// FACE_AI_URL is the BASE url of the InsightFace service; paths are appended.
const FACE_AI_URL = () => process.env.FACE_AI_URL || 'http://127.0.0.1:8501';

// Base64 data-URL frames are ~1.33x the JPEG size; 8 MB of text comfortably
// covers the 420px-wide compressed frames the scanners send, and rejects abuse.
const MAX_IMAGE_CHARS = 8 * 1024 * 1024;

// --- Access control -----------------------------------------------------------
// Gate Scanner / V-Patrol run under an FM session. A trusted edge device (e.g. a
// future Pi node posting frames itself) may authenticate with EDGE_SERVICE_TOKEN
// in an x-edge-token header instead of a user JWT.
const allowFMOrEdgeService = (req, res, next) => {
  const edgeToken = req.headers['x-edge-token'];
  if (edgeToken && process.env.EDGE_SERVICE_TOKEN && edgeToken === process.env.EDGE_SERVICE_TOKEN) {
    return next();
  }
  return verifyToken(req, res, () => requireRole('FM')(req, res, next));
};


const validateFrame = (image) => {
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return { status: 400, error: 'A base64 data-URL image is required.' };
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return { status: 413, error: 'Image payload too large.' };
  }
  return null;
};

const forwardRecognitionFrame = async (image) => {
  const startedAt = Date.now();
  const aiResponse = await axios.post(`${FACE_AI_URL()}/user/recognize`, { image }, {
    timeout: 15000,
    headers: { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY || '' }
  });
  return { aiResult: aiResponse.data || {}, totalRequestMs: Date.now() - startedAt };
};

const livenessStatus = (ratio) => {
  if (typeof ratio !== 'number') return 'unavailable';
  return ratio < 0.35 || ratio > 0.65 ? 'movement-detected' : 'front-facing';
};

// POST /api/facial-recognition/evaluate
// FM-only side-effect-free model evaluation. It forwards one temporary frame to
// FastAPI and returns safe telemetry only. It never creates Attendance,
// SecurityLogs, User updates, or enrolment changes, and never stores the frame.
router.post('/evaluate', verifyToken, requireRole('FM'), async (req, res) => {
  const validation = validateFrame(req.body?.image);
  if (validation) return res.status(validation.status).json({ error: validation.error });

  try {
    const { aiResult, totalRequestMs } = await forwardRecognitionFrame(req.body.image);
    const {
      matchedUserId = null,
      confidence = 0,
      box = null,
      liveness_ratio = null,
      faceDetected = false,
      inference_ms = null
    } = aiResult;

    const outcome = faceDetected === false || (!box && matchedUserId == null)
      ? 'NO_FACE'
      : matchedUserId == null ? 'UNKNOWN' : 'MATCHED';

    return res.status(200).json({
      matchedUserId: matchedUserId == null ? null : matchedUserId,
      outcome,
      confidence,
      box,
      liveness: {
        ratio: liveness_ratio,
        status: livenessStatus(liveness_ratio)
      },
      timings: {
        inferenceMs: inference_ms,
        totalRequestMs
      }
    });
  } catch (err) {
    const isConnError = !err.response &&
      ['ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
    if (isConnError) {
      return res.status(503).json({ error: 'Facial recognition service is offline. Please try again shortly.' });
    }
    if (err.response) {
      const status = err.response.status === 400 ? 400 : 502;
      return res.status(status).json({ error: 'Facial recognition service returned an error.' });
    }
    console.error('Evaluation forwarding error:', err.message);
    return res.status(502).json({ error: 'Facial recognition service returned an error.' });
  }
});
// POST /api/facial-recognition/access-event
// V-Patrol monitoring: records a server-owned SAFE access audit event for a
// verified (recognised + liveness-passed) active user WITHOUT touching
// attendance â€” V-Patrol must never toggle clock-in/out; that is the Gate
// Scanner's job via /api/attendance/scan. Deduplicated server-side.
router.post('/access-event', allowFMOrEdgeService, async (req, res) => {
  try {
    const { userId, cameraLocation } = req.body;
    if (userId == null || !Number.isInteger(Number(userId))) {
      return res.status(400).json({ error: 'Missing required parameter: userId' });
    }
    const location = typeof cameraLocation === 'string' && cameraLocation.trim()
      ? cameraLocation.trim().slice(0, 100)
      : 'Biometric Gantry';

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'role', 'isActive', 'isEnrolled']
    });
    if (!user || !user.isEnrolled) {
      return res.status(404).json({ error: 'User not recognized in system registry.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account suspended. Access event not recorded as granted.' });
    }

    // Same dedup namespace as the attendance scan, so a person passing both the
    // gantry and the turnstile within the cooldown yields ONE safe log, not two.
    let logged = false;
    if (shouldWriteLog(`granted:${user.id}:${location}`)) {
      logged = await createSecurityLog({
        type: 'Gantry Access',
        desc: `Identity & liveness verified: ${user.name} (${user.role}) at ${location}.`,
        severity: 'safe',
        icon: 'ðŸ”“',
        personnelName: user.name,
        matchedUserId: user.id,
        cameraLocation: location
      });
    }

    // Safe fields only â€” never the biometric template.
    return res.status(200).json({
      status: 'SUCCESS',
      logged,
      worker: user.name,
      role: user.role
    });
  } catch (err) {
    console.error('Access-event error:', err);
    return res.status(500).json({ error: 'Could not record access event.' });
  }
});

// POST /api/facial-recognition/recognize
// Frontend (Gate Scanner / V-Patrol) â†’ Node â†’ FastAPI â†’ Node resolves the User
// record from PostgreSQL â†’ safe recognition result. The DB â€” not the AI cache â€”
// decides name, role, account status, and the access outcome.
router.post('/recognize', allowFMOrEdgeService, async (req, res) => {
  const { image, cameraLocation } = req.body;

  const validation = validateFrame(image);
  if (validation) return res.status(validation.status).json({ error: validation.error });
  const location = typeof cameraLocation === 'string' && cameraLocation.trim()
    ? cameraLocation.trim().slice(0, 100)
    : 'Main Gate';

  let aiResult;
  const aiStartedAt = Date.now();
  try {
    const aiResponse = await axios.post(`${FACE_AI_URL()}/user/recognize`, { image }, {
      timeout: 15000,
      headers: { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY || '' }
    });
    aiResult = aiResponse.data;
  } catch (err) {
    const isConnError = !err.response &&
      ['ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
    if (isConnError) {
      return res.status(503).json({ error: 'Facial recognition service is offline. Please try again shortly.' });
    }
    if (err.response) {
      const status = err.response.status === 400 ? 400 : 502;
      return res.status(status).json({ error: 'Facial recognition service returned an error.' });
    }
    console.error('Recognition forwarding error:', err.message);
    return res.status(502).json({ error: 'Facial recognition service returned an error.' });
  }

  const { matchedUserId, confidence = 0, box = null, liveness_ratio = 0.5, faceDetected, inference_ms = null } = aiResult || {};

  // Development timing telemetry â€” durations only, never images or templates.
  const nodeToAiMs = Date.now() - aiStartedAt;
  const timings = { nodeToAiMs, inferenceMs: inference_ms, totalRequestMs: nodeToAiMs };
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[recognize] Nodeâ†’FastAPI ${timings.nodeToAiMs}ms, InsightFace inference ${inference_ms ?? '?'}ms`);
  }

  // No face in frame â†’ no recognition attempt, and no suspicious-person log.
  if (faceDetected === false || (!box && matchedUserId == null)) {
    return res.status(200).json({ user: null, box: null, liveness_ratio, timings });
  }

  // Face detected but no template match â†’ unknown person.
  if (matchedUserId == null) {
    if (shouldWriteLog(`unknown:${location}`)) {
      await createSecurityLog({
        type: 'Intrusion Alert',
        desc: `Unregistered person detected at ${location} (confidence ${Number(confidence).toFixed(2)}).`,
        severity: 'critical',
        icon: 'ðŸš¨',
        personnelName: null,
        confidence,
        cameraLocation: location
      });
    }
    return res.status(200).json({
      user: { id: null, name: 'Unknown Person', role: null, status: 'DENIED', confidence },
      box,
      liveness_ratio,
      timings
    });
  }

  // Authoritative record: PostgreSQL, looked up by the unique matched user ID.
  const user = await User.findByPk(matchedUserId, {
    attributes: ['id', 'name', 'role', 'isActive', 'isEnrolled']
  });

  // Matched an ID the DB no longer knows (e.g. off-boarded but AI cache stale).
  if (!user || !user.isEnrolled) {
    if (shouldWriteLog(`stale:${matchedUserId}:${location}`)) {
      await createSecurityLog({
        type: 'Intrusion Alert',
        desc: `Recognition matched a non-enrolled or removed account (ref #${matchedUserId}) at ${location}. AI cache may need a refresh.`,
        severity: 'critical',
        icon: 'ðŸš¨',
        personnelName: null,
        matchedUserId,
        confidence,
        cameraLocation: location
      });
    }
    return res.status(200).json({
      user: { id: null, name: 'Unknown Person', role: null, status: 'DENIED', confidence },
      box,
      liveness_ratio,
      timings
    });
  }

  // Suspended account â†’ deny access and audit it.
  if (!user.isActive) {
    if (shouldWriteLog(`suspended:${user.id}:${location}`)) {
      await createSecurityLog({
        type: 'Suspended Access Attempt',
        desc: `Suspended account attempted gate access at ${location}: ${user.name} (${user.role}, confidence ${Number(confidence).toFixed(2)}).`,
        severity: 'critical',
        icon: 'â›”',
        personnelName: user.name,
        matchedUserId: user.id,
        role: user.role,
        confidence,
        cameraLocation: location
      });
    }
    return res.status(200).json({
      user: { id: user.id, name: user.name, role: user.role, status: 'SUSPENDED', confidence },
      box,
      liveness_ratio,
      timings
    });
  }

  // Active, enrolled, recognised â†’ safe fields only.
  return res.status(200).json({
    user: { id: user.id, name: user.name, role: user.role, status: 'AUTHORIZED', confidence },
    box,
    liveness_ratio,
    timings
  });
});

module.exports = router;
