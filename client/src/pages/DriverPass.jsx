import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as QRLib from "react-qr-code";
import "../css/DriverPass.css";

// Resolve the QR component across CJS/ESM interop shapes. Under Vite/React 19 the
// CommonJS module can be wrapped so `QRLib.default` is the module object (an object,
// not the component) — that "object" is exactly what crashes the render.
const QRCodeComponent =
    QRLib.default?.default ||
    QRLib.default ||
    QRLib.QRCode ||
    QRLib.QRCodeSVG;

// A valid React element type is a function OR an object with $$typeof (forwardRef/memo).
const canRenderQr =
    typeof QRCodeComponent === "function" ||
    (typeof QRCodeComponent === "object" && QRCodeComponent !== null && Boolean(QRCodeComponent.$$typeof));

if (import.meta.env?.DEV) {
    // One-time dev diagnostic (safe to remove later).
    console.log("[DriverPass] QR export type:", typeof QRCodeComponent, "canRender:", canRenderQr);
}

const fmt = (v) => {
    if (!v) return "—";
    try { return new Date(v).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return String(v); }
};

const DriverPass = () => {
    const { ref } = useParams(); // booking_ref from /driver-pass/:ref
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Tag the body so global floating widgets (reCAPTCHA badge) can be hidden on the pass.
    useEffect(() => {
        document.body.classList.add("driver-pass-page");
        return () => document.body.classList.remove("driver-pass-page");
    }, []);

    useEffect(() => {
        // Guard: don't call /api/bookings/ with an empty ref.
        if (!ref) { setNotFound(true); setLoading(false); return; }
        const fetchBooking = async () => {
            try {
                const res = await fetch(`/api/bookings/${encodeURIComponent(ref)}`);
                const payload = await res.json().catch(() => null);
                // Support both shapes: a direct booking object OR a { booking } envelope.
                const loadedBooking = payload && (payload.booking || payload);
                if (!res.ok || !loadedBooking || !(loadedBooking.booking_ref || loadedBooking.reference)) {
                    setNotFound(true);
                } else {
                    setBooking(loadedBooking);
                }
            } catch (err) {
                console.error("Error fetching pass:", err);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        fetchBooking();
    }, [ref]);

    if (loading) return <div className="driver-container"><div className="loader">Loading your pass…</div></div>;
    if (notFound || !booking) return <div className="driver-container"><div className="pass-card"><div className="error">Pass not found or expired.</div></div></div>;

    // Support booking_ref / reference / route-param; QR must always get a non-empty string.
    const bookingRef = booking.booking_ref || booking.reference || ref || "";
    const qrValue = String(bookingRef || "");
    const status = booking.status || "Pending";
    const inactive = status === "Cancelled" || status === "Completed";
    const statusColor = status === "Cancelled" ? "#f43f5e"
        : status === "Completed" ? "#64748b"
        : status === "Arrived" ? "#f59e0b"
        : status === "Confirmed" ? "#10b981"
        : "#3b82f6";

    return (
        <div className="driver-container">
            <div className="pass-card">
                <header className="pass-header">
                    <h1 className="pass-brand">FlowGuard</h1>
                    <p className="pass-org">Harrison Food Factory</p>
                    <span className="badge">Driver Entry Pass</span>
                </header>

                {inactive && (
                    <div style={{
                        background: "rgba(244,63,94,0.12)", border: `1px solid ${statusColor}`,
                        color: statusColor, borderRadius: 10, padding: "10px 12px", margin: "12px 0",
                        textAlign: "center", fontWeight: 600
                    }}>
                        {status === "Cancelled"
                            ? "⚠ This booking has been CANCELLED. Entry is not authorised."
                            : "This booking is COMPLETED. The loading session has ended."}
                    </div>
                )}

                <div className="qr-section">
                    {canRenderQr && qrValue
                        ? <QRCodeComponent value={qrValue} size={180} />
                        : <div className="qr-fallback" style={{ color: "#94a3b8", fontSize: "0.9rem", textAlign: "center", padding: "8px 0" }}>
                            QR unavailable — use booking reference at gate
                          </div>}
                    <p className="ref-text">{bookingRef || "—"}</p>
                    <span style={{
                        display: "inline-block", marginTop: 8, padding: "4px 12px", borderRadius: 999,
                        background: `${statusColor}22`, color: statusColor, fontWeight: 700, fontSize: "0.8rem"
                    }}>
                        {status}
                    </span>
                </div>

                <div className="info-grid">
                    <div className="info-item">
                        <label>Driver</label>
                        <p>{booking.driver_name || "—"}</p>
                    </div>
                    <div className="info-item">
                        <label>License Plate</label>
                        <p>{booking.license_plate}</p>
                    </div>
                    <div className="info-item">
                        <label>Loading Bay</label>
                        <p className="bay-highlight">{booking.loading_bay}</p>
                    </div>
                    <div className="info-item">
                        <label>Transport Co.</label>
                        <p>{booking.transport_company}</p>
                    </div>
                    <div className="info-item">
                        <label>Slot Start</label>
                        <p>{fmt(booking.slot_start)}</p>
                    </div>
                    <div className="info-item">
                        <label>Slot End</label>
                        <p>{fmt(booking.slot_end)}</p>
                    </div>
                </div>

                <footer>
                    <p>Show this QR code at the loading bay gate. Please do not arrive before your slot.</p>
                </footer>
            </div>
        </div>
    );
};

export default DriverPass;
