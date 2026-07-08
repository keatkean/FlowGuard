module.exports = (sequelize, DataTypes) => {
  const ChatTranscript = sequelize.define('ChatTranscript', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true
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
    // Array of { role: 'user'|'ai', text: string, timestamp: ISO string }
    messages: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    isEscalated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    escalationReason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'chat_transcripts',
    timestamps: true
  });

  ChatTranscript.associate = (db) => {
    ChatTranscript.hasOne(db.SupportTicket, {
      foreignKey: 'transcriptId',
      as: 'ticket'
    });
  };

  return ChatTranscript;
};
