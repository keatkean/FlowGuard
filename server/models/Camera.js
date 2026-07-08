module.exports = (sequelize, DataTypes) => {
    const Camera = sequelize.define("Camera", {
        camera_code: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        camera_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        location: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        zone_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        stream_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('Online', 'Offline', 'Maintenance', 'Disabled'),
            allowNull: false,
            defaultValue: 'Online'
        },
        camera_type: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        last_active_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'cameras',
        paranoid: true
    });

    Camera.associate = (models) => {
        Camera.belongsTo(models.MonitoringZone, { foreignKey: 'zone_id', as: 'zone' });
    };

    return Camera;
};
