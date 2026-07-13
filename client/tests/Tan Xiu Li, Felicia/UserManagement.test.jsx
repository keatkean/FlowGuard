// Frontend tests — manual add-user controls (role-gated) on User Management & My Staff.
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, test, expect, beforeEach } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn((url) => {
    if (url === "/user/my-code") {
      return Promise.resolve({ data: { companyCode: "FLOW-TEST", codeCurrentUsage: 0, codeMaxUsage: 10 } });
    }
    return Promise.resolve({ data: [] });
  }),
  mockPost: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("axios", () => ({ default: { get: mockGet, post: mockPost } }));

import Users from "../../src/pages/Users";
import StaffManagement from "../../src/pages/StaffManagement";

const renderUsers = () => render(<MemoryRouter><Users /></MemoryRouter>);
const renderStaff = () => render(<MemoryRouter><StaffManagement /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("accessToken", "test-token");
});

describe("User Management — Add Tenant (FM)", () => {
  test("FM sees the + Add Tenant button", () => {
    localStorage.setItem("userRole", "FM");
    renderUsers();
    expect(screen.getByRole("button", { name: /Add Tenant/i })).toBeTruthy();
  });

  test("User Management does NOT show Re-enroll My Face ID (moved to Settings)", () => {
    localStorage.setItem("userRole", "FM");
    renderUsers();
    expect(screen.queryByText(/Re-enroll My Face ID/i)).toBeNull();
  });

  test("FM does NOT see an 'Add FM' control (FM accounts are seed/setup only)", () => {
    localStorage.setItem("userRole", "FM");
    renderUsers();
    expect(screen.queryByRole("button", { name: /Add FM/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Add Tenant/i })).toBeTruthy();
  });

  test("a user row keeps Logs/Suspend/Delete but no Face ID action", async () => {
    localStorage.setItem("userRole", "FM");
    mockGet.mockResolvedValueOnce({
      data: [{ id: 5, name: "Jane Tan", email: "jane@x.com", role: "Tenant", isActive: true, createdAt: new Date().toISOString(), locationStatus: "Off-Site" }],
    });
    renderUsers();
    await screen.findByText("Jane Tan");
    expect(screen.getByRole("button", { name: /^Logs$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Suspend/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Face ID$/i })).toBeNull();
  });

  test("non-FM does not see the + Add Tenant button", () => {
    localStorage.setItem("userRole", "Tenant");
    renderUsers();
    expect(screen.queryByRole("button", { name: /Add Tenant/i })).toBeNull();
  });

  test("clicking + Add Tenant opens the modal", async () => {
    localStorage.setItem("userRole", "FM");
    renderUsers();
    fireEvent.click(screen.getByRole("button", { name: /Add Tenant/i }));
    expect(await screen.findByText(/Add Tenant Account/i)).toBeTruthy();
  });
});

describe("My Staff — Add Staff (Tenant)", () => {
  test("Tenant sees the + Add Staff button", () => {
    localStorage.setItem("userRole", "Tenant");
    renderStaff();
    expect(screen.getByRole("button", { name: /Add Staff/i })).toBeTruthy();
  });

  test("non-Tenant (FM) does not see the + Add Staff button", () => {
    localStorage.setItem("userRole", "FM");
    renderStaff();
    expect(screen.queryByRole("button", { name: /Add Staff/i })).toBeNull();
  });
});
