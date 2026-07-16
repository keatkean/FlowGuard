// Guided simulated facial CRUD — Create wizard, participant-specific Read,
// Update, Delete. Everything stays in localStorage; no production API calls.
import React from "react";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import FacialEvaluation from "../../src/pages/FacialEvaluation";
import { SIM_USERS_KEY, EVAL_STORAGE_KEY } from "../../src/constants/evaluation";

const renderPage = (initialEntry = "/facial-evaluation") =>
  render(<MemoryRouter initialEntries={[initialEntry]}><FacialEvaluation /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("accessToken", "test-token");
  localStorage.setItem("userRole", "FM");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const createParticipantViaWizard = () => {
  fireEvent.click(screen.getByRole("button", { name: "Start guided create" }));
  // Step 1 — participant label + role
  fireEvent.change(screen.getByLabelText(/Participant label/), { target: { value: "P02" } });
  fireEvent.change(within(screen.getByTestId("sim-wizard")).getByLabelText(/^Role/), { target: { value: "Staff" } });
  fireEvent.click(screen.getByRole("button", { name: "Next: enrolment source" }));
  // Step 2 — enrolment source
  fireEvent.change(screen.getByLabelText(/Enrolment source/), { target: { value: "Simulated Pi Camera" } });
  fireEvent.click(screen.getByRole("button", { name: "Next: capture" }));
  // Step 3 — guided capture, one orientation at a time
  fireEvent.click(screen.getByRole("button", { name: "Capture Front" }));
  fireEvent.click(screen.getByRole("button", { name: "Capture Left Angle" }));
  fireEvent.click(screen.getByRole("button", { name: "Capture Right Angle" }));
  // Step 4 — review + create
  fireEvent.click(screen.getByRole("button", { name: "Create simulated participant" }));
};

describe("Guided simulated CREATE", () => {
  test("wizard walks through participant, source and per-orientation capture without auto-completing", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start guided create" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: enrolment source" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: capture" }));

    // Nothing is captured until each guided action is clicked.
    const wizardEl = screen.getByTestId("sim-wizard");
    expect(within(wizardEl).getByText(/Front: Pending/)).toBeTruthy();
    expect(within(wizardEl).getByText(/Left Angle: Pending/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Capture Front" }));
    expect(within(wizardEl).getByText(/Front: Captured/)).toBeTruthy();
    expect(within(wizardEl).getByText(/Left Angle: Pending/)).toBeTruthy();
    // The next capture action moves to the next orientation.
    expect(screen.getByRole("button", { name: "Capture Left Angle" })).toBeTruthy();
  });

  test("created participant stores safe metadata only — never image/base64/vector/name/email", () => {
    renderPage();
    createParticipantViaWizard();

    expect(screen.getByText(/P02 created in simulation only/)).toBeTruthy();
    const raw = localStorage.getItem(SIM_USERS_KEY);
    const stored = JSON.parse(raw)[0];
    expect(stored).toMatchObject({
      participantLabel: "P02",
      role: "Staff",
      status: "Active",
      enrolled: true,
      enrolmentSource: "Simulated Pi Camera",
      enrolledAngles: ["Front", "Left Angle", "Right Angle"],
    });
    expect(stored.createdAt).toBeTruthy();
    expect(raw).not.toMatch(/data:image|base64|vector|embedding|template|@/i);
    // No production API was touched.
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(mockAxios.put).not.toHaveBeenCalled();
  });

  test("temporary upload previews via object URL only and revokes it — image data is never persisted", () => {
    const createObjectURL = vi.fn(() => "blob:sim-upload");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL }));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start guided create" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: enrolment source" }));
    fireEvent.change(screen.getByLabelText(/Enrolment source/), { target: { value: "Temporary Upload" } });
    fireEvent.click(screen.getByRole("button", { name: "Next: capture" }));

    const file = new File(["fake"], "front.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/Temporary upload for Front/), { target: { files: [file] } });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText(/temporary Front preview/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Attach as Front" }));
    // Object URL revoked once the orientation metadata is captured.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sim-upload");
    expect(localStorage.getItem(SIM_USERS_KEY) || "").not.toMatch(/blob:|data:image|base64/);
  });
});

