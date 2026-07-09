// Source-mode behaviour of the Object Detection page:
// SecurePi hardware mode must never touch the browser webcam, and
// browser-camera teardown must stop every MediaStream track.
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import axios from 'axios';
import ObjectDetection from '../../src/pages/ObjectDetection';

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

const trackStop = vi.fn();
const getUserMedia = vi.fn();

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

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
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
