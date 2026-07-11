// Frontend tests — Face ID enrolment badges and the FM re-enrol action on
// User Management, plus API-base consistency across Felicia's pages.
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import Users from "../../src/pages/Users";

const USERS = [
  { id: 25, name: "Enrolled Emma", email: "e@x.com", role: "Staff", isActive: true, isEnrolled: true, createdAt: "2026-01-01", locationStatus: "On-Site" },
  { id: 26, name: "Newbie Ng", email: "n@x.com", role: "Tenant", isActive: true, isEnrolled: false, createdAt: "2026-01-02", locationStatus: "Off-Site" },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("userRole", "FM");
  localStorage.setItem("userId", "1");
  mockAxios.get.mockResolvedValue({ data: USERS });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderUsers = async () => {
  render(<MemoryRouter><Users /></MemoryRouter>);
  await screen.findByText("Enrolled Emma");
};

describe("User Management — Face ID badge", () => {
  test("shows Enrolled / Not Enrolled per user", async () => {
    await renderUsers();
    const enrolled = document.querySelector('.presence-tag.on-site');
    const notEnrolled = document.querySelector('.presence-tag.off-site');
    expect(enrolled?.classList.contains('presence-tag')).toBe(true);
    expect(notEnrolled?.classList.contains('presence-tag')).toBe(true);
    expect(enrolled?.querySelector('svg')).toBeTruthy();
    expect(notEnrolled?.querySelector('svg')).toBeTruthy();
  });

  test("badge never renders biometric data", async () => {
    await renderUsers();
    expect(document.body.textContent).not.toMatch(/faceVector|embedding|\[\s*-?0\.\d+/);
  });
});

describe("User Management — Face ID enrolment removed from row actions", () => {
  test("no role sees an Enrol/Re-enrol Face ID row action (it lives in Settings / the enrolment flow)", async () => {
    await renderUsers();
    expect(screen.queryByRole("button", { name: /Re-enrol Face ID|Enrol Face ID|Face ID/ })).toBeNull();

    cleanup();
    localStorage.setItem("userRole", "Tenant");
    await renderUsers();
    expect(screen.queryByRole("button", { name: /Re-enrol Face ID|Enrol Face ID|Face ID/ })).toBeNull();
  });
});

describe("User Management — compact role badges", () => {
  test("role column shows a compact badge with a separate readable description", async () => {
    await renderUsers();
    // Compact badge text only — never a long combined label.
    expect(document.body.textContent).not.toMatch(/FM - FACILITIES MANAGER|Tenant - Unit Owner|Staff - Worker/i);
    const staffBadge = document.querySelector(".role-badge.role-staff");
    const tenantBadge = document.querySelector(".role-badge.role-tenant");
    expect(staffBadge.textContent).toBe("Staff");
    expect(tenantBadge.textContent).toBe("Tenant");
    // Accessible visible description, not colour-only.
    expect(screen.getByText("Worker")).toBeTruthy();
    expect(screen.getByText("Unit Owner")).toBeTruthy();
  });
});

describe("User Management — secure deletion flow", () => {
  test("self row has disabled Suspend and Delete controls", async () => {
    localStorage.setItem("userId", "25");
    await renderUsers();
    const row = screen.getByLabelText("Actions for Enrolled Emma");
    const buttons = [...row.querySelectorAll("button")];
    const suspendBtn = buttons.find((b) => /Suspend/.test(b.textContent));
    const deleteBtn = buttons.find((b) => /Delete/.test(b.textContent));
    expect(suspendBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
  });

  test("a 409 linked-Staff conflict from the server stays visible in the modal", async () => {
    await renderUsers();
    const row = screen.getByLabelText("Actions for Newbie Ng");
    fireEvent.click([...row.querySelectorAll("button")].find((b) => /Delete/.test(b.textContent)));
    fireEvent.change(screen.getByPlaceholderText("Newbie Ng"), { target: { value: "Newbie Ng" } });
    mockAxios.delete.mockRejectedValueOnce({ response: { status: 409, data: { message: "This tenant still has 2 linked Staff account(s)." } } });
    fireEvent.click(screen.getByRole("button", { name: /Permanently Delete/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/linked Staff/i);
  });

  test("successful deletion refreshes the user list and shows the delete wording", async () => {
    await renderUsers();
    const row = screen.getByLabelText("Actions for Newbie Ng");
    fireEvent.click([...row.querySelectorAll("button")].find((b) => /Delete/.test(b.textContent)));
    expect(screen.getByText(/Permanently remove login access, Face ID enrolment and operational access/i)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Newbie Ng"), { target: { value: "Newbie Ng" } });
    mockAxios.delete.mockResolvedValueOnce({ data: { message: "Removed" } });
    mockAxios.get.mockResolvedValueOnce({ data: [USERS[0]] });
    fireEvent.click(screen.getByRole("button", { name: /Permanently Delete/i }));

    await screen.findByText(/permanently removed from FlowGuard/i);
    expect(mockAxios.delete).toHaveBeenCalledWith(expect.stringContaining("/user/26"), expect.any(Object));
    // list re-fetched after the delete (initial load + refresh)
    expect(mockAxios.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Deployment API-base consistency (static source check)", () => {
  const PAGES = [
    "Users.jsx", "StaffManagement.jsx", "Attendance.jsx", "SecurityReview.jsx",
    "UserLogs.jsx", "FaceEnrollment.jsx", "GateScanner.jsx", "VPatrol.jsx",
    "TenantLogistics.jsx", "DriverPass.jsx",
  ];
  const pagesDir = path.resolve(__dirname, "../../src/pages");

  test.each(PAGES)("%s imports the shared API_BASE_URL", (page) => {
    const source = fs.readFileSync(path.join(pagesDir, page), "utf8");
    expect(source).toMatch(/import \{ API_BASE_URL \} from ['"]\.\.\/constants\/api['"]/);
  });

  test.each(PAGES)("%s has no hardcoded relative API calls left", (page) => {
    const source = fs.readFileSync(path.join(pagesDir, page), "utf8");
    // Every axios/fetch call to the backend must go through the template base,
    // not a bare '/api/...' or '/user...' string literal.
    expect(source).not.toMatch(/axios\.(get|post|put|patch|delete)\(\s*['"]\/(api|user)/);
    expect(source).not.toMatch(/axios\.(get|post|put|patch|delete)\(\s*`\/(api|user)/);
    expect(source).not.toMatch(/fetch\(\s*[`'"]\/(api|user)/);
  });

  test("no page uses the retired VITE_API_URL variable", () => {
    for (const page of PAGES) {
      const source = fs.readFileSync(path.join(pagesDir, page), "utf8");
      expect(source).not.toMatch(/VITE_API_URL\b/);
    }
  });
});