describe("Simulated participant-specific READ", () => {
  test("scanning uses the SELECTED participant, not the first one", () => {
    localStorage.setItem(SIM_USERS_KEY, JSON.stringify([
      { id: "SIM-A", participantLabel: "P01", role: "Staff", status: "Active", enrolled: true, enrolmentSource: "Simulated Pi Camera", enrolledAngles: ["Front"], audit: [] },
      { id: "SIM-B", participantLabel: "P04", role: "Tenant", status: "Active", enrolled: true, enrolmentSource: "Simulated Laptop Webcam", enrolledAngles: ["Front"], audit: [] },
    ]));
    renderPage();

    fireEvent.change(screen.getByLabelText("Simulated participant to scan"), { target: { value: "SIM-B" } });
    fireEvent.click(screen.getByRole("button", { name: "Read / scan participant" }));

    const result = within(screen.getByTestId("sim-result"));
    expect(result.getByText("P04")).toBeTruthy();
    expect(result.getByText("Access Granted")).toBeTruthy();
  });

  test("Pi offline and service offline scenarios run through the same selected-scenario flow", () => {
    localStorage.setItem(SIM_USERS_KEY, JSON.stringify([
      { id: "SIM-A", participantLabel: "P03", role: "Staff", status: "Active", enrolled: true, enrolmentSource: "Simulated Pi Camera", enrolledAngles: ["Front"], audit: [] },
    ]));
    renderPage();
    fireEvent.change(screen.getByLabelText("Simulated participant to scan"), { target: { value: "SIM-A" } });

    fireEvent.change(screen.getByLabelText(/Read scenario/), { target: { value: "pi-offline" } });
    fireEvent.click(screen.getByRole("button", { name: "Read / scan participant" }));
    expect(within(screen.getByTestId("sim-result")).getByText(/laptop-webcam fallback/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Read scenario/), { target: { value: "service-offline" } });
    fireEvent.click(screen.getByRole("button", { name: "Read / scan participant" }));
    expect(within(screen.getByTestId("sim-result")).getByText(/backoff engaged/i)).toBeTruthy();
    expect(within(screen.getByTestId("sim-result")).getByText(/Camera source is not switched/i)).toBeTruthy();

    // Simulated reads never call the production recognition endpoint.
    expect(mockAxios.post).not.toHaveBeenCalled();
  });
});

describe("Simulated UPDATE", () => {
  test("role change, suspend/reactivate and re-enrol update metadata with audit events", () => {
    localStorage.setItem(SIM_USERS_KEY, JSON.stringify([
      { id: "SIM-A", participantLabel: "P01", role: "Staff", status: "Active", enrolled: true, enrolmentSource: "Simulated Pi Camera", enrolledAngles: ["Front"], audit: [] },
    ]));
    renderPage();

    fireEvent.change(screen.getByLabelText("Simulated role for P01"), { target: { value: "Tenant" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    let stored = JSON.parse(localStorage.getItem(SIM_USERS_KEY))[0];
    expect(stored.role).toBe("Tenant");
    expect(stored.status).toBe("Suspended");
    expect(stored.audit.some((a) => /role changed/i.test(a.event))).toBe(true);
    expect(stored.audit.some((a) => /suspend/i.test(a.event))).toBe(true);

    // Re-enrol reruns the guided capture flow (steps 2-4) with a new source.
    fireEvent.click(screen.getByRole("button", { name: "Re-enrol" }));
    fireEvent.change(screen.getByLabelText(/Enrolment source/), { target: { value: "Simulated Laptop Webcam" } });
    fireEvent.click(screen.getByRole("button", { name: "Next: capture" }));
    fireEvent.click(screen.getByRole("button", { name: "Capture Front" }));
    fireEvent.click(screen.getByRole("button", { name: "Capture Left Angle" }));
    fireEvent.click(screen.getByRole("button", { name: "Capture Right Angle" }));
    fireEvent.click(screen.getByRole("button", { name: "Save re-enrolment" }));

    stored = JSON.parse(localStorage.getItem(SIM_USERS_KEY))[0];
    expect(stored.enrolmentSource).toBe("Simulated Laptop Webcam");
    expect(stored.audit.some((a) => /re-enrolment via Simulated Laptop Webcam/i.test(a.event))).toBe(true);
    // No production User was touched.
    expect(mockAxios.put).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });
});

describe("Simulated DELETE", () => {
  test("requires confirmation, removes the participant plus its simulated records, never calls the production delete route", () => {
    localStorage.setItem(SIM_USERS_KEY, JSON.stringify([
      { id: "SIM-A", participantLabel: "P01", role: "Staff", status: "Active", enrolled: true, enrolmentSource: "Simulated Pi Camera", enrolledAngles: ["Front"], audit: [] },
    ]));
    localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify([
      { id: "EV-1", actualLabel: "P01", predictedLabel: "P01", condition: "Front", source: "Simulated", origin: "Simulated CRUD", notes: "Simulated Read: P01", timestamp: "2026-07-10T02:00:00.000Z" },
      { id: "EV-2", actualLabel: "P01", predictedLabel: "P01", condition: "Front", source: "Live", origin: "Gate Scanner", notes: "live P01 check", timestamp: "2026-07-10T02:00:00.000Z" },
    ]));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("This removes only the simulated participant"));
    expect(JSON.parse(localStorage.getItem(SIM_USERS_KEY))).toHaveLength(0);
    const records = JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY));
    // Simulated record mentioning P01 removed; the LIVE record is preserved.
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("Live");
    expect(mockAxios.delete).not.toHaveBeenCalled();
  });
});

describe("Deep links", () => {
  test("?tab=matrix&source=Live opens the matrix tab in Live mode", () => {
    renderPage("/facial-evaluation?tab=matrix&source=Live&origin=Gate%20Scanner");
    expect(screen.getByRole("tab", { name: "Confusion Matrix", selected: true })).toBeTruthy();
    expect(screen.getByLabelText("Matrix source filter").value).toBe("Live");
    expect(screen.getByLabelText("Matrix origin filter").value).toBe("Gate Scanner");
  });
});
