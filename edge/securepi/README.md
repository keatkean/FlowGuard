# SecurePi Edge Node for FlowGuard

This folder is an optional Raspberry Pi edge integration for FlowGuard Object Detection & Space Management. It does not replace the existing React + Node/Express + FastAPI YOLO flow. It runs near the camera, watches for unattended package-like objects, and sends `DetectionAlert` records to FlowGuard.

The uploaded SecurePi project is preserved under `upstream/` and is the recommended Raspberry Pi AI Camera path:

- `upstream/securePi.py`: original IMX500 SecurePi monitor, patched with a FlowGuard alert bridge.
- `upstream/presets/flowguard-loading-bay.args`: FlowGuard loading-bay preset.
- `upstream/README-SecurePi.md`, `LABELS.md`, `MODELS.md`: upstream SecurePi documentation.
- `securepi_edge.py`: small hardware-tolerant bridge runner kept for fallback/demo plumbing.

## What It Does

- Runs on Raspberry Pi OS Bookworm.
- Supports Raspberry Pi AI Camera / IMX500 mode when `picamera2`, `imx500-all`, and an `.rpk` object detection model are installed.
- Keeps a lightweight OpenCV fallback runner for demo plumbing without requiring IMX500 packages.
- Tracks package-like objects and people separately.
- Starts the unattended timer only when no nearby person/owner is within `PROXIMITY_PX`.
- Resets the timer when a person returns.
- Sends a FlowGuard alert after `UNATTENDED_TIME`.
- Exposes the same annotated SecurePi frame as `GET /video_feed` when streaming is enabled.
- Prevents duplicate alert spam with `ALERT_COOLDOWN`.
- Can save a local snapshot path when the active detection source provides a frame.

## Hardware Requirements

IMX500 mode requires Raspberry Pi hardware and packages that usually do not work on normal laptops:

```bash
sudo apt update
sudo apt install -y python3-picamera2 python3-opencv imx500-all
```

You also need an IMX500-compatible `.rpk` object detection model. The uploaded SecurePi defaults to the model installed by `imx500-all`:

```bash
/usr/share/imx500-models/imx500_network_ssd_mobilenetv2_fpnlite_320x320_pp.rpk
```

OpenCV fallback mode:

```bash
sudo apt update
sudo apt install -y python3-opencv
```

Fallback mode does not claim true pallet detection. It is intended for integration testing or for adding a local detector later.

## FlowGuard Backend Setup

On the FlowGuard server, set an edge ingest token:

```bash
EDGE_INGEST_TOKEN=dev-securepi-token
```

The Pi sends this as `Authorization: Bearer <token>` to `POST /api/edge/detection-alerts`. Existing YOLO service-key behavior still works through `AI_SERVICE_KEY` on the normal `/api/detection-alerts` route.

Start the backend as usual from `server/`.

## Raspberry Pi Configuration

Copy the example env file:

```bash
cd edge/securepi
cp .env.example .env
```

Edit `.env`:

```bash
FLOWGUARD_API_BASE_URL=http://<flowguard-server-ip>:5001
FLOWGUARD_ALERT_ENDPOINT=/api/edge/detection-alerts
EDGE_INGEST_TOKEN=dev-securepi-token
FLOWGUARD_DEVICE_ID=securepi-loading-bay-01
FLOWGUARD_ZONE_NAME=Loading Bay
FLOWGUARD_CAMERA_LOCATION=Loading Bay Camera 01
STREAM_ENABLED=true
STREAM_HOST=0.0.0.0
STREAM_PORT=8001
STREAM_FPS=8
STREAM_JPEG_QUALITY=70
UNATTENDED_TIME=60
PROXIMITY_PX=150
ALERT_COOLDOWN=30
SNAPSHOT_DIR=alerts/loading-bay
HEADLESS=true
```

Run manually:

