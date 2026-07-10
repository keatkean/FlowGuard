import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, beforeEach, vi } from "vitest";

import Sidebar, { SIDEBAR_SCROLL_STORAGE_KEY } from "../../src/components/Sidebar";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("userName", "Flow Manager");
  localStorage.setItem("userRole", "FM");
});

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

  test("mobile link selection still closes the sidebar", async () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(document.querySelector(".mobile-menu-btn"));
    expect(document.querySelector(".sidebar.open")).toBeTruthy();

    fireEvent.click(document.querySelector('.sidebar-nav a[href="/tenant-management"]'));
    expect(document.querySelector(".sidebar.open")).toBeNull();
  });
});