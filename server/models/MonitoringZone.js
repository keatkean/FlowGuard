module.exports = (sequelize, DataTypes) => {
    const MonitoringZone = sequelize.define("MonitoringZone", {
        zone_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        location: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        // Legacy unattended-object threshold, in MINUTES. Read directly (raw SQL) by
        // ai-service/main.py::_refresh_zone_info, which falls back to time_threshold * 60
        // seconds whenever unattended_threshold_seconds (below) is not set. Kept as-is so
        // existing rows/behaviour are never silently reinterpreted.
        time_threshold: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Detection Setup fields (additive) ---------------------------------------------
        monitored_classes: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: '[]'
        },
        density_threshold: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // Unattended-object threshold in SECONDS, set from the Detection Setup page.
        // Takes precedence over the legacy time_threshold (minutes) when present — see
        // ai-service/main.py::_refresh_zone_info.
        unattended_threshold_seconds: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        alert_cooldown_seconds: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        severity: {
            type: DataTypes.ENUM('Low', 'Medium', 'High', 'Critical'),
            allowNull: false,
            defaultValue: 'Medium'
        },
        // Free-text soft link into the (localStorage-only) response-team directory —
        // not a foreign key, matching the SecurityLog.personnelName soft-link convention.
        assigned_team: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        detection_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // Explicit Detection Setup category, set by the FM instead of being guessed back
        // from severity/density/monitored_classes after reload. Nullable so rows created
        // before this field existed keep loading — serializeZone() below fills in the
        // 'unattended_object' fallback for those.
        detection_type: {
            type: DataTypes.STRING(30),
            allowNull: true
        }
    }, {
        tableName: 'monitoring_zones',
        paranoid: true
    });

    MonitoringZone.associate = (models) => {
        MonitoringZone.hasMany(models.Camera, { foreignKey: 'zone_id', as: 'cameras' });
    };

    return MonitoringZone;
};
