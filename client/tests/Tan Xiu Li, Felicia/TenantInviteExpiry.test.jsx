// Tenant Onboarding — pending-invite expiry countdown and status handling.
import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import TenantManagement, {
  formatRemainingDuration,
  deriveInviteStatus,
} from "../../src/pages/TenantManagement";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const buildInvite = (overrides = {}) => ({
  id: 1,
  code: "INVITE-AAAA1111",
  role: "Tenant",
  createdAt: new Date(Date.now() - HOUR).toISOString(),
  expiresAt: new Date(Date.now() + 40 * HOUR).toISOString(),
  status: "PENDING",
  isUsed: false,
  isUsable: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("accessToken", "token");
  localStorage.setItem("userName", "FM One");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("formatRemainingDuration", () => {
  test("formats days + hours", () => {
    expect(formatRemainingDuration(40 * HOUR)).toBe("1 day 16 hours");
  });
  test("formats hours + minutes", () => {
    expect(formatRemainingDuration(3 * HOUR + 12 * MINUTE)).toBe("3 hours 12 minutes");
  });
  test("formats minutes only and sub-minute", () => {
    expect(formatRemainingDuration(45 * MINUTE)).toBe("45 minutes");
    expect(formatRemainingDuration(30 * 1000)).toBe("under 1 minute");
  });
  test("returns null once expired", () => {
    expect(formatRemainingDuration(0)).toBeNull();
    expect(formatRemainingDuration(-5)).toBeNull();
  });
});

describe("deriveInviteStatus", () => {
  test("keeps authoritative server statuses", () => {
    expect(deriveInviteStatus({ status: "USED" })).toBe("USED");
    expect(deriveInviteStatus({ status: "EXPIRED" })).toBe("EXPIRED");
  });
  test("downgrades PENDING to EXPIRED the moment the server expiry passes", () => {
    const expiresAt = new Date("2026-07-12T09:53:00.000Z").toISOString();
    const before = new Date("2026-07-12T09:52:59.999Z").getTime();
    const atExpiry = new Date("2026-07-12T09:53:00.000Z").getTime();
    expect(deriveInviteStatus({ status: "PENDING", expiresAt }, before)).toBe("PENDING");
    expect(deriveInviteStatus({ status: "PENDING", expiresAt }, atExpiry)).toBe("EXPIRED");
  });
});

describe("Tenant Onboarding — invite table", () => {
  test("PENDING invite shows the countdown block instead of the old vague note", async () => {
    mockAxios.get.mockResolvedValue({ data: [buildInvite()] });
    render(<MemoryRouter><TenantManagement /></MemoryRouter>);

    await screen.findByText("INVITE-AAAA1111");
    expect(screen.getByText(/Valid for 1 day 1[56] hours/)).toBeTruthy();
    expect(screen.getByText(/^Expires /)).toBeTruthy();
    expect(screen.getByText("PENDING")).toBeTruthy();
    expect(screen.queryByText(/Usable until expiry/i)).toBeNull();
  });

  test("USED and EXPIRED invites keep accessible status badges without a countdown", async () => {
    mockAxios.get.mockResolvedValue({
      data: [
        buildInvite({ id: 2, code: "INVITE-USED0000", status: "USED", isUsed: true, isUsable: false }),
        buildInvite({ id: 3, code: "INVITE-EXP00000", status: "EXPIRED", isUsable: false, expiresAt: new Date(Date.now() - HOUR).toISOString() }),
      ],
    });
    render(<MemoryRouter><TenantManagement /></MemoryRouter>);

    await screen.findByText("INVITE-USED0000");
    expect(screen.getByRole("status", { name: /Invitation status: USED/i })).toBeTruthy();
    expect(screen.getByRole("status", { name: /Invitation status: EXPIRED/i })).toBeTruthy();
    expect(screen.queryByText(/Valid for/)).toBeNull();
  });

  test("countdown reaching zero flips the badge to EXPIRED and refreshes the server list", async () => {
    const invite = buildInvite({ expiresAt: new Date(Date.now() + 30 * 1000).toISOString() });
    mockAxios.get.mockResolvedValue({ data: [invite] });

    vi.useFakeTimers();
    render(<MemoryRouter><TenantManagement /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("PENDING")).toBeTruthy();

    // One minute later the invite's server expiry time has passed.
    await act(async () => {
      vi.advanceTimersByTime(MINUTE + 1000);
      await Promise.resolve();
    });

    expect(screen.getByText("EXPIRED")).toBeTruthy();
    expect(screen.queryByText("PENDING")).toBeNull();
    // Authoritative refresh: initial load + post-expiry re-fetch.
    expect(mockAxios.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
