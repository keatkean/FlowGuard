module.exports = (sequelize, DataTypes) => {
  const EvaluationParticipant = sequelize.define('EvaluationParticipant', {
    userId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    evaluationLabel: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    assignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    retiredAt: { type: DataTypes.DATE, allowNull: true }
  }, { tableName: 'evaluation_participants' });
  EvaluationParticipant.associate = (models) => {
    EvaluationParticipant.belongsTo(models.User, { foreignKey: 'userId', as: 'User', onDelete: 'SET NULL' });
  };
  return EvaluationParticipant;
};