// Frontend tests — Daily Attendance role-aware wording + Staff empty state.
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, test, expect, beforeEach } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn(() => Promise.resolve({ data: [] })) }));
vi.mock("axios", () => ({ default: { get: mockGet } }));

import Attendance from "../../src/pages/Attendance";

const renderAs = (role) => {
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", role);
  return render(<MemoryRouter><Attendance /></MemoryRouter>);
};

beforeEach(() => { mockGet.mockClear(); localStorage.clear(); });

describe("Daily Attendance — role-aware copy", () => {
  test("FM sees the workforce management title", () => {
    renderAs("FM");
    expect(screen.getByText("Workforce Attendance Management")).toBeTruthy();
    expect(screen.getByText(/Global facility occupancy/i)).toBeTruthy();
  });

  test("Tenant sees the unit staff title", () => {
    renderAs("Tenant");
    expect(screen.getByText("Unit Staff Attendance")).toBeTruthy();
    expect(screen.getByText(/your registered unit staff/i)).toBeTruthy();
  });

  test("Staff sees the personal 'My Attendance' title + personal cards", () => {
    renderAs("Staff");
    expect(screen.getByText("My Attendance")).toBeTruthy();
    expect(screen.getByText(/your own check-in/i)).toBeTruthy();
    expect(screen.getByText("My On-Time Arrivals")).toBeTruthy();
    expect(screen.getByText("My Late Exceptions")).toBeTruthy();
  });

  test("Staff empty state is account-scoped wording", async () => {
    renderAs("Staff");
    expect(await screen.findByText("No attendance records found for your account.")).toBeTruthy();
  });

  test("Staff page is accessible (renders without crashing) and calls the logs API", async () => {
    renderAs("Staff");
    expect(mockGet).toHaveBeenCalledWith("/api/attendance/logs", expect.any(Object));
  });
});
