const { Op } = require('sequelize');
const { sequelize, User, EvaluationParticipant } = require('../models');

const LABEL_RE = /^P(\d+)$/;
const formatEvaluationLabel = (sequenceNumber) => {
  const value = Number(sequenceNumber);
  if (!Number.isInteger(value) || value < 1) throw new Error('Evaluation label sequence must be a positive integer.');
  return `P${String(value).padStart(2, '0')}`;
};
const evaluationLabelSequence = (label) => { const match = LABEL_RE.exec(String(label || '')); return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER; };
const isEligibleEvaluationUser = (user) => Boolean(user?.isEnrolled && Array.isArray(user?.faceVector) && user.faceVector.length > 0);

async function assignStableEvaluationLabel(user, retries = 3) {
  if (!isEligibleEvaluationUser(user)) return null;
  const existing = await EvaluationParticipant.findOne({ where: { userId: user.id } });
  if (existing) return existing;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const again = await EvaluationParticipant.findOne({ where: { userId: user.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (again) return again;
        const rows = await EvaluationParticipant.findAll({ attributes: ['evaluationLabel'], transaction, lock: transaction.LOCK.UPDATE });
        const max = rows.reduce((value, row) => Math.max(value, evaluationLabelSequence(row.evaluationLabel) === Number.MAX_SAFE_INTEGER ? 0 : evaluationLabelSequence(row.evaluationLabel)), 0);
        return EvaluationParticipant.create({ userId: user.id, evaluationLabel: formatEvaluationLabel(max + 1), active: true, assignedAt: new Date() }, { transaction });
      });
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError' || attempt === retries - 1) throw error;
    }
  }
  return null;
}

// PDPA off-boarding: mark the mapping inactive but KEEP the row so its label
// stays reserved forever (historical evaluation records keep meaning P0x).
// The userId is nulled by the ON DELETE SET NULL relationship when the User
// row itself is destroyed later in the same transaction.
async function retireEvaluationParticipant(userId, transaction) {
  if (userId == null) return null;
  const participant = await EvaluationParticipant.findOne({ where: { userId }, transaction });
  if (!participant) return null;
  await participant.update({ active: false, retiredAt: new Date() }, { transaction });
  return participant;
}

async function syncEligibleEvaluationParticipants() {
  const users = await User.findAll({ attributes: ['id', 'name', 'role', 'isActive', 'isEnrolled', 'faceVector'], where: { isEnrolled: true, faceVector: { [Op.ne]: null } } });
  const assigned = [];
  for (const user of users) { const participant = await assignStableEvaluationLabel(user); if (participant) assigned.push(participant); }
  return assigned;
}

async function listEvaluationParticipants() {
  const rows = await EvaluationParticipant.findAll({ where: { active: true, userId: { [Op.ne]: null } }, include: [{ model: User, as: 'User', attributes: ['id', 'name', 'role', 'isActive', 'isEnrolled'], required: true }] });
  return rows.filter((row) => row.User?.isEnrolled).map((row) => ({ userId: row.User.id, evaluationLabel: row.evaluationLabel, name: row.User.name, role: row.User.role, isActive: Boolean(row.User.isActive), isEnrolled: Boolean(row.User.isEnrolled) })).sort((a, b) => evaluationLabelSequence(a.evaluationLabel) - evaluationLabelSequence(b.evaluationLabel));
}

module.exports = { formatEvaluationLabel, evaluationLabelSequence, isEligibleEvaluationUser, assignStableEvaluationLabel, retireEvaluationParticipant, syncEligibleEvaluationParticipants, listEvaluationParticipants };