module.exports = (sequelize, DataTypes) => {
  const SupportTicket = sequelize.define('SupportTicket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    transcriptId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tenantName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    unitNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    issueTitle: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    issueDescription: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    priority: {
      type: DataTypes.ENUM('Low', 'Medium', 'High'),
      allowNull: false,
      defaultValue: 'High'
    },
    status: {
      type: DataTypes.ENUM('Pending', 'In Progress', 'Resolved'),
      allowNull: false,
      defaultValue: 'Pending'
    },
    resolvedBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'support_tickets',
    timestamps: true
  });

  SupportTicket.associate = (db) => {
    SupportTicket.belongsTo(db.ChatTranscript, {
      foreignKey: 'transcriptId',
      as: 'transcript'
    });
  };

  return SupportTicket;
};
