const express = require('express');
const router = express.Router();
const axios = require('axios');
const { User, EvaluationParticipant } = require('../models');
const { syncEligibleEvaluationParticipants, listEvaluationParticipants } = require('../services/evaluationParticipants');
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

// GET is intentionally read-only; POST performs the explicit FM-controlled backfill.
router.get('/evaluation-participants', verifyToken, requireRole('FM'), async (_req, res) => {
  try { return res.status(200).json({ participants: await listEvaluationParticipants() }); }
  catch (error) { console.error('Evaluation participant list error:', error); return res.status(500).json({ error: 'Could not load evaluation participants.' }); }
});
router.post('/evaluation-participants/sync', verifyToken, requireRole('FM'), async (_req, res) => {
  try { const assigned = await syncEligibleEvaluationParticipants(); return res.status(200).json({ synced: assigned.length, participants: await listEvaluationParticipants() }); }
  catch (error) { console.error('Evaluation participant sync error:', error); return res.status(500).json({ error: 'Could not sync evaluation participants.' }); }
});
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

    let subject = null;
    if (matchedUserId != null) {
      const user = await User.findByPk(matchedUserId, {
        attributes: ['id', 'name', 'role', 'isActive', 'isEnrolled']
      });
      if (user) {
        const participant = await EvaluationParticipant.findOne({ where: { userId: user.id }, attributes: ['evaluationLabel'] });
        subject = {
          id: user.id,
          name: user.name,
          role: user.role,
          isActive: Boolean(user.isActive),
          isEnrolled: Boolean(user.isEnrolled),
          evaluationLabel: participant?.evaluationLabel || null
        };
      }
    }
    const policyDecision = outcome === 'NO_FACE' ? 'NONE'
      : subject?.isActive && subject?.isEnrolled ? 'GRANTED' : 'DENIED';

    // Still-image policy evaluation excludes live anti-spoofing/head-turn verification.
    return res.status(200).json({
      matchedUserId: matchedUserId == null ? null : matchedUserId,
      outcome,
      confidence,
      box,
      subject,
      predictedEvaluationLabel: outcome === 'NO_FACE' ? null : outcome === 'UNKNOWN' ? 'Unknown' : subject?.evaluationLabel || null,
      noFace: outcome === 'NO_FACE',
      latencyMs: totalRequestMs,
      policyDecision,
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
// attendance - V-Patrol must never toggle clock-in/out; that is the Gate
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
        // Stable token — the client renders the matching MUI icon.
        icon: 'UNLOCK',
        personnelName: user.name,
        matchedUserId: user.id,
        cameraLocation: location
      });
    }

    // Safe fields only - never the biometric template.
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

// POST /api/facial-recognition/track
// Lightweight, side-effect-free face tracking for the scanners' live overlay
// and head-turn movement sampling. Forwards one temporary frame to FastAPI's
// detection-only endpoint and returns SAFE transient telemetry (box, count,
// head-turn ratio) — never an identity, never a database read/write, never a
// SecurityLog or Attendance record. Tracking alone can never grant access.
const TRACK_TIMEOUT_MS = 5000; // much shorter than full recognition (15s)

router.post('/track', allowFMOrEdgeService, async (req, res) => {
  const validation = validateFrame(req.body?.image);
  if (validation) return res.status(validation.status).json({ error: validation.error });

  try {
    const aiResponse = await axios.post(`${FACE_AI_URL()}/user/track`, { image: req.body.image }, {
      timeout: TRACK_TIMEOUT_MS,
      headers: { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY || '' }
    });
    const {
      faceDetected = false,
      faceCount = 0,
      box = null,
      headTurnRatio = null,
      inferenceMs = null
    } = aiResponse.data || {};

    // Whitelisted safe fields only — nothing else from the AI reply passes through.
    return res.status(200).json({ faceDetected, faceCount, box, headTurnRatio, inferenceMs });
  } catch (err) {
    const isConnError = !err.response &&
      ['ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
    if (isConnError) {
      return res.status(503).json({ error: 'Face tracking service is offline. Please try again shortly.' });
    }
    if (err.response) {
      const status = err.response.status === 400 ? 400 : 502;
      return res.status(status).json({ error: 'Face tracking service returned an error.' });
    }
    console.error('Tracking forwarding error:', err.message);
    return res.status(502).json({ error: 'Face tracking service returned an error.' });
  }
});

// POST /api/facial-recognition/recognize
// Frontend (Gate Scanner / V-Patrol) -> Node -> FastAPI -> Node resolves the User
// record from PostgreSQL -> safe recognition result. The DB - not the AI cache -
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

  // Development timing telemetry - durations only, never images or templates.
  const nodeToAiMs = Date.now() - aiStartedAt;
  const timings = { nodeToAiMs, inferenceMs: inference_ms, totalRequestMs: nodeToAiMs };
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[recognize] Node->FastAPI ${timings.nodeToAiMs}ms, InsightFace inference ${inference_ms ?? '?'}ms`);
  }

  // No face in frame -> no recognition attempt, and no suspicious-person log.
  if (faceDetected === false || (!box && matchedUserId == null)) {
    return res.status(200).json({ user: null, box: null, liveness_ratio, timings });
  }

  // Face detected but no template match -> unknown person.
  if (matchedUserId == null) {
    if (shouldWriteLog(`unknown:${location}`)) {
      await createSecurityLog({
        type: 'Intrusion Alert',
        desc: `Unregistered person detected at ${location} (confidence ${Number(confidence).toFixed(2)}).`,
        severity: 'critical',
        icon: 'ALERT',
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
        icon: 'ALERT',
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

  // Suspended account -> deny access and audit it.
  if (!user.isActive) {
    if (shouldWriteLog(`suspended:${user.id}:${location}`)) {
      await createSecurityLog({
        type: 'Suspended Access Attempt',
        desc: `Suspended account attempted gate access at ${location}: ${user.name} (${user.role}, confidence ${Number(confidence).toFixed(2)}).`,
        severity: 'critical',
        icon: 'DENIED',
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

  // Active, enrolled, recognised -> safe fields only.
  return res.status(200).json({
    user: { id: user.id, name: user.name, role: user.role, status: 'AUTHORIZED', confidence },
    box,
    liveness_ratio,
    timings
  });
});

module.exports = router;
