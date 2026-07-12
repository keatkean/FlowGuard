"""Pi Camera Module 3 HTTP node for the FlowGuard gate scanners.

One background thread owns the camera: it captures at a controlled target FPS,
encodes each frame to JPEG exactly once, and keeps ONLY the latest JPEG in
memory (never on disk). /video_feed and /snapshot both serve from that shared
cache, so recognition traffic no longer triggers duplicate capture/encode work.

The Picamera2 import lives inside main() so this module stays importable on
development machines (tests exercise FrameCache/CaptureLoop with a fake camera).
"""
import threading
import time
import signal
import sys

import cv2
from flask import Flask, Response, make_response

TARGET_FPS = 15
JPEG_QUALITY = 80
# How long /video_feed blocks waiting for a fresher frame before re-checking —
# a bounded condition wait, not a busy loop.
FRAME_WAIT_TIMEOUT_S = 2.0


class FrameCache:
    """Thread-safe latest-frame-only cache. Holds one JPEG plus its sequence
    number and capture timestamp; frames are never written to disk."""

    def __init__(self):
        self._cond = threading.Condition()
        self._jpeg = None
        self._sequence = 0
        self._captured_at = None

    def publish(self, jpeg_bytes, now=None):
        with self._cond:
            self._jpeg = jpeg_bytes
            self._sequence += 1
            self._captured_at = time.time() if now is None else now
            self._cond.notify_all()

    def latest(self):
        """Returns (jpeg_bytes | None, sequence, captured_at | None) without waiting."""
        with self._cond:
            return self._jpeg, self._sequence, self._captured_at

    def wait_for_next(self, last_sequence, timeout=FRAME_WAIT_TIMEOUT_S):
        """Block (bounded) until a frame newer than last_sequence exists.
        Returns (jpeg_bytes, sequence, captured_at); jpeg_bytes is None when
        the wait timed out with no newer frame."""
        with self._cond:
            if self._sequence <= last_sequence:
                self._cond.wait(timeout)
            if self._sequence > last_sequence and self._jpeg is not None:
                return self._jpeg, self._sequence, self._captured_at
            return None, last_sequence, self._captured_at


def encode_jpeg(frame, quality=JPEG_QUALITY):
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return buffer.tobytes() if ok else None


class CaptureLoop(threading.Thread):
    """Single producer: capture_array -> one JPEG encode -> cache.publish,
    paced to target_fps. Nothing else may touch the camera."""

    def __init__(self, camera, cache, target_fps=TARGET_FPS, encode=encode_jpeg):
        super().__init__(daemon=True, name="pi-camera-capture")
        self.camera = camera
        self.cache = cache
        self.target_fps = target_fps
        self.frame_delay = 1.0 / max(target_fps, 1)
        self._encode = encode
        self._stop_event = threading.Event()

    def stop(self):
        self._stop_event.set()

    def run(self):
        while not self._stop_event.is_set():
            started = time.time()
            try:
                frame = self.camera.capture_array()
                jpg = self._encode(frame)
                if jpg is not None:
                    self.cache.publish(jpg)
            except Exception as err:
                print(f"[Pi Camera] Capture failed: {err}")
            elapsed = time.time() - started
            self._stop_event.wait(max(0.0, self.frame_delay - elapsed))


def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


def create_app(cache, target_fps=TARGET_FPS):
    app = Flask(__name__)

    @app.route("/")
    def home():
        response = make_response(
            "Pi Camera Stream running. Use /video_feed for live preview or /snapshot for one JPEG frame."
        )
        return add_cors(response)

    @app.route("/health")
    def health():
        _jpeg, sequence, captured_at = cache.latest()
        frame_age_ms = (
            int((time.time() - captured_at) * 1000) if captured_at is not None else None
        )
        # Operational telemetry only — never image data.
        response = make_response({
            "status": "ok",
            "camera": "Pi Camera Module 3",
            "targetFps": target_fps,
            "frameAgeMs": frame_age_ms,
            "sequence": sequence,
        })
        return add_cors(response)

    def generate_frames():
        last_sequence = 0
        while True:
            jpg, sequence, _captured_at = cache.wait_for_next(last_sequence)
            if jpg is None:
                # Bounded wait expired with no fresh frame — try again.
                continue
            last_sequence = sequence
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
            )

    @app.route("/video_feed")
    def video_feed():
        response = Response(
            generate_frames(),
            mimetype="multipart/x-mixed-replace; boundary=frame"
        )
        return add_cors(response)

    @app.route("/snapshot")
    def snapshot():
        jpg, _sequence, _captured_at = cache.latest()
        if jpg is None:
            return add_cors(make_response("Camera warming up — no frame available yet", 503))
        response = make_response(jpg)
        response.headers["Content-Type"] = "image/jpeg"
        return add_cors(response)

    return app


def main():
    from picamera2 import Picamera2

    # Camera config: 640x480 is fast enough for facial-recognition PoC
    picam2 = Picamera2()
    config = picam2.create_video_configuration(
        main={"size": (640, 480), "format": "RGB888"}
    )
    picam2.configure(config)
    picam2.start()
    time.sleep(2)

    cache = FrameCache()
    capture_loop = CaptureLoop(picam2, cache)
    capture_loop.start()

    def shutdown_handler(sig, frame):
        print("\n[Pi Camera] Stopping camera server...")
        capture_loop.stop()
        try:
            picam2.stop()
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    app = create_app(cache)
    print("[Pi Camera] Starting server on http://0.0.0.0:8081")
    print(f"[Pi Camera] Single capture thread @ ~{TARGET_FPS} FPS feeding the shared frame cache")
    print("[Pi Camera] Live preview: /video_feed")
    print("[Pi Camera] Snapshot: /snapshot")
    app.run(host="0.0.0.0", port=8081, threaded=True)


if __name__ == "__main__":
    main()