```bash
cd edge/securepi/upstream
FLOWGUARD_API_BASE_URL=http://<flowguard-server-ip>:5001 \
EDGE_INGEST_TOKEN=dev-securepi-token \
python3 securePi.py @flowguard-loading-bay.args --headless --stream --stream-host 0.0.0.0 --stream-port 8001
```

You can also pass FlowGuard settings as flags:

```bash
python3 securePi.py @flowguard-loading-bay.args --headless \
  --flowguard-api-base-url http://<flowguard-server-ip>:5001 \
  --edge-ingest-token dev-securepi-token \
  --stream --stream-host 0.0.0.0 --stream-port 8001 --stream-fps 8 --stream-quality 70
```

For the lightweight OpenCV fallback runner:

```bash
cd edge/securepi
SECUREPI_MODE=opencv python3 securepi_edge.py --mode opencv --headless
```

## Optional systemd Service

Copy the example and adjust paths/user:

```bash
sudo cp securepi-edge.service.example /etc/systemd/system/securepi-edge.service
sudo systemctl daemon-reload
sudo systemctl enable securepi-edge
sudo systemctl start securepi-edge
sudo systemctl status securepi-edge
```

## Test FlowGuard Receives Alerts

From the Pi, send a manual test alert:

```bash
curl -X POST "$FLOWGUARD_API_BASE_URL/api/edge/detection-alerts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EDGE_INGEST_TOKEN" \
  -d '{
    "alert_type": "Unattended Object",
    "object_class": "package-like object",
    "zone_name": "Loading Bay",
    "camera_location": "Loading Bay Camera 01",
    "duration_seconds": 75,
    "severity": "High",
    "status": "Active",
    "source": "SecurePi Edge Node",
    "device_id": "securepi-loading-bay-01"
  }'
```

Then open FlowGuard:

- Dashboard should show the urgent Object Detection alert.
- Object Detection should show source `SecurePi Edge Node`.
- FM/Staff can mark it Acknowledged, Investigating, Escalated, or Cleared.

## Test the Live Hardware Stream

On the Raspberry Pi, find its hotspot/network IP:

```bash
hostname -I
```

Start SecurePi with streaming enabled:

```bash
cd edge/securepi/upstream
python3 securePi.py @flowguard-loading-bay.args --headless --stream --stream-host 0.0.0.0 --stream-port 8001
```

Test locally on the Pi:

```bash
curl http://127.0.0.1:8001/health
```

From the laptop:

```powershell
curl.exe http://<PI-IP>:8001/health
```

Then open this URL in the laptop browser:

```text
http://<PI-IP>:8001/video_feed
```

If the stream works directly in the browser, configure the React client in `client/.env.local`:

```env
VITE_SECUREPI_STREAM_URL=http://<PI-IP>:8001/video_feed
VITE_SECUREPI_HEALTH_URL=http://<PI-IP>:8001/health
```

Restart the Vite client after changing `.env.local`, then open Object Detection and select `SecurePi Hardware`.

## Notes and Limitations

- The edge runner uses friendly wording like "unattended pallet/object" and "package-like object". It does not claim true pallet recognition unless your installed model supports that class.
- IMX500 metadata varies by `.rpk` model. The uploaded `upstream/securePi.py` follows the Raspberry Pi IMX500 demo pattern and may still need label tuning for your selected model.
- The uploaded `upstream/securePi.py` path uses SecurePi's real IMX500 tensor parsing, owner-locked tracking, snapshots, `events.csv`, preset layering, and snapshot pruning.
- Snapshots are local paths by default. Exposing them as URLs should be done through a deliberate static-file hosting path, not by blindly serving the entire Pi filesystem.
- Hardware-only behavior is not run in normal CI. The upstream tests stub camera/OpenCV modules; this environment still needs a Python executable to run them.
- Direct HTTP MJPEG is for local PoC/hotspot testing. The laptop and Pi must be on the same network, the Pi IP can change after reconnecting, HTTPS sites may block HTTP streams as mixed content, and a deployed version should use an HTTPS reverse proxy, authenticated stream relay, or WebRTC. Do not expose the stream publicly without authentication.
