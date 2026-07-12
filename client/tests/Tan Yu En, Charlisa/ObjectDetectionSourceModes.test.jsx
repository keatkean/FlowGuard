// Source-mode behaviour of the Object Detection page:
// SecurePi hardware mode must never touch the browser webcam, and
// browser-camera teardown must stop every MediaStream track.
//
// ObjectDetection.jsx reads VITE_SECUREPI_STREAM_URL/VITE_SECUREPI_HEALTH_URL into a
// top-level const at module-eval time, so these tests must NOT depend on whatever the
// developer's local client/.env happens to set. Each test explicitly stubs the env
// (vi.stubEnv) it needs BEFORE the module is (re-)imported — vi.resetModules() plus a
// dynamic import forces ObjectDetection.jsx (and its `import axios from 'axios'`) to
// re-evaluate against the freshly-stubbed env, and axios/ObjectDetection are re-bound
// together so the test's mock setup and the component always share the same instance.
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

vi.mock('axios');
vi.mock('../../src/components/Sidebar', () => ({ default: () => null }));

const SECUREPI_CAMERA = {
  id: 1,
  camera_code: 'CAM-SECUREPI-01',
  camera_name: 'SecurePi IMX500',
  location: 'Loading Bay',
  stream_url: 'http://172.20.10.2:8001/video_feed',
  status: 'Online',
};

const MP4_CAMERA = {
  id: 2,
  camera_code: 'CAM-01',
  camera_name: 'Loading Bay Demo',
  location: 'Loading Bay',
  stream_url: '/videos/loading.mp4',
  status: 'Online',
};

// No stream_url at all — only a VITE_SECUREPI_STREAM_URL env fallback can resolve this one.
const NO_STREAM_CAMERA = {
  id: 3,
  camera_code: 'CAM-03',
  camera_name: 'Unwired Dock Camera',
  location: 'Dock 2',
  stream_url: null,
  status: 'Online',
};

const trackStop = vi.fn();
const getUserMedia = vi.fn();

let axios;
let ObjectDetection;

// Re-evaluates ObjectDetection.jsx (and axios) against whatever env is currently
// stubbed. Must run AFTER vi.stubEnv/vi.unstubAllEnvs for the stub to take effect.
const loadObjectDetection = async () => {
  vi.resetModules();
  axios = (await import('axios')).default;
  ({ default: ObjectDetection } = await import('../../src/pages/ObjectDetection'));
};

const mockBackend = (cameras) => {
  axios.get.mockImplementation((url) => {
    if (url === '/api/zones') return Promise.resolve({ data: [] });
    if (url === '/api/cameras') return Promise.resolve({ data: cameras });
    if (url === '/api/detection-alerts') return Promise.resolve({ data: [] });
    if (url === '/ai/api/yolo/people-count') return Promise.resolve({ data: { count: 0, detection_active: false } });
    if (url.endsWith('/health')) return Promise.resolve({ data: { status: 'ok' } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  axios.post.mockResolvedValue({ data: { detections: [], count: 0 } });
};

const renderPage = () => render(<MemoryRouter><ObjectDetection /></MemoryRouter>);

const healthCalls = () => axios.get.mock.calls.filter(([url]) => url.endsWith('/health'));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Deterministic baseline for every test: no SecurePi env fallback configured,
  // regardless of what client/.env sets on the developer's machine. Tests that need a
  // fallback explicitly vi.stubEnv + reload (see 'falls back to VITE_SECUREPI_STREAM_URL...').
  vi.stubEnv('VITE_SECUREPI_STREAM_URL', '');
  vi.stubEnv('VITE_SECUREPI_HEALTH_URL', '');
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  await loadObjectDetection();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SecurePi Hardware mode', () => {
  test('uses the selected inventory HTTP stream in an <img> and never calls getUserMedia', async () => {
    mockBackend([SECUREPI_CAMERA]);
    renderPage();

    await screen.findByRole('option', { name: /CAM-SECUREPI-01/ });
    getUserMedia.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));

    const img = await screen.findByAltText('SecurePi live hardware camera');
    // No cache-busting query before Reconnect is clicked.
    expect(img).toHaveAttribute('src', 'http://172.20.10.2:8001/video_feed');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
  });

  test('starts health polling on the derived /health URL only in hardware mode', async () => {
    mockBackend([SECUREPI_CAMERA]);
    renderPage();

    await screen.findByRole('option', { name: /CAM-SECUREPI-01/ });
    expect(healthCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));

    await waitFor(() => expect(healthCalls().length).toBeGreaterThan(0));
    expect(healthCalls()[0][0]).toBe('http://172.20.10.2:8001/health');
  });

  test('treats local MP4 inventory paths as not configured (no VITE fallback set)', async () => {
    mockBackend([MP4_CAMERA]);
    renderPage();

    await screen.findByRole('option', { name: /CAM-01/ });
    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));

    expect(await screen.findByText(/SecurePi stream not configured/)).toBeTruthy();
    expect(screen.queryByAltText('SecurePi live hardware camera')).toBeNull();
    expect(healthCalls()).toHaveLength(0);
  });

  test('falls back to VITE_SECUREPI_STREAM_URL when the selected camera has no stream_url of its own', async () => {
    vi.stubEnv('VITE_SECUREPI_STREAM_URL', 'http://test-securepi:9000/video_feed');
    vi.stubEnv('VITE_SECUREPI_HEALTH_URL', 'http://test-securepi:9000/health');
    await loadObjectDetection();
    mockBackend([NO_STREAM_CAMERA]);
    renderPage();

    await screen.findByRole('option', { name: /CAM-03/ });
    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));

    const img = await screen.findByAltText('SecurePi live hardware camera');
    expect(img).toHaveAttribute('src', 'http://test-securepi:9000/video_feed');
    await waitFor(() => expect(healthCalls().length).toBeGreaterThan(0));
    expect(healthCalls()[0][0]).toBe('http://test-securepi:9000/health');
  });

  test('manual reconnect appends a cache-busting query to the stream URL', async () => {
    mockBackend([SECUREPI_CAMERA]);
    renderPage();

    await screen.findByRole('option', { name: /CAM-SECUREPI-01/ });
    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));

    const img = await screen.findByAltText('SecurePi live hardware camera');
    fireEvent.error(img); // simulate the MJPEG stream dropping

    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect SecurePi' }));

    const reconnected = await screen.findByAltText('SecurePi live hardware camera');
    expect(reconnected).toHaveAttribute('src', 'http://172.20.10.2:8001/video_feed?t=1');
  });
});

describe('Browser Camera mode', () => {
  test('acquires the webcam by default and stops all tracks when switching to hardware', async () => {
    mockBackend([SECUREPI_CAMERA]);
    renderPage();

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(trackStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));

    await waitFor(() => expect(trackStop).toHaveBeenCalled());
    // Switching to hardware must not reacquire the webcam.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  test('remains available after visiting hardware mode', async () => {
    mockBackend([SECUREPI_CAMERA]);
    renderPage();

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));
    await screen.findByAltText('SecurePi live hardware camera');

    fireEvent.click(screen.getByRole('button', { name: 'Browser Camera' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(document.querySelector('video')).not.toBeNull();
  });

  test('upload video control stays present in every mode', async () => {
    mockBackend([SECUREPI_CAMERA]);
    renderPage();

    await screen.findByRole('option', { name: /CAM-SECUREPI-01/ });
    expect(screen.getByText('Upload Video')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'SecurePi Hardware' }));
    expect(screen.getByText('Upload Video')).toBeTruthy();
  });
});
