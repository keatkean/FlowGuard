module.exports = (sequelize, DataTypes) => {
    const DetectionAlert = sequelize.define("DetectionAlert", {
        zone_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        camera_location: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        status: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'Active'
        },
        object_class: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        duration_seconds: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        person_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        alert_type: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        severity: {
            type: DataTypes.ENUM('Low', 'Medium', 'High', 'Critical'),
            allowNull: false,
            defaultValue: 'High'
        },
        source: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: 'Object Detection'
        },
        confidence: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        snapshot_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        device_id: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        occurred_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Best-effort links resolved from zone_name/camera_location at alert-creation time.
        // Nullable — the AI engine's existing string-only payload keeps working unchanged.
        camera_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        zone_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // Links the alert to the IncidentLog row created alongside it, so status/severity
        // updates and false-alarm deletion can keep both records consistent. Nullable —
        // alerts created before this field existed have no linked incident.
        incident_log_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        tableName: 'detection_alerts',
        paranoid: true
    });

    DetectionAlert.associate = (models) => {
        DetectionAlert.belongsTo(models.Camera, { foreignKey: 'camera_id', as: 'camera' });
        DetectionAlert.belongsTo(models.MonitoringZone, { foreignKey: 'zone_id', as: 'zone' });
        DetectionAlert.belongsTo(models.IncidentLog, { foreignKey: 'incident_log_id', as: 'incident' });
    };

    return DetectionAlert;
};
