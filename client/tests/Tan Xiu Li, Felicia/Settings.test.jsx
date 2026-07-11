// Frontend tests — Settings role-based content after the cleanup pass.
// All roles keep Face ID re-enrollment + Change Password; the FlowGuard AI
// Engine, Camera Feed Quality and Danger Zone sections are permanently removed.
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, beforeEach } from "vitest";

import Settings from "../../src/pages/Settings";

const renderAs = (role) => {
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", role);
  return render(<MemoryRouter><Settings /></MemoryRouter>);
};

beforeEach(() => localStorage.clear());

describe("Settings — shared content", () => {
  test.each(["FM", "Tenant", "Staff"])("%s sees the Settings page with Face ID re-enrollment", (role) => {
    renderAs(role);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(screen.getByText(/Face ID Re-enrollment/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Re-enroll My Face ID/i })).toBeTruthy();
  });

  test.each(["FM", "Tenant", "Staff"])("%s can change their password", (role) => {
    renderAs(role);
    expect(screen.getByRole("heading", { level: 3, name: /Account Security/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Change Password/i })).toBeTruthy();
  });
});

describe("Settings — removed sections stay removed for every role", () => {
  test.each(["FM", "Tenant", "Staff"])("%s does not see AI Engine, Camera Feed Quality or Danger Zone", (role) => {
    renderAs(role);
    expect(screen.queryByText(/FlowGuard AI Engine/i)).toBeNull();
    expect(screen.queryByText(/PPE Detection Strictness/i)).toBeNull();
    expect(screen.queryByText(/Auto-Record on Incident/i)).toBeNull();
    expect(screen.queryByText(/Camera Feed Quality/i)).toBeNull();
    expect(screen.queryByText(/Danger Zone/i)).toBeNull();
    expect(screen.queryByText(/Reboot Network Nodes/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Initiate Reboot/i })).toBeNull();
    // No orphan dead save button either — the only save-style actions left are
    // the Face ID re-enrol and Change Password buttons.
    expect(screen.queryByRole("button", { name: /^Save Changes$/i })).toBeNull();
  });

  test("FM keeps legitimate notification controls", () => {
    renderAs("FM");
    expect(screen.getByText(/Push Notifications to Mobile/i)).toBeTruthy();
  });

  test("notification controls stay FM-only", () => {
    renderAs("Staff");
    expect(screen.queryByText(/Push Notifications to Mobile/i)).toBeNull();
  });
});
