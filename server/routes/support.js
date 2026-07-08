const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ChatTranscript, SupportTicket, KnowledgeBase } = require('../models');
const { verifyToken, requireRole } = require('../middlewares/auth');

// ─── AI CHAT HELPERS ────────────────────────────────────────────────────────

// Words/phrases that signal the user is stuck and needs human intervention.
const ESCALATION_TRIGGERS = [
  'still not working', 'still failing', 'keeps failing', 'keep failing',
  'not fixed', 'not resolved', 'wont work', "won't work", "doesn't work",
  "doesn't resolve", 'broken', 'cannot access', 'unable to access',
  'still broken', 'please fix', 'urgent', 'emergency', 'escalate',
  'human', 'real person', 'speak to someone', 'talk to someone',
  'face scan fail', 'scan keep', 'scan keeps', 'camera broken',
  'gate not opening', 'door not opening', 'lock not working',
  'been happening', 'days now', 'weeks now', 'hours now'
];

function shouldEscalate(message, userMessageCount) {
  const lower = message.toLowerCase();
  const hasTrigger = ESCALATION_TRIGGERS.some(t => lower.includes(t));
  // Also auto-escalate after the user has sent 5 messages without resolution
  return hasTrigger || userMessageCount >= 5;
}

// Score a KB entry against the user query using keyword overlap.
// Returns a score >= 0; caller picks the highest scorer above threshold 2.
function scoredMatch(query, entry) {
  const queryTokens = query
    .toLowerCase()
    .split(/[\s,?.!;:()\-]+/)
    .filter(w => w.length > 2);

  const entryTokens = [
    ...entry.keywords.map(k => k.toLowerCase()),
    ...entry.question.toLowerCase().split(/[\s,?.!;:()\-]+/)
  ].filter(w => w.length > 2);

  let score = 0;
  for (const qt of queryTokens) {
    if (entryTokens.some(et => et.includes(qt) || qt.includes(et))) score++;
  }
  return score;
}

function findBestKBMatch(query, kbEntries) {
  let best = null;
  let bestScore = 0;
  for (const entry of kbEntries) {
    const s = scoredMatch(query, entry);
    if (s > bestScore) { bestScore = s; best = entry; }
  }
  return bestScore >= 2 ? best : null;
}

function buildTicketTitle(message) {
  return message.length > 100 ? message.substring(0, 97) + '...' : message;
}

