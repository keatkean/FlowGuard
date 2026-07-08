// Frontend tests — Driver Pass renders booking + QR, and degrades cleanly.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, test, expect, afterEach } from "vitest";

import DriverPass from "../../src/pages/DriverPass";

const renderPass = (ref = "FG-052B13") =>
  render(
    <MemoryRouter initialEntries={[`/driver-pass/${ref}`]}>
      <Routes>
        <Route path="/driver-pass/:ref" element={<DriverPass />} />
      </Routes>
    </MemoryRouter>
  );

const mockFetchOnce = (impl) => { global.fetch = vi.fn(impl); };

afterEach(() => { vi.restoreAllMocks(); delete global.fetch; });

describe("DriverPass", () => {
  test("renders a valid booking with details and a QR code", async () => {
    mockFetchOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        booking_ref: "FG-052B13", transport_company: "NinjaVan", license_plate: "GBG 1234M",
        driver_name: "Ahmad", loading_bay: "Bay A", slot_start: "2026-06-21T09:00",
        slot_end: "2026-06-21T10:00", status: "Confirmed",
      }),
    }));

    const { container } = renderPass();
    expect(await screen.findByText("FG-052B13")).toBeTruthy();
    expect(screen.getByText("NinjaVan")).toBeTruthy();
    expect(screen.getByText("GBG 1234M")).toBeTruthy();
    expect(screen.getByText("Ahmad")).toBeTruthy();
    expect(screen.getByText("Bay A")).toBeTruthy();
    // QR code renders an <svg>
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("renders when the API wraps the booking in a { booking } envelope", async () => {
    mockFetchOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        booking: {
          booking_ref: "FG-WRAP01", transport_company: "DHL Express", license_plate: "GBX4821K",
          driver_name: "Tester Tan", loading_bay: "Bay B", status: "Pending",
        },
      }),
    }));

    const { container } = renderPass("FG-WRAP01");
    expect(await screen.findByText("FG-WRAP01")).toBeTruthy();
    expect(screen.getByText("DHL Express")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("shows a clear warning for a Cancelled booking (no crash)", async () => {
    mockFetchOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        booking_ref: "FG-CANX", transport_company: "DHL", license_plate: "X1",
        loading_bay: "Bay A", status: "Cancelled",
      }),
    }));
    renderPass("FG-CANX");
    expect(await screen.findByText(/has been CANCELLED/i)).toBeTruthy();
    expect(screen.getByText("FG-CANX")).toBeTruthy();
  });

  test("shows a clean 'Pass not found' message on 404 (no crash)", async () => {
    mockFetchOnce(() => Promise.resolve({
      ok: false, status: 404, json: () => Promise.resolve({ message: "Booking not found" }),
    }));
    renderPass("FG-NONE");
    expect(await screen.findByText(/Pass not found or expired/i)).toBeTruthy();
  });

  test("does not call the API when ref is missing", async () => {
    global.fetch = vi.fn();
    render(
      <MemoryRouter initialEntries={["/driver-pass"]}>
        <Routes>
          <Route path="/driver-pass" element={<DriverPass />} />
          <Route path="/driver-pass/:ref" element={<DriverPass />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/Pass not found or expired/i)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("handles a network error without crashing", async () => {
    mockFetchOnce(() => Promise.reject(new Error("network down")));
    renderPass("FG-052B13");
    expect(await screen.findByText(/Pass not found or expired/i)).toBeTruthy();
  });

  test("renders without crashing when optional fields are missing", async () => {
    mockFetchOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ booking_ref: "FG-MIN", loading_bay: "Bay B" }), // no slots/driver/company/status
    }));
    const { container } = renderPass("FG-MIN");
    expect(await screen.findByText("FG-MIN")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy(); // QR still renders from booking_ref
  });
});
