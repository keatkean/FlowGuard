import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import Home from '../src/pages/Home';
import AIInnovation from '../src/pages/AIInnovation';
import SystemHealth from '../src/pages/SystemHealth';
import Contact from '../src/pages/Contact';

const renderPublic = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const forbiddenClaims = /128\+|PPE|Spill|pest|HVAC|temperature|humidity|99\.8|40%|70%|NexusCloud|OptiTemp|AeroNode|Sentinel Security|Available TOL 2027|Opening Soon/i;
const internalData = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|\\+65\\s?\\d{4}\\s?\\d{4}|192\\.168\\.|10\\.0\\.|SG[A-Z0-9]{6,}|faceVector|passwordResetTokenHash/i;

describe('public FlowGuard website PoC positioning', () => {
  test('homepage module and workflow cards render as four ordered public cards', () => {
    renderPublic(<Home />);

    const moduleCards = screen.getAllByTestId('module-card');
    expect(moduleCards).toHaveLength(4);
    expect(moduleCards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Facial Recognition & Access Management',
      'Object Detection & Space Management',
      'Smart Logistics & Loading-Bay Management',
      'AI Helpdesk & Incident Support'
    ]);

    const workflowSteps = screen.getAllByTestId('workflow-step');
    expect(workflowSteps).toHaveLength(4);
    expect(workflowSteps.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Configure',
      'Monitor',
      'Respond',
      'Review'
    ]);
  });

  test('homepage hero has one capabilities CTA while navbar keeps Client Login', () => {
    renderPublic(<Home />);

    const hero = within(screen.getByTestId('homepage-hero'));
    expect(hero.getByRole('link', { name: /Explore Capabilities/i })).toHaveAttribute('href', '/innovation');
    expect(hero.queryByRole('link', { name: /Client Login/i })).toBeNull();

    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: /Client Login/i })).toHaveAttribute('href', '/login');
  });

  test('homepage CSS defines four-two-one responsive grids for public cards', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/css/Home.css'), 'utf8');

    expect(css).toContain('.module-grid,');
    expect(css).toContain('.workflow-grid');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('@media (max-width: 1099px)');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('@media (max-width: 699px)');
    expect(css).toContain('grid-template-columns: 1fr;');
  });
  test('homepage shows academic PoC positioning, four real modules and no fake telemetry claims', () => {
    renderPublic(<Home />);

    expect(screen.getAllByText(/Academic Proof of Concept/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Facial Recognition & Access Management/i)).toBeInTheDocument();
    expect(screen.getByText(/Object Detection & Space Management/i)).toBeInTheDocument();
    expect(screen.getByText(/Smart Logistics & Loading-Bay Management/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Helpdesk & Incident Support/i)).toBeInTheDocument();
    expect(screen.getByText(/PoC Capability Snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/How FlowGuard Works/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Client Login/i }).some((link) => link.getAttribute('href') === '/login')).toBe(true);
    expect(document.body.textContent).not.toMatch(forbiddenClaims);
    expect(document.body.textContent).not.toMatch(/System Active|REAL-TIME FEED|Live Facility Telemetry|achieved|automation results/i);
    expect(document.body.textContent).not.toMatch(internalData);
  });

  test('innovation page shows actual AI-monitoring capabilities and illustrative labels', () => {
    renderPublic(<AIInnovation />);

    expect(screen.getByText(/FlowGuard AI Monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/Biometric Access Monitoring/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Object & Zone Monitoring/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Operational Response/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Illustrative PoC View/i).length).toBe(2);
    expect(document.body.textContent).not.toMatch(/PPE Compliant|Spill Detected|Production Line PPE|128\+/i);
  });

  test('system health route is a platform overview without fake uptime or diagnostics links', () => {
    renderPublic(<SystemHealth />);

    expect(screen.getByRole('heading', { name: /Platform Overview/i })).toBeInTheDocument();
    expect(screen.getByText(/Facial Recognition Service/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Smart Logistics/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/uptime|Offline|Error|N-0|99\.9|92\.4|View Diagnostics/i);
    expect(document.body.textContent).not.toMatch(forbiddenClaims);
  });

  test('contact form is visibly demo-only, does not log personal data, and does not show fake success', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderPublic(<Contact />);

    expect(screen.getByText(/Demo enquiry form - no message will be transmitted/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Enter your full name/i), { target: { value: 'Test Person' } });
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/Demo enquiry details/i), { target: { value: 'Hello' } });
    fireEvent.submit(screen.getByRole('button', { name: /Review Demo Notice/i }).closest('form'));

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Inquiry sent|sent to FlowGuard|Project HQ|flowguard\.support|Google Maps|7 Harrison/i);
    consoleSpy.mockRestore();
  });

  test('authenticated route definitions and private page imports remain present', () => {
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');

    ['/dashboard', '/enrollment', '/cameras', '/object-detection', '/vpatrol', '/gate-scanner', '/attendance', '/users', '/security-review', '/incidents', '/support-dashboard'].forEach((route) => {
      expect(appSource).toContain(`path="${route}"`);
    });
    expect(appSource).toContain('ProtectedRoute');
    expect(appSource).toContain('ACCESS.FM_ONLY');
  });
});
