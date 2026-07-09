import { describe, expect, test } from 'vitest';
import { getHardwareStreamUrl, getHardwareHealthUrl, isHttpUrl } from '../../src/utils/securepiStream';

describe('getHardwareStreamUrl', () => {
  test('uses the selected camera inventory HTTP stream_url first', () => {
    const camera = { stream_url: 'http://172.20.10.2:8001/video_feed' };
    expect(getHardwareStreamUrl(camera, 'http://fallback:8001/video_feed'))
      .toBe('http://172.20.10.2:8001/video_feed');
  });

  test('falls back to VITE env URL only when inventory URL is unavailable', () => {
    expect(getHardwareStreamUrl(null, 'http://fallback:8001/video_feed'))
      .toBe('http://fallback:8001/video_feed');
    expect(getHardwareStreamUrl({ stream_url: null }, 'http://fallback:8001/video_feed'))
      .toBe('http://fallback:8001/video_feed');
  });

  test('does not treat local demo videos or MP4 paths as hardware streams', () => {
    expect(getHardwareStreamUrl({ stream_url: '/videos/loading.mp4' }, ''))
      .toBe('');
    expect(getHardwareStreamUrl({ stream_url: '/videos/loading.mp4' }, 'http://fallback:8001/video_feed'))
      .toBe('http://fallback:8001/video_feed');
  });

  test('returns empty string when nothing is configured', () => {
    expect(getHardwareStreamUrl(null, '')).toBe('');
    expect(getHardwareStreamUrl({ stream_url: 'ftp://bad' }, 'file:///nope')).toBe('');
  });

  test('accepts https and trims whitespace', () => {
    expect(getHardwareStreamUrl({ stream_url: '  https://pi.local:8001/video_feed  ' }, ''))
      .toBe('https://pi.local:8001/video_feed');
  });
});

describe('getHardwareHealthUrl', () => {
  test('prefers VITE_SECUREPI_HEALTH_URL when set', () => {
    expect(getHardwareHealthUrl('http://172.20.10.2:8001/video_feed', 'http://172.20.10.2:8001/custom-health'))
      .toBe('http://172.20.10.2:8001/custom-health');
  });

  test('derives /health from the MJPEG stream origin', () => {
    expect(getHardwareHealthUrl('http://172.20.10.2:8001/video_feed', ''))
      .toBe('http://172.20.10.2:8001/health');
  });

  test('returns empty string (polling disabled) when no valid hardware stream exists', () => {
    expect(getHardwareHealthUrl('', '')).toBe('');
    expect(getHardwareHealthUrl('/videos/loading.mp4', '')).toBe('');
  });
});

describe('isHttpUrl', () => {
  test('only http/https URLs qualify', () => {
    expect(isHttpUrl('http://x')).toBe(true);
    expect(isHttpUrl('HTTPS://x')).toBe(true);
    expect(isHttpUrl('/videos/loading.mp4')).toBe(false);
    expect(isHttpUrl('rtsp://cam')).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});
