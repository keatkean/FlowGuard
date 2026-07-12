// Frontend tests — manual add-user controls (role-gated) on User Management & My Staff.
import React from "react";
import fs from "node:fs";
import path from "node:path";
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

  test("a user row offers ONLY View Logs, Suspend/Reactivate and Delete (no Face ID row action)", async () => {
    localStorage.setItem("userRole", "FM");
    mockGet.mockResolvedValueOnce({
      data: [{ id: 5, name: "Jane Tan", email: "jane@x.com", role: "Tenant", isActive: true, isEnrolled: false, createdAt: new Date().toISOString(), locationStatus: "Off-Site" }],
    });
    renderUsers();
    await screen.findByText("Jane Tan");
    expect(screen.getByRole("button", { name: /View Logs/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Suspend/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete/i })).toBeTruthy();
    // Face ID enrolment stays in the enrolment flow / Settings, not here.
    expect(screen.queryByRole("button", { name: /Face ID/i })).toBeNull();
    const rowActions = screen.getByLabelText("Actions for Jane Tan");
    expect(rowActions.querySelectorAll("button").length).toBe(3);
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

describe("User Management — table layout", () => {
  const USERS = [
    { id: 5, name: "Tan Xiu Li, Felicia", email: "felicia@flowguard.dev", role: "FM", isActive: true, isEnrolled: true, createdAt: "2026-01-05T08:00:00+08:00" },
    { id: 6, name: "Jane Tan", email: "jane.tan@very-long-company-domain.example.com", role: "Tenant", isActive: true, isEnrolled: false, createdAt: "2026-02-10T08:00:00+08:00" },
  ];

  beforeEach(() => {
    localStorage.setItem("userRole", "FM");
    localStorage.setItem("userId", "5");
    mockGet.mockResolvedValueOnce({ data: USERS });
  });

  test("'(You)' renders as ONE inline badge beside the name — it cannot split apart", async () => {
    const { container } = renderUsers();
    await screen.findByText("Tan Xiu Li, Felicia");

    const selfTags = container.querySelectorAll(".self-tag");
    expect(selfTags.length).toBe(1); // only the signed-in user's row
    // The whole "(You)" string lives in a single badge element, so the old
    // "(You" + ")" line-split cannot happen.
    expect(selfTags[0].textContent).toBe("(You)");
    // Badge sits inside the same name cell as the personnel name.
    expect(selfTags[0].closest(".user-name-text")).not.toBeNull();
    // Other rows never get the badge.
    expect(screen.getByText("Jane Tan").closest("tr").querySelector(".self-tag")).toBeNull();
  });

  test("email and Face ID status remain visible for every row", async () => {
    const { container } = renderUsers();
    await screen.findByText("Jane Tan");
    expect(screen.getByText("felicia@flowguard.dev")).toBeTruthy();
    expect(screen.getByText("jane.tan@very-long-company-domain.example.com")).toBeTruthy();
    const faceIdBadges = [...container.querySelectorAll(".presence-tag")].map((el) => el.textContent.trim());
    expect(faceIdBadges).toEqual(["Enrolled", "Not Enrolled"]);
    // Joined dates stay visible too.
    expect(container.querySelectorAll(".time-cell").length).toBe(2);
  });

  test("table no longer forces a 1280px min-width (desktop fits without horizontal scroll)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../src/css/Users.css"), "utf8");
    expect(css).not.toMatch(/min-width:\s*1280px/);
    // Fixed layout + percentage columns keep the table within the viewport.
    expect(css).toMatch(/table-layout:\s*fixed/);
  });

  test("self row keeps suspend/delete restrictions (buttons disabled for yourself)", async () => {
    renderUsers();
    const selfRow = (await screen.findByText("Tan Xiu Li, Felicia")).closest("tr");
    const rowButtons = [...selfRow.querySelectorAll("button")];
    const suspendBtn = rowButtons.find((b) => /Suspend/.test(b.textContent));
    const deleteBtn = rowButtons.find((b) => /Delete/.test(b.textContent));
    expect(suspendBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
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
