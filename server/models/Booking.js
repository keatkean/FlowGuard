module.exports = (sequelize, DataTypes) => {
    const Booking = sequelize.define("Booking", {
        // booking_ref doubles as the booking code AND the QR token shown on the driver pass.
        booking_ref: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        // --- Ownership (for tenant isolation) ---
        tenant_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        tenantId: {
            type: DataTypes.INTEGER,
            allowNull: true // users.id of the tenant who created it (set on tenant-created bookings)
        },
        // --- Delivery details ---
        driver_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        transport_company: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        license_plate: {
            type: DataTypes.STRING(20),
            allowNull: false
        },
        driver_phone: {
            type: DataTypes.STRING(20),
            allowNull: false
        },
        loading_bay: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        // --- Scheduling ---
        slot_start: {
            type: DataTypes.DATE,
            allowNull: true
        },
        slot_end: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Pending | Confirmed | Arrived | Completed | Cancelled
        status: {
            type: DataTypes.STRING(50),
            defaultValue: 'Pending'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Gate-scan timestamps (nullable; set on entry/exit scans).
        arrived_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        completed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'bookings',
        paranoid: true // soft delete supported; cancellation uses status='Cancelled' for auditability
    });

    return Booking;
};
