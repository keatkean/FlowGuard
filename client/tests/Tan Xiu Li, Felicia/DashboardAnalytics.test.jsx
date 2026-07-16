// Frontend tests — FM dashboard operational analytics panels (7-day trend + top zones).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mockGet } }));

import Dashboard from '../../src/pages/Dashboard';

const SEVEN_DAYS = [
  { date: '2026-07-08', label: '8 Jul', high: 2, critical: 1 },
  { date: '2026-07-09', label: '9 Jul', high: 0, critical: 0 },
  { date: '2026-07-10', label: '10 Jul', high: 1, critical: 0 },
  { date: '2026-07-11', label: '11 Jul', high: 0, critical: 0 },
  { date: '2026-07-12', label: '12 Jul', high: 3, critical: 2 },
  { date: '2026-07-13', label: '13 Jul', high: 0, critical: 0 },
  { date: '2026-07-14', label: '14 Jul', high: 0, critical: 1 }
];

const SAMPLE = {
  alertTrend7Days: SEVEN_DAYS,
  topAlertZones7Days: [
    { zone: 'Loading Bay', count: 7 },
    { zone: 'Cold Store', count: 3 }
  ]
};

const fmResponse = (analytics) => ({
  role: 'FM',
  summary: {
    cameras: { total: 1, online: 1, offline: 0 },
    attendance: { peopleCurrentlyOnSite: 0 },
    urgentDetectionAlerts: 0,
    todaysLoadingBayBookings: 0,
    activeOrArrivedVehicles: 0,
    openIncidents: 0,
    openSupportTickets: 0
  },
  recentHighPriorityAlerts: [],
  analytics
});

const mountFM = (analytics) => {
  localStorage.setItem('accessToken', 't');
  localStorage.setItem('userRole', 'FM');
  localStorage.setItem('userName', 'FM User');
  mockGet.mockImplementation((url) => {
    if (url.includes('/api/dashboard/summary')) return Promise.resolve({ data: fmResponse(analytics) });
    if (url.includes('/api/detection-alerts')) return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
};

beforeEach(() => { mockGet.mockReset(); localStorage.clear(); });

describe('FM dashboard analytics panels', () => {
  test('renders both analytics headings and database-backed values', async () => {
    mountFM(SAMPLE);
    expect(await screen.findByText('Seven-Day Alert Trend')).toBeTruthy();
    expect(screen.getByText('Top Alert Zones')).toBeTruthy();
    // Zone name + exact count from the API (aria-label makes the count unambiguous).
    expect(screen.getByText('Loading Bay')).toBeTruthy();
    expect(screen.getByLabelText('Loading Bay: 7 alerts')).toBeTruthy();
    expect(screen.getByLabelText('Cold Store: 3 alerts')).toBeTruthy();
    // Trend day labels render (label appears in the visual chart + the sr-only table).
    expect(screen.getAllByText('8 Jul').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12 Jul').length).toBeGreaterThan(0);
  });

  test('shows empty states without crashing when analytics are zero/empty', async () => {
    mountFM({
      alertTrend7Days: SEVEN_DAYS.map((d) => ({ ...d, high: 0, critical: 0 })),
      topAlertZones7Days: []
    });
    expect(await screen.findByText(/No high or critical alerts recorded/i)).toBeTruthy();
    expect(screen.getByText(/No detection-alert history/i)).toBeTruthy();
  });

  test('does not crash when analytics key is absent from the response', async () => {
    mountFM(undefined);
    // Panels still render their headings + empty states rather than throwing.
    expect(await screen.findByText('Seven-Day Alert Trend')).toBeTruthy();
    expect(screen.getByText('Top Alert Zones')).toBeTruthy();
  });

  test('preserves the existing summary cards and alerts section', async () => {
    mountFM(SAMPLE);
    expect(await screen.findByText('Total Cameras')).toBeTruthy();
    expect(screen.getByText('Recent High-Priority Operational Alerts')).toBeTruthy();
  });
});

describe('analytics are FM-only', () => {
  test('Tenant dashboard renders no organisation-wide analytics panels', async () => {
    localStorage.setItem('accessToken', 't');
    localStorage.setItem('userRole', 'Tenant');
    localStorage.setItem('userName', 'Tenant User');
    mockGet.mockImplementation((url) => {
      if (url.includes('/api/dashboard/summary')) {
        return Promise.resolve({ data: {
          role: 'Tenant',
          summary: { staffTotal: 1, staffCurrentlyOnSite: 0, staffLateToday: 0, todaysOwnBookings: 0, ownOpenSupportCases: 0 },
          nextBooking: null,
          recentActivity: []
        } });
      }
      return Promise.resolve({ data: [] });
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Tenant Dashboard')).toBeTruthy();
    expect(screen.queryByText('Seven-Day Alert Trend')).toBeNull();
    expect(screen.queryByText('Top Alert Zones')).toBeNull();
  });
});
