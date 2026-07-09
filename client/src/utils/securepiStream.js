// Helpers for resolving the SecurePi hardware (MJPEG) stream and health URLs.
// Local demo paths such as /videos/loading.mp4 are NOT hardware streams —
// only absolute http(s) URLs qualify.

export const isHttpUrl = (value) =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

// Resolution order:
// 1. selected Camera Inventory record's stream_url (http/https only)
// 2. VITE_SECUREPI_STREAM_URL development fallback
// 3. '' → caller shows "SecurePi stream not configured"
export const getHardwareStreamUrl = (selectedCamera, envStreamUrl = '') => {
  if (isHttpUrl(selectedCamera?.stream_url)) return selectedCamera.stream_url.trim();
  if (isHttpUrl(envStreamUrl)) return envStreamUrl.trim();
  return '';
};

// Resolution order:
// 1. VITE_SECUREPI_HEALTH_URL
// 2. derive <stream origin>/health from the MJPEG stream URL
// 3. '' → caller disables health polling
export const getHardwareHealthUrl = (streamUrl, envHealthUrl = '') => {
  if (isHttpUrl(envHealthUrl)) return envHealthUrl.trim();
  if (!isHttpUrl(streamUrl)) return '';
  try {
    return `${new URL(streamUrl.trim()).origin}/health`;
  } catch {
    return '';
  }
};
