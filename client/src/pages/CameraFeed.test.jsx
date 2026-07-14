import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import CameraFeed from './CameraFeed';

vi.mock('axios');

describe('CameraFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    axios.post.mockResolvedValue({ data: { detections: [] } });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
    }));
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,fake');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders an <img> for an HTTP /video_feed hardware source', () => {
    render(<CameraFeed cam={{ id: 'CAM-SECUREPI-01', video: 'http://192.168.1.50:8001/video_feed' }} />);

    const img = screen.getByRole('img', { name: 'CAM-SECUREPI-01 live stream' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'http://192.168.1.50:8001/video_feed');
    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('renders a <video> for a local .mp4 source', () => {
    const { container } = render(<CameraFeed cam={{ id: 'CAM-01', video: '/videos/loading.mp4' }} />);

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', '/videos/loading.mp4');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('does not call the YOLO analyze-frame endpoint for hardware MJPEG streams', async () => {
    render(<CameraFeed cam={{ id: 'CAM-SECUREPI-01', video: 'http://192.168.1.50:8001/video_feed' }} />);

    await vi.advanceTimersByTimeAsync(6000);

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('retains analyze-frame behaviour for local mp4 sources', async () => {
    const { container } = render(<CameraFeed cam={{ id: 'CAM-01', video: '/videos/loading.mp4' }} />);

    const video = container.querySelector('video');
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    await vi.advanceTimersByTimeAsync(2000);

    expect(axios.post).toHaveBeenCalledWith(
      '/ai/api/yolo/analyze-frame',
      expect.objectContaining({ cam_id: 'CAM-01' })
    );
  });
});
