module.exports = (sequelize, DataTypes) => {
    const IncidentLog = sequelize.define("IncidentLog", {
        camera_location: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        status: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        person_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        confidence_score: {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: true
        },
        severity: {
            type: DataTypes.STRING(20),
            allowNull: true,
            defaultValue: 'Medium'
        },
        source: {
            type: DataTypes.STRING(50),
            allowNull: true,
            defaultValue: 'Facial Recognition'
        },
        resolutionStatus: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'Active'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: ''
        }
    }, {
        tableName: 'incident_logs',
        paranoid: true
    });
    return IncidentLog;
}