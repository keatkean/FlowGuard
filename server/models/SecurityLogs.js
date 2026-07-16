module.exports = (sequelize, DataTypes) => {
  const SecurityLog = sequelize.define('SecurityLog', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    time: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    desc: { type: DataTypes.TEXT, allowNull: false },
    severity: { type: DataTypes.STRING, allowNull: false, defaultValue: 'safe' },
    icon: { type: DataTypes.STRING, allowNull: false },
    
    // 🎯 Dedicated column to link to the Personnel Page
    personnelName: {
      type: DataTypes.STRING,
      allowNull: true, // True because intruders won't have a registered name
      description: 'The exact name of the verified staff member'
    },

    // --- AUTOMATIC RECOGNITION AUDIT FIELDS (additive, all nullable) ---
    // Populated by the Node facial-recognition route. Audit metadata only —
    // never a snapshot and never biometric template data.
    matchedUserId: {
      type: DataTypes.INTEGER,
      allowNull: true // The unique User ID the recognition matched, when known
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true // Recognition confidence at the time of the event
    },
    cameraLocation: {
      type: DataTypes.STRING,
      allowNull: true // Which gate/camera produced the event
    },

    // --- MANUAL FM REVIEW WORKFLOW ---
    // FM staff triage suspicious/critical events through these fields.
    reviewStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Pending Review' // Pending Review | False Positive | Escalated | Resolved
    },
    reviewNotes: {
      type: DataTypes.TEXT,
      allowNull: true // FM's manual resolution notes
    },
    reviewedBy: {
      type: DataTypes.STRING,
      allowNull: true // Name/email of the FM who actioned the log
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'security_logs',
    timestamps: true, 
  });

  return SecurityLog;
};