// ─── C: POST /api/support/chat ───────────────────────────────────────────────
// Public — tenants (and unauthenticated users) interact with the AI bot.
// Logs every exchange into ChatTranscripts. Auto-creates a Support_Ticket
// when AI cannot resolve the issue.
router.post('/chat', async (req, res) => {
  const { sessionId, message, userId, tenantName, unitNumber } = req.body;

  if (!sessionId || !message?.trim()) {
    return res.status(400).json({ error: 'sessionId and message are required.' });
  }

  try {
    // Retrieve or open a transcript for this chat session
    const [transcript] = await ChatTranscript.findOrCreate({
      where: { sessionId },
      defaults: {
        sessionId,
        userId: userId || null,
        tenantName: tenantName || null,
        unitNumber: unitNumber || null,
        messages: [],
        isEscalated: false
      }
    });

    const wasAlreadyEscalated = transcript.isEscalated;
    const userMessageCount = transcript.messages.filter(m => m.role === 'user').length;

    // Append the incoming user message
    const updatedMessages = [
      ...transcript.messages,
      { role: 'user', text: message.trim(), timestamp: new Date().toISOString() }
    ];

    let aiText;
    let nowEscalated = wasAlreadyEscalated;
    let newTicket = null;

    if (wasAlreadyEscalated) {
      aiText = 'Your issue is already being tracked by our FM team. They will contact you soon. Is there any additional information I can pass on to them?';
    } else if (shouldEscalate(message, userMessageCount + 1)) {
      // ── AUTO-ESCALATION ──────────────────────────────────────────────────
      newTicket = await SupportTicket.create({
        transcriptId: transcript.id,
        userId: userId || transcript.userId || null,
        tenantName: tenantName || transcript.tenantName || null,
        unitNumber: unitNumber || transcript.unitNumber || null,
        issueTitle: buildTicketTitle(message.trim()),
        issueDescription: `Escalated from AI chat session ${sessionId}.\n\nTenant's last message: "${message.trim()}"`,
        priority: 'High',
        status: 'Pending'
      });

      nowEscalated = true;
      const shortId = String(newTicket.id).slice(0, 8).toUpperCase();
      aiText = `I understand this is a persistent issue. I have escalated your case to our Facilities Management team and created Ticket #${shortId} on your behalf. Our FM staff will follow up shortly. For urgent assistance please contact the FM office directly at the reception desk.`;
    } else {
      // ── KNOWLEDGE BASE SEARCH ────────────────────────────────────────────
      const kbEntries = await KnowledgeBase.findAll();
      const match = findBestKBMatch(message.trim(), kbEntries);

      if (match) {
        aiText = match.answer;
      } else {
        aiText = `I have noted your issue regarding "${message.trim().substring(0, 60)}${message.length > 60 ? '...' : ''}". Could you provide more details — for example, your unit number or what error message you are seeing? If the problem keeps occurring I can escalate this to our FM team right away.`;
      }
    }

    // Append AI reply and persist
    updatedMessages.push({
      role: 'ai',
      text: aiText,
      timestamp: new Date().toISOString()
    });

    await transcript.update({
      messages: updatedMessages,
      isEscalated: nowEscalated,
      escalationReason: nowEscalated && !wasAlreadyEscalated ? message.trim() : transcript.escalationReason,
      userId: userId || transcript.userId,
      tenantName: tenantName || transcript.tenantName,
      unitNumber: unitNumber || transcript.unitNumber
    });

    res.json({
      response: aiText,
      escalated: !wasAlreadyEscalated && nowEscalated,
      ticketId: newTicket ? String(newTicket.id).slice(0, 8).toUpperCase() : null
    });
  } catch (err) {
    console.error('Support chat error:', err);
    res.status(500).json({ error: 'Chat service is temporarily unavailable.' });
  }
});

// ─── R: GET /api/support/tickets ─────────────────────────────────────────────
// FM only — display the escalated ticket queue.
// ?status=Pending | In Progress | Resolved   (omit for all)
router.get('/tickets', verifyToken, requireRole('FM'), async (req, res) => {
  try {
    const where = {};
    const VALID_STATUSES = ['Pending', 'In Progress', 'Resolved'];
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      where.status = req.query.status;
    }

    const tickets = await SupportTicket.findAll({
      where,
      order: [
        ['priority', 'DESC'],  // High first
        ['createdAt', 'DESC']
      ],
      include: [{
        model: ChatTranscript,
        as: 'transcript',
        attributes: ['id', 'sessionId', 'tenantName', 'unitNumber', 'messages', 'isEscalated', 'createdAt']
      }]
    });

    res.json(tickets);
  } catch (err) {
    console.error('Fetch tickets error:', err);
    res.status(500).json({ error: 'Could not retrieve support tickets.' });
  }
});

