// PDPA Compliance — auto-delete routine, non-escalated chat transcripts
// older than 90 days so FlowGuard does not retain personal data beyond need.
// Escalated transcripts are excluded because they are linked to open/resolved
// support tickets that FM may still need to reference.

const cron = require('node-cron');
const { Op } = require('sequelize');

module.exports = function startCleanupCron(db) {
  const { ChatTranscript } = db;

  // Run every day at 02:00 AM
  cron.schedule('0 2 * * *', async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    try {
      const deleted = await ChatTranscript.destroy({
        where: {
          isEscalated: false,
          createdAt: { [Op.lt]: cutoff }
        }
      });

      if (deleted > 0) {
        console.log(`[PDPA Cron] ${new Date().toISOString()} — Deleted ${deleted} chat transcript(s) older than 90 days.`);
      }
    } catch (err) {
      console.error('[PDPA Cron] Cleanup failed:', err.message);
    }
  });

  console.log('[PDPA Cron] 90-day transcript cleanup scheduled (daily at 02:00).');
};
