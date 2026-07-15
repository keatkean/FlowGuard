// MUI icon CJS/ESM interop regression suite.
// In Vite dev, deep '@mui/icons-material/*' imports (CJS, no "exports" map)
// can arrive in JSX as { __esModule: true, default: Component } and crash with
// "Element type is invalid ... got: object". These tests supply REAL fake
// module objects (Vitest auto-unwraps genuine MUI imports, so relying on
// normal imports alone would prove nothing).
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));

const mockAxios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: mockAxios }));

import { resolveIconComponent } from "../../src/utils/iconInterop";
import SafeMuiIcon from "../../src/components/SafeMuiIcon";
import SecurityLogIcon from "../../src/components/SecurityLogIcon";
import LiveConfusionMatrixPanel from "../../src/components/LiveConfusionMatrixPanel";
import Users from "../../src/pages/Users";
import TenantManagement from "../../src/pages/TenantManagement";
import GateScanner from "../../src/pages/GateScanner";
import VPatrol from "../../src/pages/VPatrol";
import { EVAL_STORAGE_KEY } from "../../src/constants/evaluation";

const INVALID_ELEMENT_RE = /Element type is invalid|got: object|Objects are not valid as a React child|object.*React component/i;

let errorSpy;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("accessToken", "token");
  errorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const invalid = errorSpy.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((message) => INVALID_ELEMENT_RE.test(message));
  errorSpy.mockRestore();
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  // Every test in this file doubles as an invalid-element-type guard.
  expect(invalid).toEqual([]);
});

// ---------------------------------------------------------------------------
// resolveIconComponent
// ---------------------------------------------------------------------------
describe("resolveIconComponent", () => {
  const Component = () => <svg data-testid="plain" />;

  test("plain function component remains unchanged", () => {
    expect(resolveIconComponent(Component)).toBe(Component);
  });

  test("React.memo-style component (has $$typeof) remains unchanged", () => {
    const memoLike = { $$typeof: Symbol.for("react.memo"), type: Component };
    expect(resolveIconComponent(memoLike)).toBe(memoLike);
  });

  test("{ default: Component } unwraps", () => {
    expect(resolveIconComponent({ default: Component })).toBe(Component);
  });

  test("{ __esModule: true, default: Component } unwraps", () => {
    expect(resolveIconComponent({ __esModule: true, default: Component })).toBe(Component);
  });

  test("nested { default: { default: Component } } unwraps fully", () => {
    expect(resolveIconComponent({ default: { __esModule: true, default: Component } })).toBe(Component);
  });

  test("null/undefined return null", () => {
    expect(resolveIconComponent(null)).toBeNull();
    expect(resolveIconComponent(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SafeMuiIcon
// ---------------------------------------------------------------------------
describe("SafeMuiIcon", () => {
  test("renders a normal function icon", () => {
    const PlainIcon = (props) => <svg data-testid="plain-icon" {...props} />;
    render(<SafeMuiIcon icon={PlainIcon} />);
    expect(screen.getByTestId("plain-icon")).toBeTruthy();
  });

  test("renders an interop module-object icon without 'Element type is invalid'", () => {
    const WrappedIcon = {
      __esModule: true,
      default: () => <svg data-testid="wrapped-icon" />,
    };
    render(<SafeMuiIcon icon={WrappedIcon} />);
    expect(screen.getByTestId("wrapped-icon")).toBeTruthy();
  });

  test("missing icon renders nothing instead of crashing", () => {
    const { container } = render(<SafeMuiIcon icon={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  test("forwards props such as className and aria-hidden", () => {
    const PlainIcon = (props) => <svg data-testid="propped-icon" {...props} />;
    render(<SafeMuiIcon icon={PlainIcon} className="log-glyph" aria-hidden="true" />);
    const el = screen.getByTestId("propped-icon");
    expect(el.getAttribute("class")).toBe("log-glyph");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// Runtime components render without invalid-element errors
// ---------------------------------------------------------------------------
describe("Runtime icon-bearing components", () => {
  test("Users page renders its action-button icons", async () => {
    localStorage.setItem("userRole", "FM");
    localStorage.setItem("userId", "1");
    mockAxios.get.mockResolvedValue({
      data: [{ id: 5, name: "Jane Tan", email: "jane@x.com", role: "Tenant", isActive: true, isEnrolled: false, createdAt: "2026-01-01" }],
    });
    const { container } = render(<MemoryRouter><Users /></MemoryRouter>);
    // Rendered in both the table and the card list — scope to the desktop table.
    await screen.findAllByText("Jane Tan");
    const actions = within(container.querySelector(".users-table")).getByLabelText("Actions for Jane Tan");
    // One SVG per action button (View Logs / Suspend / Delete).
    expect(actions.querySelectorAll("svg").length).toBe(3);
  });

  test("TenantManagement renders the pending-invite expiry clock icon", async () => {
    localStorage.setItem("userName", "FM One");
    mockAxios.get.mockResolvedValue({
      data: [{
        id: 1, code: "INVITE-AAAA1111", role: "Tenant", status: "PENDING", isUsed: false, isUsable: true,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt: new Date(Date.now() + 40 * 3600000).toISOString(),
      }],
    });
    render(<MemoryRouter><TenantManagement /></MemoryRouter>);
    await screen.findByText("INVITE-AAAA1111");
    const remaining = screen.getByText(/Valid for/).closest(".invite-expiry-remaining");
    expect(remaining.querySelector("svg")).toBeTruthy();
  });

  test("LiveConfusionMatrixPanel renders collapsed and expanded with the toggle icon", () => {
    localStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify([
      { id: "LM-1", actualLabel: "P01", predictedLabel: "P01", condition: "Front", source: "Live", origin: "Gate Scanner", timestamp: "2026-07-10T02:00:00.000Z" },
    ]));
    render(<MemoryRouter><LiveConfusionMatrixPanel origin="Gate Scanner" /></MemoryRouter>);

    const toggle = screen.getByRole("button", { name: /Facial Recognition Evaluation/ });
    expect(toggle.querySelector("svg")).toBeTruthy(); // collapsed by default (ExpandMore)
    fireEvent.click(toggle);
    expect(toggle.querySelector("svg")).toBeTruthy(); // expanded (ExpandLess)
    fireEvent.click(screen.getByRole("button", { name: "Advanced Matrix Details" }));
    expect(screen.getByTestId("live-matrix-gatescanner-table")).toBeTruthy();
  });

  test.each(["UNLOCK", "ALERT", "DENIED"])("SecurityLogIcon renders an SVG for the %s token", (token) => {
    const { container } = render(<SecurityLogIcon log={{ icon: token, type: "any", severity: "safe" }} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("SecurityLogIcon still falls back for historical emoji/mojibake icon values", () => {
    const { container } = render(
      <SecurityLogIcon log={{ icon: "ðŸ”“", type: "Gantry Access", severity: "safe" }} />
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  const mockCameraEnvironment = () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    });
  };

  test("GateScanner renders without invalid-element errors", async () => {
    mockCameraEnvironment();
    mockAxios.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><GateScanner /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    // The large decision card is gone; the kiosk HUD reports state instead.
    expect(screen.queryByText(/Awaiting scan/)).toBeNull();
    expect(screen.getByText(/TERMINAL STATE:/)).toBeTruthy();
  });

  test("VPatrol renders without invalid-element errors", async () => {
    mockCameraEnvironment();
    mockAxios.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><VPatrol /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Pi Gate Camera connected")).toBeTruthy());
    expect(screen.getByText("Security Timeline")).toBeTruthy();
  });
});
