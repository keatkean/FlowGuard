// Frontend tests — Settings role-based content.
// All roles see Face ID re-enrollment; only FM sees admin/system sections.
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
  test.each(["FM", "Tenant", "Staff"])("%s sees Face ID re-enrollment", (role) => {
    renderAs(role);
    expect(screen.getByText(/Face ID Re-enrollment/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Re-enroll My Face ID/i })).toBeTruthy();
  });
});

describe("Settings — admin sections gated to FM", () => {
  test("Tenant does NOT see admin/system controls", () => {
    renderAs("Tenant");
    expect(screen.queryByText(/Danger Zone/i)).toBeNull();
    expect(screen.queryByText(/Reboot Network Nodes/i)).toBeNull();
    expect(screen.queryByText(/FlowGuard AI Engine/i)).toBeNull();
    expect(screen.queryByText(/Camera Feed Quality/i)).toBeNull();
  });

  test("Staff does NOT see admin/system controls", () => {
    renderAs("Staff");
    expect(screen.queryByText(/Danger Zone/i)).toBeNull();
    expect(screen.queryByText(/Reboot Network Nodes/i)).toBeNull();
    expect(screen.queryByText(/FlowGuard AI Engine/i)).toBeNull();
  });

  test("FM still sees admin/system controls", () => {
    renderAs("FM");
    expect(screen.getByText(/FlowGuard AI Engine/i)).toBeTruthy();
    expect(screen.getByText(/Danger Zone/i)).toBeTruthy();
    expect(screen.getByText(/Reboot Network Nodes/i)).toBeTruthy();
  });
});
