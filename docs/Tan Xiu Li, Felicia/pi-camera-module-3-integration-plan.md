# Raspberry Pi Camera Module 3 Integration — Gate Camera Node (Felicia)

## Overview

The **Raspberry Pi Camera Module 3 is the primary physical gate-camera node** for
FlowGuard's facial-recognition access flow (Gate Scanner and V-Patrol). The
**laptop webcam is the fallback** for demo reliability — if the Pi is unreachable
the pages automatically switch to the webcam and recognition keeps working.

Smart Logistics (bookings, driver pass, gate scan by reference) is untouched by
this change.

## Pi endpoints

The Pi runs an MJPEG camera server on port 8081:

| Purpose | Endpoint |
|---|---|
| Live preview (MJPEG stream) | `http://<pi-address>:8081/video_feed` |
| Single-frame snapshot (JPEG) | `http://<pi-address>:8081/snapshot` |

URLs are configured via Vite env vars in `client/.env` (placeholders in
`client/.env.example` — never commit real values):

```
VITE_PI_CAMERA_STREAM_URL=http://your-pi-address:8081/video_feed
VITE_PI_CAMERA_SNAPSHOT_URL=http://your-pi-address:8081/snapshot
```

If the env vars are absent, the client falls back to the demo-network defaults
baked into `client/src/constants/piCamera.js`.

## How it works

### Source selection (on page load)

1. Gate Scanner / V-Patrol probe the Pi **snapshot** endpoint (3.5 s timeout).
2. **Pi reachable** → the page shows the Pi live preview via
   `<img src=".../video_feed" />` and the status **"Pi Gate Camera connected"**.
3. **Pi unreachable** (network error, CORS block, or timeout) → the page starts
   the laptop webcam via `navigator.mediaDevices.getUserMedia` and shows
   **"Pi Camera unavailable — using laptop webcam fallback"**.

### Manual switch

Both pages have a **Camera Source** bar:
`[ Raspberry Pi Gate Camera ] [ Laptop Webcam ]`

- Switching to the Pi re-probes reachability first; if the Pi is down the page
  stays on the webcam and reports the fallback status.
- Switching to the webcam shows **"Laptop webcam active"**.

### Frame capture for recognition

- **Pi source**: each scan tick fetches `/snapshot`, decodes the JPEG blob into
  an `ImageBitmap`, draws it onto the existing hidden capture canvas (scaled to
  ≤420 px wide), and sends the same compressed base64 JPEG to the existing
  `/ai/user/recognize` API. Because the bitmap is blob-backed the canvas is not
  tainted. Three consecutive snapshot failures trigger automatic fallback to
  the webcam.
- **Webcam source**: unchanged — the original `<video>` → canvas → base64 flow.

All downstream logic (face box overlay, liveness check, attendance clock-in via
`/api/attendance/scan`, security logs via `/api/security/logs`) is source-agnostic
because both paths produce the same canvas-scaled base64 frame.

## Privacy

- **Raw face frames are only processed temporarily** — each captured frame is
  sent to the AI service for matching and is not persisted by the client.
- The app stores the **recognition result**, **confidence**, and the
  **attendance/security log** entry. Enrollment stores a **protected biometric
  template** server-side.
- The application never exposes biometric vectors through the UI or API
  responses.

## Files involved

| File | Change |
|---|---|
| `client/src/constants/piCamera.js` | New — Pi URLs (env + fallback), source/status constants, reachability probe, snapshot fetch helper |
| `client/src/pages/GateScanner.jsx` | Pi-primary source selection, manual switch UI, Pi snapshot capture path, auto-fallback |
| `client/src/pages/VPatrol.jsx` | Same integration as Gate Scanner |
| `client/.env.example` | Placeholder `VITE_PI_CAMERA_*` vars |
| `client/tests/Tan Xiu Li, Felicia/PiCamera.test.jsx` | New — helper/constants tests |

## Demo checklist

1. Power the Pi node; verify the stream in a browser.
2. Update `VITE_PI_CAMERA_*` in `client/.env` if the Pi IP changed.
3. Open Gate Scanner → expect **"Pi Gate Camera connected"**.
4. Unplug the Pi (or Wi-Fi) → within ~3 scan ticks the page reports
   **"Pi Camera unavailable — using laptop webcam fallback"** and keeps scanning.
5. Use the Camera Source buttons to switch back once the Pi returns.
