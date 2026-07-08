// Frontend test — DriverPass degrades gracefully when the QR component can't render.
// We mock react-qr-code to a NON-component so the validity guard trips and shows the
// fallback instead of crashing the page (no 500 ErrorBoundary).
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, test, expect, afterEach } from "vitest";

vi.mock("react-qr-code", () => ({ default: { notAComponent: true } }));

import DriverPass from "../../src/pages/DriverPass";

afterEach(() => { vi.restoreAllMocks(); delete global.fetch; });

describe("DriverPass — QR fallback", () => {
  test("shows booking details + fallback text when QR cannot render", async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        booking_ref: "FG-FB01", transport_company: "DHL Express",
        license_plate: "GBX4821K", loading_bay: "Bay A", status: "Pending",
      }),
    }));

    render(
      <MemoryRouter initialEntries={["/driver-pass/FG-FB01"]}>
        <Routes>
          <Route path="/driver-pass/:ref" element={<DriverPass />} />
        </Routes>
      </MemoryRouter>
    );

    // Booking details still render (no crash)…
    expect(await screen.findByText("FG-FB01")).toBeTruthy();
    expect(screen.getByText("DHL Express")).toBeTruthy();
    // …and the safe QR fallback is shown instead of crashing.
    expect(screen.getByText(/QR unavailable — use booking reference at gate/i)).toBeTruthy();
  });
});
