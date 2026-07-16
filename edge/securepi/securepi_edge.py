#!/usr/bin/env python3
"""SecurePi edge node for FlowGuard unattended pallet/object alerts.

This runner is intentionally isolated from FlowGuard's normal FastAPI YOLO service.
It is meant to run on a Raspberry Pi near the camera, then POST alert events to the
Node/Express DetectionAlert API when an object remains unattended.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional


PACKAGE_LIKE_CLASSES = {"backpack", "handbag", "suitcase", "box", "package", "pallet", "bottle", "truck"}
PERSON_CLASSES = {"person"}


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]


def load_dotenv(path: str = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def center(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def distance_px(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


class AlertBridge:
    def __init__(self, base_url: str, endpoint: str, service_key: str = "", edge_ingest_token: str = "", timeout: float = 5.0):
        self.url = base_url.rstrip("/") + "/" + endpoint.lstrip("/")
        self.service_key = service_key
        self.edge_ingest_token = edge_ingest_token
        self.timeout = timeout

    def build_payload(self, *, config: argparse.Namespace, detection: Detection, duration_seconds: int, snapshot_url: str = "") -> dict:
        return {
            "alert_type": "Unattended Object",
            "object_class": detection.label,
            "zone_name": config.zone_name,
            "camera_location": config.camera_location,
            "duration_seconds": duration_seconds,
            "severity": config.severity,
            "status": "Active",
            "source": "SecurePi Edge Node",
            "confidence": round(float(detection.confidence), 4),
            "snapshot_url": snapshot_url or None,
            "device_id": config.device_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def post_alert(self, payload: dict) -> tuple[bool, str]:
        body = json.dumps({k: v for k, v in payload.items() if v is not None}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.edge_ingest_token:
            headers["Authorization"] = f"Bearer {self.edge_ingest_token}"
        elif self.service_key:
            headers["x-service-key"] = self.service_key
        request = urllib.request.Request(self.url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return 200 <= response.status < 300, response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            return False, exc.read().decode("utf-8")
        except OSError as exc:
            return False, str(exc)


class CooldownGate:
    def __init__(self, cooldown_seconds: int):
        self.cooldown_seconds = cooldown_seconds
        self.last_sent_at = 0.0

    def ready(self, now: Optional[float] = None) -> bool:
        current = time.time() if now is None else now
        return current - self.last_sent_at >= self.cooldown_seconds

    def mark_sent(self, now: Optional[float] = None) -> None:
        self.last_sent_at = time.time() if now is None else now


class UnattendedTracker:
    def __init__(self, unattended_seconds: int, proximity_px: int):
        self.unattended_seconds = unattended_seconds
        self.proximity_px = proximity_px
        self.object_seen_since: Optional[float] = None

    def update(self, detections: Iterable[Detection], now: Optional[float] = None) -> tuple[Optional[Detection], int]:
        current = time.time() if now is None else now
        people = [det for det in detections if det.label in PERSON_CLASSES]
        objects = [det for det in detections if det.label in PACKAGE_LIKE_CLASSES]
        if not objects:
            self.object_seen_since = None
            return None, 0

        candidate = max(objects, key=lambda det: det.confidence)
        object_center = center(candidate.bbox)
        owner_nearby = any(distance_px(object_center, center(person.bbox)) <= self.proximity_px for person in people)
        if owner_nearby:
            self.object_seen_since = None
            return None, 0

        if self.object_seen_since is None:
            self.object_seen_since = current
        duration = int(current - self.object_seen_since)
        if duration >= self.unattended_seconds:
            return candidate, duration
        return None, duration


class Imx500DetectionSource:
    def __init__(self, config: argparse.Namespace):
        try:
            from picamera2 import Picamera2  # type: ignore
            from picamera2.devices import IMX500  # type: ignore
        except ImportError as exc:
            raise RuntimeError("IMX500 mode requires python3-picamera2 and imx500-all on Raspberry Pi OS.") from exc
        if not config.model_path:
            raise RuntimeError("IMX500 mode requires --model-path pointing to an .rpk model.")
        self.camera = Picamera2()
        self.imx500 = IMX500(config.model_path)

    def read(self) -> tuple[object, list[Detection]]:
        request = self.camera.capture_request()
        metadata = request.get_metadata()
        request.release()
        # IMX500 metadata formats vary by model. Keep this parser conservative and
        # expect deployments to adapt label mapping for their chosen .rpk.
        raw_detections = metadata.get("imx500_detections", []) or metadata.get("detections", [])
        detections = []
        for item in raw_detections:
            label = str(item.get("label", "")).lower()
            confidence = float(item.get("confidence", item.get("score", 0)))
            box = item.get("bbox", item.get("box", [0, 0, 0, 0]))
            detections.append(Detection(label=label, confidence=confidence, bbox=tuple(map(int, box))))
        return None, detections


class OpenCvDetectionSource:
    def __init__(self, config: argparse.Namespace):
        try:
            import cv2  # type: ignore
        except ImportError as exc:
            raise RuntimeError("OpenCV fallback requires python3-opencv or opencv-python.") from exc
        self.cv2 = cv2
        self.capture = cv2.VideoCapture(config.camera_index)

    def read(self) -> tuple[object, list[Detection]]:
        ok, frame = self.capture.read()
        if not ok:
            return None, []
        # Fallback mode keeps the runner alive for demo plumbing. Add a local detector
        # here if you install a compatible model on the Pi.
        return frame, []


def save_snapshot(frame: object, snapshot_dir: str, cv2_module: object | None = None) -> str:
    if frame is None or not snapshot_dir:
        return ""
    path = Path(snapshot_dir)
    path.mkdir(parents=True, exist_ok=True)
    filename = f"securepi-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.jpg"
    target = path / filename
    if cv2_module and hasattr(cv2_module, "imwrite"):
        cv2_module.imwrite(str(target), frame)
        return str(target)
    return ""


def parse_args() -> argparse.Namespace:
    load_dotenv()
    parser = argparse.ArgumentParser(fromfile_prefix_chars="@")
    parser.add_argument("--mode", choices=["imx500", "opencv"], default=env("SECUREPI_MODE", "imx500"))
    parser.add_argument("--headless", action="store_true", default=env("HEADLESS", "true").lower() == "true")
    parser.add_argument("--model-path", default=env("IMX500_MODEL_PATH", ""))
    parser.add_argument("--camera-index", type=int, default=int(env("CAMERA_INDEX", "0")))
    parser.add_argument("--api-base-url", default=env("FLOWGUARD_API_BASE_URL", "http://localhost:5001"))
    parser.add_argument("--alert-endpoint", default=env("FLOWGUARD_ALERT_ENDPOINT", "/api/edge/detection-alerts"))
    parser.add_argument("--service-key", default=env("FLOWGUARD_API_KEY", ""))
    parser.add_argument("--edge-ingest-token", default=env("EDGE_INGEST_TOKEN", ""))
    parser.add_argument("--device-id", default=env("FLOWGUARD_DEVICE_ID", "securepi-loading-bay-01"))
    parser.add_argument("--zone-name", default=env("FLOWGUARD_ZONE_NAME", "Loading Bay"))
    parser.add_argument("--camera-location", default=env("FLOWGUARD_CAMERA_LOCATION", "Loading Bay Camera 01"))
    parser.add_argument("--unattended-time", type=int, default=int(env("UNATTENDED_TIME", "60")))
    parser.add_argument("--proximity-px", type=int, default=int(env("PROXIMITY_PX", "150")))
    parser.add_argument("--alert-cooldown", type=int, default=int(env("ALERT_COOLDOWN", "30")))
    parser.add_argument("--snapshot-dir", default=env("SNAPSHOT_DIR", "alerts/loading-bay"))
    parser.add_argument("--severity", choices=["High", "Critical"], default=env("SECUREPI_SEVERITY", "High"))
    parser.add_argument("--poll-seconds", type=float, default=float(env("POLL_SECONDS", "0.2")))
    return parser.parse_args()


def create_source(config: argparse.Namespace):
    return Imx500DetectionSource(config) if config.mode == "imx500" else OpenCvDetectionSource(config)


def main() -> int:
    config = parse_args()
    source = create_source(config)
    cv2_module = getattr(source, "cv2", None)
    tracker = UnattendedTracker(config.unattended_time, config.proximity_px)
    cooldown = CooldownGate(config.alert_cooldown)
    bridge = AlertBridge(config.api_base_url, config.alert_endpoint, config.service_key, config.edge_ingest_token)
    print(f"[SecurePi] Running {config.mode} edge node {config.device_id} for {config.zone_name}.")
    while True:
        frame, detections = source.read()
        alert_detection, duration = tracker.update(detections)
        if alert_detection and cooldown.ready():
            snapshot_url = save_snapshot(frame, config.snapshot_dir, cv2_module)
            payload = bridge.build_payload(config=config, detection=alert_detection, duration_seconds=duration, snapshot_url=snapshot_url)
            ok, message = bridge.post_alert(payload)
            print(f"[SecurePi] alert sent={ok}: {message[:180]}")
            if ok:
                cooldown.mark_sent()
        time.sleep(config.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
