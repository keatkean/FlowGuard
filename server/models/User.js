module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define("User", {
        name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        email: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        password: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        role: {
            type: DataTypes.ENUM('FM', 'Tenant', 'Staff'), 
            defaultValue: 'Tenant'
        },
        // --- HYBRID REGISTRATION CODE LOGIC ---
        companyCode: {
            type: DataTypes.STRING(50), 
            allowNull: true,
            unique: true // One active code per Tenant
        },
        codeCreatedAt: {
            type: DataTypes.DATE,
            allowNull: true // Tracks the 48-hour expiration clock
        },
        codeMaxUsage: {
            type: DataTypes.INTEGER,
            defaultValue: 10,
            allowNull: false // Max "punches" on the card
        },
        codeCurrentUsage: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false // Current count of registrations
        },
        // ---------------------------------------
        managerId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // --- BIOMETRIC SECURITY LOGIC ---
        isEnrolled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false, // Forces new users to the enrollment screen
            allowNull: false
        },
        faceVector: {
            type: DataTypes.ARRAY(DataTypes.FLOAT),
            allowNull: true
        },
        // ---------------------------------------
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false
        },
        // --- SESSION REVOCATION ---
        // Stamped into every JWT at login and compared on every authenticated
        // request. Incremented on password change/reset and on suspension so
        // all previously issued tokens (e.g. on a lost device) die instantly.
        tokenVersion: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false
        },
        // --- FORGOT/RESET PASSWORD ---
        // Only the SHA-256 hash of the emailed reset token is stored — never
        // the raw token. Cleared as soon as the reset completes.
        passwordResetTokenHash: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        passwordResetExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'users',
        paranoid: false // Hard deletes as requested earlier
    });

    User.associate = (models) => {
        User.belongsTo(models.User, {
            as: 'Manager',
            foreignKey: 'managerId'
        });
        
        User.hasMany(models.User, {
            as: 'StaffMembers',
            foreignKey: 'managerId'
        });

        User.hasMany(models.Attendance, {
            foreignKey: 'userId',
            as: 'Attendances'
        });
    };

    return User;
};