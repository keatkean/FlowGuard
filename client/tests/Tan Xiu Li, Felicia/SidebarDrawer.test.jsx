// Frontend tests — mobile sidebar drawer open/close behaviour, Escape, scroll-lock.
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, test, expect, beforeEach } from 'vitest';

import Sidebar from '../../src/components/Sidebar';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('userName', 'Flow Manager');
  localStorage.setItem('userRole', 'FM');
  document.body.style.overflow = '';
});

const PathProbe = () => {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
};

describe('Sidebar mobile drawer', () => {
  test('hamburger opens the drawer and locks body scroll; close button reverts both', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(document.querySelector('.sidebar.open')).toBeNull();

    fireEvent.click(document.querySelector('.mobile-menu-btn'));
    expect(document.querySelector('.sidebar.open')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(document.querySelector('.close-sidebar-btn'));
    expect(document.querySelector('.sidebar.open')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  test('Escape key closes the open drawer and unlocks body scroll', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(document.querySelector('.mobile-menu-btn'));
    expect(document.querySelector('.sidebar.open')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.sidebar.open')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  test('clicking the overlay closes the drawer', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(document.querySelector('.mobile-menu-btn'));
    const overlay = document.querySelector('.sidebar-overlay');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay);
    expect(document.querySelector('.sidebar.open')).toBeNull();
  });

  test('selecting a navigation link closes the drawer and navigates', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
        <Routes><Route path="*" element={<PathProbe />} /></Routes>
      </MemoryRouter>
    );
    fireEvent.click(document.querySelector('.mobile-menu-btn'));
    expect(document.querySelector('.sidebar.open')).toBeTruthy();

    fireEvent.click(document.querySelector('.sidebar-nav a[href="/cameras"]'));
    expect(document.querySelector('.sidebar.open')).toBeNull();
    expect(document.querySelector('[data-testid="path"]').textContent).toBe('/cameras');
  });

  test('the logged-in user and Log Out control remain present in the drawer', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(document.querySelector('.mobile-menu-btn'));
    expect(document.querySelector('.sidebar-bottom .user-name').textContent).toBe('Flow Manager');
    expect(document.querySelector('.logout-btn')).toBeTruthy();
  });
});
