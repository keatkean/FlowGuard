// Frontend tests — Smart Logistics and Driver Pass use the ONE shared API base
// (VITE_API_BASE_URL): blank locally (Vite proxy), a deployed Node URL on Vercel.
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("react-qr-code", () => ({ default: ({ value }) => <div data-testid="qr-code" /> }));

const mockAxios = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
vi.mock("axios", () => ({ default: mockAxios }));

const DEPLOYED_BASE = "https://flowguard-api.example.com";

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete global.fetch;
});

describe("Shared API base (VITE_API_BASE_URL)", () => {
  test("api constant is blank locally and uses the env value when deployed", async () => {
    vi.stubEnv("VITE_API_BASE_URL", DEPLOYED_BASE);
    const { API_BASE_URL } = await import("../../src/constants/api");
    expect(API_BASE_URL).toBe(DEPLOYED_BASE);
  });

  test("Smart Logistics bookings request uses the shared API base", async () => {
    vi.stubEnv("VITE_API_BASE_URL", DEPLOYED_BASE);
    mockAxios.get.mockResolvedValue({ data: [] });

    const { default: TenantLogistics } = await import("../../src/pages/TenantLogistics");
    render(<TenantLogistics />);

    await waitFor(() => expect(mockAxios.get).toHaveBeenCalled());
    expect(mockAxios.get).toHaveBeenCalledWith(
      `${DEPLOYED_BASE}/api/bookings/`,
      expect.any(Object)
    );
  });

  test("Driver Pass (public route) fetches through the deployed API base", async () => {
    vi.stubEnv("VITE_API_BASE_URL", DEPLOYED_BASE);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        booking_ref: "FG-DEPLOY1", transport_company: "NinjaVan", license_plate: "GBG 1234M",
        loading_bay: "Bay A", status: "Confirmed",
      }),
    });

    const { default: DriverPass } = await import("../../src/pages/DriverPass");
    render(
      <MemoryRouter initialEntries={["/driver-pass/FG-DEPLOY1"]}>
        <Routes>
          <Route path="/driver-pass/:ref" element={<DriverPass />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("FG-DEPLOY1")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith(`${DEPLOYED_BASE}/api/bookings/FG-DEPLOY1`);
  });

  test("blank base URL keeps local relative paths (Vite proxy)", async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    const { default: TenantLogistics } = await import("../../src/pages/TenantLogistics");
    render(<TenantLogistics />);

    await waitFor(() => expect(mockAxios.get).toHaveBeenCalled());
    expect(mockAxios.get).toHaveBeenCalledWith("/api/bookings/", expect.any(Object));
  });
});
