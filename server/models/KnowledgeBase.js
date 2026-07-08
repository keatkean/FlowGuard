module.exports = (sequelize, DataTypes) => {
  const KnowledgeBase = sequelize.define('KnowledgeBase', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'General'
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    // Keywords used to match incoming chat messages
    keywords: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    createdBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    updatedBy: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'knowledge_base',
    timestamps: true
  });

  return KnowledgeBase;
};