// ─── R: GET /api/support/tickets/:id ─────────────────────────────────────────
// FM only — single ticket with full linked chat transcript.
router.get('/tickets/:id', verifyToken, requireRole('FM'), async (req, res) => {
  try {
    const ticket = await SupportTicket.findByPk(req.params.id, {
      include: [{
        model: ChatTranscript,
        as: 'transcript'
      }]
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    res.json(ticket);
  } catch (err) {
    console.error('Fetch ticket error:', err);
    res.status(500).json({ error: 'Could not retrieve ticket.' });
  }
});

// ─── U: PATCH /api/support/tickets/:id/status ────────────────────────────────
// FM only — update ticket status after physical intervention.
// Body: { status, resolutionNotes? }
router.patch('/tickets/:id/status', verifyToken, requireRole('FM'), async (req, res) => {
  const VALID_STATUSES = ['Pending', 'In Progress', 'Resolved'];
  const { status, resolutionNotes } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
  }

  try {
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    const update = { status };
    if (resolutionNotes !== undefined) update.resolutionNotes = resolutionNotes;
    if (status === 'Resolved') {
      update.resolvedBy = req.user.email || req.user.name || `FM #${req.user.id}`;
      update.resolvedAt = new Date();
    }

    await ticket.update(update);
    res.json({ message: `Ticket marked "${status}".`, ticket });
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(500).json({ error: 'Could not update ticket status.' });
  }
});

// ─── D: DELETE /api/support/tickets/:id ──────────────────────────────────────
// FM only — hard-delete a closed or spam ticket (and its linked transcript).
router.delete('/tickets/:id', verifyToken, requireRole('FM'), async (req, res) => {
  try {
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    const transcriptId = ticket.transcriptId;
    await ticket.destroy();

    // Also remove the linked chat transcript if one exists
    if (transcriptId) {
      await ChatTranscript.destroy({ where: { id: transcriptId } });
    }

    res.json({ message: 'Ticket and linked transcript deleted.' });
  } catch (err) {
    console.error('Delete ticket error:', err);
    res.status(500).json({ error: 'Could not delete ticket.' });
  }
});

// ─── R: GET /api/support/knowledge ───────────────────────────────────────────
// Public — the chatbot and FM dashboard both read from here.
router.get('/knowledge', async (req, res) => {
  try {
    const entries = await KnowledgeBase.findAll({ order: [['category', 'ASC'], ['createdAt', 'DESC']] });
    res.json(entries);
  } catch (err) {
    console.error('Fetch KB error:', err);
    res.status(500).json({ error: 'Could not retrieve knowledge base.' });
  }
});

// ─── C: POST /api/support/knowledge ──────────────────────────────────────────
// FM only — add a new FAQ to the chatbot knowledge base.
router.post('/knowledge', verifyToken, requireRole('FM'), async (req, res) => {
  const { category, question, answer, keywords } = req.body;

  if (!question?.trim() || !answer?.trim()) {
    return res.status(400).json({ error: 'question and answer are required.' });
  }

  try {
    const entry = await KnowledgeBase.create({
      category: category?.trim() || 'General',
      question: question.trim(),
      answer: answer.trim(),
      keywords: Array.isArray(keywords) ? keywords.map(k => k.toLowerCase().trim()).filter(Boolean) : [],
      createdBy: req.user.email || req.user.name || `FM #${req.user.id}`
    });
    res.status(201).json({ message: 'Knowledge base entry added.', entry });
  } catch (err) {
    console.error('Create KB error:', err);
    res.status(500).json({ error: 'Could not add knowledge base entry.' });
  }
});

// ─── U: PUT /api/support/knowledge/:id ───────────────────────────────────────
// FM only — update an existing FAQ (e.g., add loading bay rules).
router.put('/knowledge/:id', verifyToken, requireRole('FM'), async (req, res) => {
  const { category, question, answer, keywords } = req.body;

  try {
    const entry = await KnowledgeBase.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Knowledge base entry not found.' });

    await entry.update({
      category: category?.trim() ?? entry.category,
      question: question?.trim() ?? entry.question,
      answer: answer?.trim() ?? entry.answer,
      keywords: Array.isArray(keywords) ? keywords.map(k => k.toLowerCase().trim()).filter(Boolean) : entry.keywords,
      updatedBy: req.user.email || req.user.name || `FM #${req.user.id}`
    });

    res.json({ message: 'Knowledge base entry updated.', entry });
  } catch (err) {
    console.error('Update KB error:', err);
    res.status(500).json({ error: 'Could not update knowledge base entry.' });
  }
});

// ─── D: DELETE /api/support/knowledge/:id ────────────────────────────────────
// FM only — remove an outdated or incorrect FAQ.
router.delete('/knowledge/:id', verifyToken, requireRole('FM'), async (req, res) => {
  try {
    const entry = await KnowledgeBase.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Knowledge base entry not found.' });
    await entry.destroy();
    res.json({ message: 'Knowledge base entry deleted.' });
  } catch (err) {
    console.error('Delete KB error:', err);
    res.status(500).json({ error: 'Could not delete knowledge base entry.' });
  }
});

module.exports = router;
