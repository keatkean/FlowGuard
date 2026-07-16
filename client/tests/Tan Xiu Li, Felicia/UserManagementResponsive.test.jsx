// Frontend tests — User Management renders TWO representations of the same
// filtered data: a desktop table (>=1025px) and a dedicated responsive card
// list (<=1024px, its own DOM — not a CSS table-to-card conversion). Both must
// carry every field + action, share one data fetch, and preserve FM access.
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import Users from '../../src/pages/Users';

const SAMPLE_USERS = [
  {
    id: 1,
    name: 'Jane Tan',
    // Long address to exercise overflow-wrap on the email value.
    email: 'jane.a.very.long.email.address@subdomain.company.example.com',
    role: 'Tenant',
    isActive: true,
    isEnrolled: true,
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'Bob Lee',
    email: 'bob@co.com',
    role: 'Staff',
    isActive: false,
    isEnrolled: false,
    createdAt: '2026-02-20T00:00:00Z',
  },
];

const renderUsers = () => render(<MemoryRouter><Users /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('userRole', 'FM');
  localStorage.setItem('userId', '999');
  localStorage.setItem('userName', 'Flow Manager');
  localStorage.setItem('accessToken', 'test-token');
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: SAMPLE_USERS });
});

describe('User Management — desktop table', () => {
  test('renders every column header', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelector('.users-table')).toBeTruthy());
    const headers = Array.from(document.querySelectorAll('.users-table thead th'))
      .map((th) => th.textContent.trim());
    ['Personnel', 'Role', 'Email', 'Status', 'Face ID', 'Joined', 'Actions']
      .forEach((label) => expect(headers).toContain(label));
  });

  test('table keeps every row action', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelectorAll('.users-table tbody tr').length).toBe(2));
    const firstRowActions = document.querySelector('.users-table tbody tr .action-button-group').textContent;
    expect(firstRowActions).toContain('View Logs');
    expect(firstRowActions).toContain('Suspend');
    expect(firstRowActions).toContain('Delete');
  });
});

describe('User Management — responsive card list', () => {
  test('renders one card per filtered user (same data as the table)', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelectorAll('.user-card').length).toBe(2));
    // Both representations are driven by the same filteredUsers list.
    expect(document.querySelectorAll('.users-table tbody tr').length)
      .toBe(document.querySelectorAll('.user-card').length);
  });

  test('each card shows name, role, email, status, Face ID and joined date', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelectorAll('.user-card').length).toBe(2));
    const [card1, card2] = document.querySelectorAll('.user-card');

    // Name + role + status live in the header; email/faceid/joined in the meta grid.
    expect(card1.querySelector('.user-card-name').textContent).toContain('Jane Tan');
    expect(card1.querySelector('.role-badge').textContent).toContain('Tenant');
    expect(card1.querySelector('.account-status-badge').textContent).toContain('Active');
    expect(card1.querySelector('.field-email .email-value').textContent)
      .toBe('jane.a.very.long.email.address@subdomain.company.example.com');

    const labels = Array.from(card1.querySelectorAll('.user-card-field dt')).map((dt) => dt.textContent);
    ['Email', 'Face ID', 'Joined'].forEach((l) => expect(labels).toContain(l));
    expect(card1.textContent).toContain('Enrolled');

    // Second (suspended, not enrolled) card reflects its own state.
    expect(card2.querySelector('.account-status-badge').textContent).toContain('Suspended');
    expect(card2.textContent).toContain('Not Enrolled');
  });

  test('each card keeps View Logs, Suspend/Reactivate and a destructive Delete', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelectorAll('.user-card').length).toBe(2));
    const [card1, card2] = document.querySelectorAll('.user-card');

    const actions1 = card1.querySelector('.user-card-footer .action-button-group').textContent;
    expect(actions1).toContain('View Logs');
    expect(actions1).toContain('Suspend');
    expect(actions1).toContain('Delete');
    expect(card1.querySelector('.user-card-footer .action-btn.action-danger')).toBeTruthy();

    // Suspended user offers Reactivate instead of Suspend.
    expect(card2.querySelector('.user-card-footer').textContent).toContain('Reactivate');
  });
});

describe('User Management — shared behaviour', () => {
  test('fetches user data exactly once (no per-representation duplicate fetch)', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelectorAll('.user-card').length).toBe(2));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('FM sees the Add Tenant control; summary + filters render', async () => {
    renderUsers();
    await waitFor(() => expect(document.querySelector('.user-summary-grid')).toBeTruthy());
    expect(document.body.textContent).toContain('Add Tenant');
    expect(document.querySelector('.user-filter-bar input[name="query"]')).toBeTruthy();
    expect(document.querySelector('.user-filter-bar select[name="role"]')).toBeTruthy();
    expect(document.querySelector('.user-filter-bar select[name="status"]')).toBeTruthy();
    expect(document.querySelector('.user-filter-bar select[name="faceId"]')).toBeTruthy();
    expect(document.querySelectorAll('.user-summary-grid > div').length).toBe(4);
  });

  test('non-FM roles do not see the Add Tenant control', async () => {
    localStorage.setItem('userRole', 'Tenant');
    renderUsers();
    await waitFor(() => expect(document.querySelectorAll('.user-card').length).toBe(2));
    expect(document.body.textContent).not.toContain('Add Tenant');
  });
});
