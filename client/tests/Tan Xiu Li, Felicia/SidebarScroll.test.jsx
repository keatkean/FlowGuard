import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { describe, test, expect, beforeEach, vi } from "vitest";

import Sidebar, { SIDEBAR_SCROLL_STORAGE_KEY } from "../../src/components/Sidebar";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("userName", "Flow Manager");
  localStorage.setItem("userRole", "FM");
});

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="current-path">{location.pathname}</span>;
};

describe("Sidebar scroll persistence", () => {
  test("restores stored nav scroll position and saves updates", async () => {
    sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, "160");

    const { unmount } = render(<MemoryRouter><Sidebar /></MemoryRouter>);
    const nav = document.querySelector(".sidebar-nav");

    await waitFor(() => expect(nav.scrollTop).toBe(160));

    nav.scrollTop = 220;
    fireEvent.scroll(nav);
    expect(sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY)).toBe("220");

    unmount();
    expect(sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY)).toBe("220");
  });

  test("restores the stored position synchronously (before any animation frame)", () => {
    sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, "180");
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    try {
      render(<MemoryRouter><Sidebar /></MemoryRouter>);
      const nav = document.querySelector(".sidebar-nav");
      // No rAF callback ever ran, so this proves the useLayoutEffect itself
      // set scrollTop before the browser could paint the nav at the top.
      expect(nav.scrollTop).toBe(180);
    } finally {
      rafSpy.mockRestore();
    }
  });

  test("restores stored position after a full Sidebar remount", async () => {
    sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, "140");
    const first = render(<MemoryRouter><Sidebar /></MemoryRouter>);
    await waitFor(() => expect(document.querySelector(".sidebar-nav").scrollTop).toBe(140));
    first.unmount();

    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    await waitFor(() => expect(document.querySelector(".sidebar-nav").scrollTop).toBe(140));
  });

  test("clicking Tenant Onboarding saves the current sidebar position and navigates without redirecting to Dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Sidebar />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    const nav = document.querySelector(".sidebar-nav");
    nav.scrollTop = 310;

    fireEvent.click(document.querySelector('.sidebar-nav a[href="/tenant-management"]'));

    expect(sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY)).toBe("310");
    expect(document.querySelector('[data-testid="current-path"]').textContent).toBe("/tenant-management");
  });

  test("mobile link selection still closes the sidebar", async () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(document.querySelector(".mobile-menu-btn"));
    expect(document.querySelector(".sidebar.open")).toBeTruthy();

    fireEvent.click(document.querySelector('.sidebar-nav a[href="/tenant-management"]'));
    expect(document.querySelector(".sidebar.open")).toBeNull();
  });
});