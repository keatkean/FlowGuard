// Frontend RBAC tests — route protection + sidebar visibility + 401/403 behaviour.
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, test, expect, beforeEach } from "vitest";

import ProtectedRoute from "../../src/components/ProtectedRoute";
import Sidebar from "../../src/components/Sidebar";
import { ACCESS, ROLES, roleLabel } from "../../src/constants/roles";

const login = (role) => {
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", role);
  localStorage.setItem("userName", "Tester");
};

// Render a guarded page inside a router that maps the 401/403 redirect targets to markers.
const renderRoute = (allowedRoles) =>
  render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/secret" element={
          <ProtectedRoute allowedRoles={allowedRoles}><div>SECRET-PAGE</div></ProtectedRoute>
        } />
        <Route path="/error/401" element={<div>LOGIN-401</div>} />
        <Route path="/error/403" element={<div>FORBIDDEN-403</div>} />
      </Routes>
    </MemoryRouter>
  );

const renderSidebar = () =>
  render(<MemoryRouter><Sidebar /></MemoryRouter>);

beforeEach(() => localStorage.clear());

describe("Route protection by role", () => {
  test("unauthenticated user is redirected to the 401 page", () => {
    renderRoute(ACCESS.FM_ONLY);
    expect(screen.getByText("LOGIN-401")).toBeTruthy();
    expect(screen.queryByText("SECRET-PAGE")).toBeNull();
  });

  test("Tenant is forbidden (403) from an FM-only route", () => {
    login(ROLES.TENANT);
    renderRoute(ACCESS.FM_ONLY);
    expect(screen.getByText("FORBIDDEN-403")).toBeTruthy();
  });

  test("Staff is forbidden (403) from an FM-only admin route", () => {
    login(ROLES.STAFF);
    renderRoute(ACCESS.FM_ONLY);
    expect(screen.getByText("FORBIDDEN-403")).toBeTruthy();
  });

  test("FM can enter an FM-only route", () => {
    login(ROLES.FM);
    renderRoute(ACCESS.FM_ONLY);
    expect(screen.getByText("SECRET-PAGE")).toBeTruthy();
  });

  test("Staff is blocked (403) from FM-only monitoring routes (cameras/v-patrol/etc.)", () => {
    login(ROLES.STAFF);
    renderRoute(ACCESS.FM_ONLY);
    expect(screen.getByText("FORBIDDEN-403")).toBeTruthy();
  });

  test("Staff can enter an all-roles route (attendance / logistics)", () => {
    login(ROLES.STAFF);
    renderRoute(ACCESS.ANY);
    expect(screen.getByText("SECRET-PAGE")).toBeTruthy();
  });

  test("Tenant is forbidden from a live-monitoring (FM+Staff) route", () => {
    login(ROLES.TENANT);
    renderRoute(ACCESS.FM_STAFF);
    expect(screen.getByText("FORBIDDEN-403")).toBeTruthy();
  });

  test("Tenant can enter an FM+Tenant route", () => {
    login(ROLES.TENANT);
    renderRoute(ACCESS.FM_TENANT);
    expect(screen.getByText("SECRET-PAGE")).toBeTruthy();
  });
});

describe("Sidebar visibility by role", () => {
  test("Tenant does NOT see FM-only or live-monitoring links", () => {
    login(ROLES.TENANT);
    renderSidebar();
    expect(screen.queryByText("User Management")).toBeNull();
    expect(screen.queryByText("Security Review")).toBeNull();
    expect(screen.queryByText("Tenant Onboarding")).toBeNull();
    expect(screen.queryByText("V-Patrol")).toBeNull();
    expect(screen.queryByText("Cameras")).toBeNull();
    // ...but DOES see its own areas + Settings (visible to all authenticated roles)
    expect(screen.getByText("Daily Attendance")).toBeTruthy();
    expect(screen.getByText("My Staff")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  test("Staff sidebar = Dashboard, Daily Attendance, Logistics & Bays, Settings only", () => {
    login(ROLES.STAFF);
    renderSidebar();
    // Visible to Staff (factory worker)
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Daily Attendance")).toBeTruthy();
    expect(screen.getByText("Logistics & Bays")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    // Hidden: AI/security monitoring, admin, and My Staff
    expect(screen.queryByText("Cameras")).toBeNull();
    expect(screen.queryByText("V-Patrol")).toBeNull();
    expect(screen.queryByText("Object Detection")).toBeNull();
    expect(screen.queryByText("Gate Scanner")).toBeNull();
    expect(screen.queryByText("User Management")).toBeNull();
    expect(screen.queryByText("Security Review")).toBeNull();
    expect(screen.queryByText("Tenant Onboarding")).toBeNull();
    expect(screen.queryByText("My Staff")).toBeNull();
  });

  test("FM sees the full admin menu", () => {
    login(ROLES.FM);
    renderSidebar();
    expect(screen.getByText("User Management")).toBeTruthy();
    expect(screen.getByText("Security Review")).toBeTruthy();
    expect(screen.getByText("Tenant Onboarding")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("V-Patrol")).toBeTruthy();
  });
});

describe("roleLabel wording", () => {
  test("Staff is labelled 'Staff' (not 'Security Staff')", () => {
    expect(roleLabel(ROLES.STAFF)).toBe("Staff");
    expect(roleLabel(ROLES.FM)).toBe("Facilities Manager");
    expect(roleLabel(ROLES.TENANT)).toBe("Tenant");
  });
});
