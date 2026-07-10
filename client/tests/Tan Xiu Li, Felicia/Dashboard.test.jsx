import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mockGet } }));

import Dashboard from '../../src/pages/Dashboard';

const responses = {
  FM: {
    role: 'FM',
    summary: {
      cameras: { total: 3, online: 2, offline: 1 },
      attendance: { peopleCurrentlyOnSite: 5, checkedInToday: 8, checkedOutToday: 4 },
      urgentDetectionAlerts: 2,
      todaysLoadingBayBookings: 6,
      activeOrArrivedVehicles: 1,
      openIncidents: 3,
      openSupportTickets: 7
    },
    recentHighPriorityAlerts: []
  },
  Tenant: {
    role: 'Tenant',
    summary: { staffTotal: 9, staffCurrentlyOnSite: 4, staffLateToday: 1, todaysOwnBookings: 2, ownOpenSupportCases: 1 },
    nextBooking: { booking_ref: 'BK-1', loading_bay: 'Bay 2', slot_start: '2026-07-10T04:00:00.000Z' },
    recentActivity: [{ id: 1, booking_ref: 'BK-0', status: 'Confirmed' }]
  },
  Staff: {
    role: 'Staff',
    summary: { currentClockStatus: 'IN', todayFirstClockIn: '2026-07-10T00:30:00.000Z', todayLatestClockOut: null, punctuality: 'ON_TIME', faceIdEnrolled: true },
    nextRelevantBooking: null,
    unavailable: { nextRelevantBooking: 'No staff-to-booking ownership link exists in the current schema.' },
    quickLinks: [{ label: 'My Attendance', to: '/attendance' }, { label: 'Logistics', to: '/logistics' }]
  }
};

const renderRole = async (role) => {
  localStorage.setItem('accessToken', 'token');
  localStorage.setItem('userRole', role);
  localStorage.setItem('userName', 'Test User');
  mockGet.mockResolvedValueOnce({ data: responses[role] });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
};

beforeEach(() => { mockGet.mockReset(); localStorage.clear(); });

describe('Dashboard - Phase 2 role-aware variants', () => {
  test('renders FM dashboard variant without individual late-performance cards', async () => {
    await renderRole('FM');
    expect(await screen.findByText('Operations Dashboard')).toBeTruthy();
    expect(screen.getByText('Total Cameras')).toBeTruthy();
    expect(screen.getByText('Urgent Alerts')).toBeTruthy();
    expect(screen.queryByText(/Late Exceptions/i)).toBeNull();
  });

  test('renders Tenant dashboard variant with own-unit cards', async () => {
    await renderRole('Tenant');
    expect(await screen.findByText('Tenant Dashboard')).toBeTruthy();
    expect(screen.getByText('Own Staff Total')).toBeTruthy();
    expect(screen.getByText('Own Staff Late Today')).toBeTruthy();
    expect(screen.getByText(/BK-1/)).toBeTruthy();
  });

  test('renders Staff dashboard variant and not Tenant-only cards', async () => {
    await renderRole('Staff');
    expect(await screen.findByText('Staff Dashboard')).toBeTruthy();
    expect(screen.getByText('Current Status')).toBeTruthy();
    expect(screen.getByText('Face ID')).toBeTruthy();
    expect(screen.queryByText('Own Staff Total')).toBeNull();
    expect(screen.queryByText('Own Staff Late Today')).toBeNull();
  });

  test('shows loading state', () => {
    mockGet.mockReturnValueOnce(new Promise(() => {}));
    localStorage.setItem('userRole', 'FM');
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText(/Loading dashboard summary/i)).toBeTruthy();
  });

  test('shows controlled error state', async () => {
    mockGet.mockRejectedValueOnce({ response: { data: { error: 'No dashboard today.' } } });
    localStorage.setItem('userRole', 'FM');
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toContain('No dashboard today.');
  });

  test('does not render legacy hardcoded figures', async () => {
    await renderRole('FM');
    expect(screen.queryByText('128')).toBeNull();
    expect(screen.queryByText('8,954')).toBeNull();
  });
});