// FM-only "Evaluation Participants" sync card on the Facial Evaluation page.
// Verifies the explicit FM-controlled backfill: confirmation-gated, single
// POST to the sync endpoint only, safe success/failure messaging, participant
// reload after success, and zero operational or biometric surface area.
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockAxios = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}));
vi.mock("axios", () => ({ default: mockAxios }));

import FacialEvaluation from "../../src/pages/FacialEvaluation";

const PARTICIPANTS_URL = "/api/facial-recognition/evaluation-participants";
const SYNC_URL = "/api/facial-recognition/evaluation-participants/sync";

const participants = [
  { userId: 1, evaluationLabel: "P01", name: "System Root Admin", role: "FM", isActive: true, isEnrolled: true },
  { userId: 2, evaluationLabel: "P02", name: "Staff Name", role: "Staff", isActive: true, isEnrolled: true },
  { userId: 3, evaluationLabel: "P03", name: "Tenant Name", role: "Tenant", isActive: true, isEnrolled: true },
];

const renderPage = () => render(<MemoryRouter><FacialEvaluation /></MemoryRouter>);

const getCard = () => screen.getByTestId("evaluation-participants-card");
const openConfirm = () => fireEvent.click(within(getCard()).getByRole("button", { name: "Sync Enrolled Participants" }));
const getDialog = () => screen.getByRole("dialog", { name: "Sync Enrolled Participants" });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", "FM");
  localStorage.setItem("userName", "Felicia");
  mockAxios.get.mockResolvedValue({ data: { participants } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Evaluation Participants sync card", () => {
  test("renders the active participant count and the FM sync button, without auto-syncing", async () => {
    renderPage();
    expect(await within(getCard()).findByText("Active participants: 3")).toBeInTheDocument();
    expect(within(getCard()).getByText("Assign stable evaluation labels to existing Face ID-enrolled users.")).toBeInTheDocument();
    expect(within(getCard()).getByRole("button", { name: "Sync Enrolled Participants" })).toBeEnabled();
    // Read-only on load: GET only, never the POST sync endpoint.
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining(PARTICIPANTS_URL), expect.anything());
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("legend comes from the participant endpoint, not hardcoded names", async () => {
    mockAxios.get.mockResolvedValue({
      data: { participants: [{ userId: 9, evaluationLabel: "P07", name: "Endpoint-Sourced Person", role: "Staff", isActive: true, isEnrolled: true }] },
    });
    renderPage();
    const legend = await screen.findByTestId("participant-legend");
    expect(within(legend).getByText("P07")).toBeInTheDocument();
    expect(within(legend).getByText("Endpoint-Sourced Person")).toBeInTheDocument();
    expect(screen.getByText("Active participants: 1")).toBeInTheDocument();
  });

  test("clicking sync opens a confirmation explaining that existing labels are not changed", async () => {
    renderPage();
    await within(getCard()).findByText("Active participants: 3");
    openConfirm();
    const dialog = getDialog();
    expect(within(dialog).getByText(/Existing labels will not be changed/)).toBeInTheDocument();
    expect(within(dialog).getByText(/only eligible Face ID-enrolled users receive labels/)).toBeInTheDocument();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("cancelling the confirmation makes no request", async () => {
    renderPage();
    await within(getCard()).findByText("Active participants: 3");
    openConfirm();
    fireEvent.click(within(getDialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Sync Enrolled Participants" })).toBeNull();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test("confirming calls ONLY the sync endpoint, shows the success count, and reloads participants", async () => {
    mockAxios.post.mockResolvedValue({ data: { synced: 2, participants } });
    renderPage();
    await within(getCard()).findByText("Active participants: 3");
    const getCallsBefore = mockAxios.get.mock.calls.length;

    openConfirm();
    fireEvent.click(within(getDialog()).getByRole("button", { name: "Confirm Sync" }));

    expect(await screen.findByText("Participant sync completed. 2 new mapping(s) created.")).toBeInTheDocument();
    // Exactly one POST, and only to the sync endpoint.
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(mockAxios.post.mock.calls[0][0]).toContain(SYNC_URL);
    // The shared participant hook reloads after success.
    await waitFor(() => expect(mockAxios.get.mock.calls.length).toBeGreaterThan(getCallsBefore));
    // Existing labels stay unchanged in the reloaded legend.
    const legend = screen.getByTestId("participant-legend");
    for (const label of ["P01", "P02", "P03"]) expect(within(legend).getByText(label)).toBeInTheDocument();
  });

  test("button is disabled while syncing and duplicate submissions are prevented", async () => {
    let resolveSync;
    mockAxios.post.mockImplementation(() => new Promise((resolve) => { resolveSync = resolve; }));
    renderPage();
    await within(getCard()).findByText("Active participants: 3");

    openConfirm();
    const confirmBtn = within(getDialog()).getByRole("button", { name: "Confirm Sync" });
    fireEvent.click(confirmBtn);

    // In-flight: modal button disabled + card button disabled; extra clicks do nothing.
    expect(screen.getByRole("button", { name: "Syncing…" })).toBeDisabled();
    expect(within(getCard()).getByRole("button", { name: "Sync Enrolled Participants" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Syncing…" }));
    fireEvent.click(within(getCard()).getByRole("button", { name: "Sync Enrolled Participants" }));
    expect(mockAxios.post).toHaveBeenCalledTimes(1);

    resolveSync({ data: { synced: 0, participants } });
    expect(await screen.findByText("Participant sync completed. 0 new mapping(s) created.")).toBeInTheDocument();
    expect(within(getCard()).getByRole("button", { name: "Sync Enrolled Participants" })).toBeEnabled();
  });

  test("a failed sync shows a safe error message without leaking server internals", async () => {
    mockAxios.post.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:3001 with secret stack"));
    renderPage();
    await within(getCard()).findByText("Active participants: 3");

    openConfirm();
    fireEvent.click(within(getDialog()).getByRole("button", { name: "Confirm Sync" }));

    expect(await screen.findByText(/Participant sync failed\. Existing labels were not changed/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|stack|127\.0\.0\.1/);
    expect(within(getCard()).getByRole("button", { name: "Sync Enrolled Participants" })).toBeEnabled();
  });

  test("the sync flow never calls Attendance, SecurityLog, access-event, recognise or evaluate APIs", async () => {
    mockAxios.post.mockResolvedValue({ data: { synced: 1, participants } });
    renderPage();
    await within(getCard()).findByText("Active participants: 3");

    openConfirm();
    fireEvent.click(within(getDialog()).getByRole("button", { name: "Confirm Sync" }));
    await screen.findByText("Participant sync completed. 1 new mapping(s) created.");

    const allUrls = [...mockAxios.get.mock.calls, ...mockAxios.post.mock.calls].map(([url]) => url);
    for (const url of allUrls) {
      expect(url).not.toMatch(/attendance|security|access-event|recognise|recognize|\/evaluate\b/i);
    }
    expect(mockAxios.put).not.toHaveBeenCalled();
    expect(mockAxios.patch).not.toHaveBeenCalled();
    expect(mockAxios.delete).not.toHaveBeenCalled();
  });

  test("no biometric or credential data is ever rendered", async () => {
    mockAxios.post.mockResolvedValue({ data: { synced: 1, participants } });
    renderPage();
    await within(getCard()).findByText("Active participants: 3");
    openConfirm();
    fireEvent.click(within(getDialog()).getByRole("button", { name: "Confirm Sync" }));
    await screen.findByText(/Participant sync completed/);
    expect(document.body.textContent).not.toMatch(/faceVector|embedding|data:image|base64|password|tokenVersion/i);
  });
});
