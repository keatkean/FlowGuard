import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mockGet } }));

import Attendance from '../../src/pages/Attendance';

const responses = {
  FM: { role: 'FM', summary: { peopleOnSite: 3, checkedInToday: 8, checkedOutToday: 5 } },
  Tenant: {
    role: 'Tenant',
    summary: { staffOnSite: 2, onTimeToday: 4, lateToday: 1 },
    records: [{ userId: 10, user: { name: 'Linked Staff', role: 'Staff' }, date: '2026-07-10', firstCheckIn: '2026-07-10T00:30:00.000Z', latestCheckOut: '2026-07-10T09:00:00.000Z', currentStatus: 'OUT', punctuality: 'ON_TIME' }]
  },
  Staff: {
    role: 'Staff',
    summary: { currentStatus: 'IN', firstCheckIn: '2026-07-10T00:30:00.000Z', latestCheckOut: null, punctuality: 'ON_TIME' },
    records: [{ userId: 60, user: { name: 'Me', role: 'Staff' }, date: '2026-07-10', firstCheckIn: '2026-07-10T00:30:00.000Z', latestCheckOut: null, currentStatus: 'IN', punctuality: 'ON_TIME' }]
  }
};

const renderAs = async (role) => {
  localStorage.setItem('accessToken', 'test-token');
  localStorage.setItem('userRole', role);
  mockGet.mockResolvedValueOnce({ data: responses[role] });
  render(<MemoryRouter><Attendance /></MemoryRouter>);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
};

beforeEach(() => { mockGet.mockReset(); localStorage.clear(); });

describe('Daily Attendance - Phase 2 role-aware summaries', () => {
  test('FM sees aggregate operational cards only', async () => {
    await renderAs('FM');
    expect(await screen.findByText('Workforce Attendance Management')).toBeTruthy();
    expect(screen.getByText('People On Site')).toBeTruthy();
    expect(screen.getByText('Checked In Today')).toBeTruthy();
    expect(screen.getByText('Checked Out Today')).toBeTruthy();
    expect(screen.getByText(/Individual late-arrival performance/i)).toBeTruthy();
    expect(screen.queryByText('Late Exceptions')).toBeNull();
  });

  test('Tenant sees own-Staff cards and detailed linked Staff table', async () => {
    await renderAs('Tenant');
    expect(await screen.findByText('Unit Staff Attendance')).toBeTruthy();
    expect(screen.getByText('Staff On Site')).toBeTruthy();
    expect(screen.getByText('Late Exceptions')).toBeTruthy();
    expect(screen.getByText('Linked Staff')).toBeTruthy();
  });

  test('Staff sees personal status and own history only', async () => {
    await renderAs('Staff');
    expect(await screen.findByText('My Attendance')).toBeTruthy();
    expect(screen.getByText('Current Status')).toBeTruthy();
    expect(screen.getByText('First Check-In')).toBeTruthy();
    expect(screen.getByText('Latest Check-Out')).toBeTruthy();
    expect(screen.queryByText('Staff On Site')).toBeNull();
  });

  test('calls the role-aware logs API with a date filter', async () => {
    await renderAs('Staff');
    expect(mockGet).toHaveBeenCalledWith('/api/attendance/logs', expect.objectContaining({ params: { filter: 'today' } }));
  });
});