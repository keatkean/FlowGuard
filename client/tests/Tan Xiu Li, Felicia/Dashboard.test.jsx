import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mockGet } }));

import Dashboard from '../../src/pages/Dashboard';
import { resolveIconComponent } from '../../src/utils/iconInterop';

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

// URL-aware axios mock: the Dashboard performs two GETs (summary and, for FM,
// detection alerts), so order-based mockResolvedValueOnce would leave the
// second call returning undefined. Handlers are functions so a test can swap
// them mid-flight (e.g. the retry test).
const mockApi = ({ summary, detectionAlerts } = {}) => {
  mockGet.mockImplementation((url) => {
    if (url.includes('/api/dashboard/summary')) {
      return summary ? summary() : Promise.resolve({ data: responses.FM });
    }
    if (url.includes('/api/detection-alerts')) {
      return detectionAlerts ? detectionAlerts() : Promise.resolve({ data: [] });
    }
    return Promise.reject(new Error(`Unexpected GET request: ${url}`));
  });
};

const renderRole = async (role) => {
  localStorage.setItem('accessToken', 'token');
  localStorage.setItem('userRole', role);
  localStorage.setItem('userName', 'Test User');
  mockApi({ summary: () => Promise.resolve({ data: responses[role] }) });
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
    mockApi({ summary: () => new Promise(() => {}) });
    localStorage.setItem('userRole', 'FM');
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText(/Loading dashboard summary/i)).toBeTruthy();
  });

  test('shows controlled error state', async () => {
    mockApi({ summary: () => Promise.reject({ response: { data: { error: 'No dashboard today.' } } }) });
    localStorage.setItem('userRole', 'FM');
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toContain('No dashboard today.');
  });

  test('does not render legacy hardcoded figures', async () => {
    await renderRole('FM');
    expect(screen.queryByText('128')).toBeNull();
    expect(screen.queryByText('8,954')).toBeNull();
  });

  test('FM dashboard surfaces an urgent detection alert alongside summary cards', async () => {
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('userRole', 'FM');
    localStorage.setItem('userName', 'Test User');
    mockApi({
      detectionAlerts: () => Promise.resolve({
        data: [{
          id: 1,
          status: 'Active',
          alert_type: 'unattended_object',
          object_class: 'pallet',
          zone_name: 'Zone A',
          camera_location: 'Loading Bay 1'
        }]
      })
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('Unattended pallet/object alert')).toBeTruthy();
    expect(screen.getByText('Total Cameras')).toBeTruthy();
  });
});

describe('Dashboard - real MUI summary-card icons', () => {
  const PSEUDO_ICONS = ['OWN', 'STA', 'TOD', 'CUR', 'FIR', 'LAT', 'PUN', 'FAC', 'PEO'];

  test.each(['FM', 'Tenant', 'Staff'])('%s dashboard has no three-letter pseudo-icons and renders real icons', async (role) => {
    await renderRole(role);
    const wrappers = [...document.querySelectorAll('.icon-wrapper')];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const wrapper of wrappers) {
      // Real MUI SVG icon, aria-hidden because the visible label carries meaning.
      expect(wrapper.querySelector('svg')).toBeTruthy();
      expect(PSEUDO_ICONS).not.toContain(wrapper.textContent.trim());
      expect(wrapper.textContent.trim()).toBe('');
    }
    for (const pseudo of PSEUDO_ICONS) {
      expect(screen.queryByText(pseudo)).toBeNull();
    }
  });

  test('cards keep their complete readable labels alongside the icons', async () => {
    await renderRole('FM');
    ['Total Cameras', 'Cameras Online', 'Cameras Offline', 'People On Site', 'Urgent Alerts'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  test('null metric values render as Unavailable instead of crashing', async () => {
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('userRole', 'FM');
    mockApi({
      summary: () => Promise.resolve({
        data: { role: 'FM', summary: { cameras: {}, attendance: {} }, recentHighPriorityAlerts: [] }
      })
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
  });

  test.each(['FM', 'Tenant', 'Staff'])('%s dashboard renders without invalid-element-type or object-as-component errors', async (role) => {
    const errorSpy = vi.spyOn(console, 'error');
    try {
      await renderRole(role);
      // Cards actually rendered (SummaryCard mounted with real icons).
      expect(document.querySelectorAll('.summary-card').length).toBeGreaterThan(0);
      const messages = errorSpy.mock.calls.map((call) => call.map(String).join(' '));
      const invalid = messages.filter((m) =>
        /Element type is invalid|got: object|Objects are not valid as a React child|object.*React component/i.test(m)
      );
      expect(invalid).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('interop guard unwraps a CJS module-shaped icon reference (dev-server regression)', () => {
    // Simulate what the Vite dev server can deliver for the no-"exports"-map
    // @mui/icons-material deep files: { __esModule: true, default: Component }.
    const Component = () => null;
    const memoLike = { $$typeof: Symbol.for('react.memo'), type: Component };
    expect(resolveIconComponent({ __esModule: true, default: Component })).toBe(Component);
    // Real MUI icons are React.memo objects (they carry $$typeof) — untouched.
    expect(resolveIconComponent(memoLike)).toBe(memoLike);
    expect(resolveIconComponent(Component)).toBe(Component);
    expect(resolveIconComponent(undefined)).toBeNull();
  });

  test('every rendered icon wrapper holds a real SVG, never a module object', async () => {
    await renderRole('FM');
    const wrappers = [...document.querySelectorAll('.icon-wrapper')];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const wrapper of wrappers) {
      expect(wrapper.querySelector('svg')).toBeTruthy();
    }
  });

  test('network failure shows an in-page Retry state, not the global 500 boundary', async () => {
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('userRole', 'FM');
    let summaryHandler = () => Promise.reject(new Error('Network Error'));
    mockApi({ summary: () => summaryHandler() });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Unable to load dashboard summary/i);
    const retry = screen.getByRole('button', { name: 'Retry' });

    summaryHandler = () => Promise.resolve({ data: responses.FM });
    retry.click();
    expect(await screen.findByText('Total Cameras')).toBeTruthy();
  });
});