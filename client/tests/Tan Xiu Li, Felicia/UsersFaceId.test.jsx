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
    expect(screen.getByText(/✅ Enrolled/)).toBeTruthy();
    expect(screen.getByText(/❌ Not Enrolled/)).toBeTruthy();
  });

  test("badge never renders biometric data", async () => {
    await renderUsers();
    expect(document.body.textContent).not.toMatch(/faceVector|embedding|\[\s*-?0\.\d+/);
  });
});

describe("User Management — re-enrol action (FM)", () => {
  test("FM sees a Re-enrol button for enrolled users and Enrol for others", async () => {
    await renderUsers();
    expect(screen.getByRole("button", { name: "Re-enrol Face ID" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enrol Face ID" })).toBeTruthy();
  });

  test("clicking re-enrol navigates to /enrollment?userId=<id>", async () => {
    await renderUsers();
    fireEvent.click(screen.getByRole("button", { name: "Re-enrol Face ID" }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/enrollment?userId=25")
    );
  });

  test("non-FM roles do not get the re-enrol action", async () => {
    localStorage.setItem("userRole", "Tenant");
    await renderUsers();
    expect(screen.queryByRole("button", { name: /Re-enrol Face ID|Enrol Face ID/ })).toBeNull();
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
