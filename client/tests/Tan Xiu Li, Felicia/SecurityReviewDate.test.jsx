// Frontend tests — Security Review timestamp (date + time) and date filtering.
import React from "react";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import SecurityReview from "../../src/pages/SecurityReview";

// Two events on different Singapore calendar dates.
const LOGS = [
  {
    id: "aaaa1111-0000-4000-9000-000000000001",
    type: "Intrusion Alert",
    desc: "Unregistered person detected.",
    severity: "critical",
    personnelName: null,
    reviewStatus: "Pending Review",
    createdAt: "2026-07-12T16:32:00+08:00", // 12 Jul 2026, 04:32 PM SGT
  },
  {
    id: "bbbb2222-0000-4000-9000-000000000002",
    type: "Suspended Access Attempt",
    desc: "Suspended account denied.",
    severity: "critical",
    personnelName: "Jane Tan",
    reviewStatus: "Pending Review",
    createdAt: "2026-07-10T09:05:00+08:00", // 10 Jul 2026, 09:05 AM SGT
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("accessToken", "test-token");
  mockAxios.get.mockResolvedValue({ data: LOGS });
  mockAxios.patch.mockResolvedValue({ data: {} });
});

afterEach(() => cleanup());

const renderReview = async () => {
  const utils = render(<SecurityReview />);
  await waitFor(() => expect(screen.getByText("Intrusion Alert")).toBeTruthy());
  return utils;
};

describe("Security Review timestamp", () => {
  test("timestamp column shows BOTH the date and the time of the event", async () => {
    await renderReview();
    expect(screen.getByText("12 Jul 2026")).toBeTruthy();
    expect(screen.getByText("04:32 PM")).toBeTruthy();
    expect(screen.getByText("10 Jul 2026")).toBeTruthy();
    expect(screen.getByText("09:05 AM")).toBeTruthy();
  });
});

describe("Security Review date filter", () => {
  test("selecting a date shows only that date's events; clearing restores all", async () => {
    await renderReview();

    fireEvent.change(screen.getByLabelText("Filter by date"), { target: { value: "2026-07-12" } });
    expect(screen.getByText("Intrusion Alert")).toBeTruthy();
    expect(screen.queryByText("Suspended Access Attempt")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Clear date/i }));
    expect(screen.getByText("Intrusion Alert")).toBeTruthy();
    expect(screen.getByText("Suspended Access Attempt")).toBeTruthy();
  });

  test("a date with no events shows the dedicated empty state", async () => {
    await renderReview();
    fireEvent.change(screen.getByLabelText("Filter by date"), { target: { value: "2026-07-01" } });
    expect(screen.getByText("No security events found for this date.")).toBeTruthy();
  });

  test("date filter combines with the review-status filter", async () => {
    await renderReview();

    // Status filter still queries the backend...
    fireEvent.change(screen.getByLabelText("Filter by review status"), { target: { value: "Escalated" } });
    await waitFor(() =>
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("status=Escalated"),
        expect.any(Object)
      )
    );

    // ...and the date filter narrows those results client-side.
    fireEvent.change(screen.getByLabelText("Filter by date"), { target: { value: "2026-07-12" } });
    await waitFor(() => {
      expect(screen.getByText("Intrusion Alert")).toBeTruthy();
      expect(screen.queryByText("Suspended Access Attempt")).toBeNull();
    });
  });
});

describe("Security Review actions", () => {
  test("Save Review still PATCHes the review status and notes", async () => {
    await renderReview();
    const log = LOGS[0];

    fireEvent.change(screen.getByLabelText(`Review status for log ${log.id}`), { target: { value: "Resolved" } });
    fireEvent.change(screen.getByLabelText(`Resolution notes for log ${log.id}`), { target: { value: "Verified courier." } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save Review/i })[0]);

    await waitFor(() =>
      expect(mockAxios.patch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/security/logs/${log.id}/review`),
        { reviewStatus: "Resolved", reviewNotes: "Verified courier." },
        expect.any(Object)
      )
    );
  });
});
