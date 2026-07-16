// Frontend tests — Attendance toolbar still exposes the date filter, Refresh and
// (FM-only) Launch Gate Terminal, and the FM privacy model is unchanged: FMs see
// the aggregate occupancy note only, never an individual attendance/lateness table.
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mockGet } }));

import Attendance from '../../src/pages/Attendance';

const FM_DATA = {
  role: 'FM',
  summary: { peopleOnSite: 12, checkedInToday: 8, checkedOutToday: 3 },
  records: [],
};

const TENANT_DATA = {
  role: 'Tenant',
  summary: { staffOnSite: 4, onTimeToday: 3, lateToday: 1 },
  records: [
    {
      userId: 5,
      date: '2026-07-15',
      user: { name: 'Sam Ng' },
      firstCheckIn: '2026-07-15T01:00:00Z',
      latestCheckOut: null,
      currentStatus: 'IN',
      punctuality: 'ON_TIME',
    },
  ],
};

const renderAttendance = () => render(<MemoryRouter><Attendance /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('accessToken', 'test-token');
  localStorage.setItem('userName', 'Flow Manager');
  mockGet.mockReset();
});

describe('Attendance toolbar (FM)', () => {
  beforeEach(() => {
    localStorage.setItem('userRole', 'FM');
    mockGet.mockResolvedValue({ data: FM_DATA });
  });

  test('exposes the date filter, Refresh and Launch Gate Terminal controls', async () => {
    renderAttendance();
    await waitFor(() => expect(document.querySelector('.attendance-actions')).toBeTruthy());

    const actions = document.querySelector('.attendance-actions');
    expect(actions.querySelector('select[aria-label="Attendance date filter"]')).toBeTruthy();

    const buttons = Array.from(actions.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).toContain('Refresh');
    expect(buttons).toContain('Launch Gate Terminal');
  });

  test('FM privacy preserved: aggregate note only, no individual attendance table', async () => {
    renderAttendance();
    await waitFor(() => expect(document.body.textContent).toContain('Aggregate Operational View'));

    // No per-person table, and no individual punctuality/lateness columns for FM.
    expect(document.querySelector('.management-table')).toBeNull();
    expect(document.body.textContent).not.toContain('PUNCTUALITY');
  });
});

describe('Attendance toolbar (Tenant)', () => {
  beforeEach(() => {
    localStorage.setItem('userRole', 'Tenant');
    mockGet.mockResolvedValue({ data: TENANT_DATA });
  });

  test('keeps filter + Refresh, and Launch Gate Terminal stays FM-only', async () => {
    renderAttendance();
    await waitFor(() => expect(document.querySelector('.attendance-actions')).toBeTruthy());

    const actions = document.querySelector('.attendance-actions');
    expect(actions.querySelector('select[aria-label="Attendance date filter"]')).toBeTruthy();
    const buttons = Array.from(actions.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).toContain('Refresh');
    expect(buttons).not.toContain('Launch Gate Terminal');
  });

  test('non-FM roles still see their attendance table', async () => {
    renderAttendance();
    await waitFor(() => expect(document.querySelector('.management-table')).toBeTruthy());
    expect(document.body.textContent).toContain('Sam Ng');
  });
});
