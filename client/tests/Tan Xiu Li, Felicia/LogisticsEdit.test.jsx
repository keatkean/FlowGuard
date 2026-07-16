// Frontend tests — manual Edit Booking flow (modal reuse + PATCH /api/bookings/:id).
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import TenantLogistics from "../../src/pages/TenantLogistics";

const BOOKING = {
  id: 42, booking_ref: "FG-EDIT01", license_plate: "GBG 1234M",
  transport_company: "NinjaVan", driver_name: "Ahmad", driver_phone: "+6591234567",
  loading_bay: "Bay A", slot_start: "2026-07-10T09:00", slot_end: "2026-07-10T10:00",
  notes: "fragile", status: "Pending",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAxios.get.mockResolvedValue({ data: [BOOKING] });
  mockAxios.patch.mockResolvedValue({ data: { message: "Booking updated." } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderAs = async (role) => {
  localStorage.setItem("userRole", role);
  render(<TenantLogistics />);
  await screen.findByText("FG-EDIT01");
};

describe("Edit Booking flow", () => {
  test("Tenant sees an Edit action on an open booking", async () => {
    await renderAs("Tenant");
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  test("Staff does NOT see the Edit action", async () => {
    await renderAs("Staff");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  test("Edit opens the modal pre-filled and saves via PATCH /api/bookings/:id", async () => {
    await renderAs("FM");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByText("Edit Booking")).toBeTruthy();
    const companyInput = screen.getByPlaceholderText("e.g., NinjaVan");
    expect(companyInput.value).toBe("NinjaVan"); // pre-filled from the booking

    fireEvent.change(companyInput, { target: { value: "DHL Express" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mockAxios.patch).toHaveBeenCalled());
    const [url, payload] = mockAxios.patch.mock.calls[0];
    expect(url).toMatch(/\/api\/bookings\/42$/);
    expect(payload.transport_company).toBe("DHL Express");
    // Create endpoint must NOT be hit during an edit.
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("+ New Booking still opens the create variant", async () => {
    await renderAs("Tenant");
    fireEvent.click(screen.getByRole("button", { name: /New Booking/ }));
    expect(await screen.findByText("Schedule New Delivery")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Booking" })).toBeTruthy();
  });
});
