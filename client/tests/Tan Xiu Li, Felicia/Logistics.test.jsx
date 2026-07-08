// Frontend tests — Smart Logistics page renders, with loading → empty state.
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, test, expect, beforeEach } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn(() => Promise.resolve({ data: [] })) }));
vi.mock("axios", () => ({
  default: { get: mockGet, post: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn(() => Promise.resolve({ data: {} })) },
}));

import TenantLogistics from "../../src/pages/TenantLogistics";
import axios from "axios";

const renderPage = () => render(<MemoryRouter><TenantLogistics /></MemoryRouter>);

beforeEach(() => {
  mockGet.mockClear();
  localStorage.clear();
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", "FM");
});

describe("Logistics page", () => {
  test("renders the logistics header", () => {
    renderPage();
    expect(screen.getByText(/Loading Bay Logistics/i)).toBeTruthy();
  });

  test("shows the + New Booking button for FM, with the form hidden by default", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /New Booking/i })).toBeTruthy();
    // The form lives in a modal and should NOT be on screen until opened.
    expect(screen.queryByText(/Schedule New Delivery/i)).toBeNull();
  });

  test("opens the booking form modal when + New Booking is clicked", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /New Booking/i }));
    expect(await screen.findByText(/Schedule New Delivery/i)).toBeTruthy();
  });

  test("calls the bookings API and shows the empty state when there are none", async () => {
    renderPage();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/bookings/", expect.any(Object)));
    expect(await screen.findByText(/No bookings scheduled yet/i)).toBeTruthy();
  });

  test("Staff SEES + New Booking (can book for their unit)", () => {
    localStorage.setItem("userRole", "Staff");
    renderPage();
    expect(screen.getByRole("button", { name: /New Booking/i })).toBeTruthy();
  });

  test("Staff does NOT see facility status controls (Mark Arrived/Completed) or Gate Scan", async () => {
    localStorage.setItem("userRole", "Staff");
    mockGet.mockResolvedValueOnce({
      data: [{ id: 1, booking_ref: "FG-AAA", license_plate: "P1", transport_company: "C1", driver_name: "D1", loading_bay: "Bay A", slot_start: "2026-06-21T09:00", status: "Pending" }],
    });
    renderPage();
    await screen.findByText("FG-AAA");
    expect(screen.queryByRole("button", { name: /Mark Confirmed/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark Arrived/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Gate Scan/i })).toBeNull();
  });

  test("Tenant sees + New Booking", () => {
    localStorage.setItem("userRole", "Tenant");
    renderPage();
    expect(screen.getByRole("button", { name: /New Booking/i })).toBeTruthy();
  });

  test("FM sees the Gate Scan control", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Gate Scan/i })).toBeTruthy();
  });

  test("Tenant does NOT see the Gate Scan control", () => {
    localStorage.setItem("userRole", "Tenant");
    renderPage();
    expect(screen.queryByRole("button", { name: /Gate Scan/i })).toBeNull();
  });

  test("Staff does NOT see the Gate Scan control (FM only)", () => {
    localStorage.setItem("userRole", "Staff");
    renderPage();
    expect(screen.queryByRole("button", { name: /Gate Scan/i })).toBeNull();
  });

  test("Gate Scan modal opens and submitting entry calls the gate-scan API", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Gate Scan/i }));
    expect(await screen.findByText(/Loading Bay Gate Scan/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Booking reference/i), { target: { value: "FG-AAA" } });
    fireEvent.click(screen.getByRole("button", { name: /Mark Arrived/i }));

    await waitFor(() =>
      expect(axios.patch).toHaveBeenCalledWith(
        "/api/bookings/FG-AAA/gate-scan",
        expect.objectContaining({ action: "entry" }),
        expect.any(Object)
      )
    );
  });

  test("renders the slot-date filter alongside the other filters", () => {
    renderPage();
    expect(screen.getByLabelText(/Filter by slot date/i)).toBeTruthy();
    expect(screen.getByLabelText(/Filter by status/i)).toBeTruthy();
    expect(screen.getByLabelText(/Filter by bay/i)).toBeTruthy();
  });

  test("date filter narrows the table to bookings on that slot date", async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        { id: 1, booking_ref: "FG-AAA", license_plate: "P1", transport_company: "C1", driver_name: "D1", loading_bay: "Bay A", slot_start: "2026-06-21T09:00", status: "Pending" },
        { id: 2, booking_ref: "FG-BBB", license_plate: "P2", transport_company: "C2", driver_name: "D2", loading_bay: "Bay B", slot_start: "2026-06-22T09:00", status: "Pending" },
      ],
    });
    renderPage();
    expect(await screen.findByText("FG-AAA")).toBeTruthy();
    expect(screen.getByText("FG-BBB")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Filter by slot date/i), { target: { value: "2026-06-21" } });

    expect(screen.getByText("FG-AAA")).toBeTruthy();
    expect(screen.queryByText("FG-BBB")).toBeNull();
  });
});
