from flask import Flask, Response, make_response
from picamera2 import Picamera2
import cv2
import time
import signal
import sys

app = Flask(__name__)

# Camera config: 640x480 is fast enough for facial-recognition PoC
picam2 = Picamera2()
config = picam2.create_video_configuration(
    main={"size": (640, 480), "format": "RGB888"}
)
picam2.configure(config)
picam2.start()
time.sleep(2)


def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


def capture_jpeg():
    try:
        frame = picam2.capture_array()

        ok, buffer = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), 80]
        )

        if not ok:
            return None

        return buffer.tobytes()

    except Exception as err:
        print(f"[Pi Camera] Snapshot capture failed: {err}")
        return None


def generate_frames():
    while True:
        jpg = capture_jpeg()

        if jpg is None:
            time.sleep(0.1)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
        )


@app.route("/")
def home():
    response = make_response(
        "Pi Camera Stream running. Use /video_feed for live preview or /snapshot for one JPEG frame."
    )
    return add_cors(response)


@app.route("/health")
def health():
    response = make_response({"status": "ok", "camera": "Pi Camera Module 3"})
    return add_cors(response)


@app.route("/video_feed")
def video_feed():
    response = Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )
    return add_cors(response)


@app.route("/snapshot")
def snapshot():
    jpg = capture_jpeg()

    if jpg is None:
        return add_cors(make_response("Failed to capture snapshot", 500))

    response = make_response(jpg)
    response.headers["Content-Type"] = "image/jpeg"
    return add_cors(response)


def shutdown_handler(sig, frame):
    print("\n[Pi Camera] Stopping camera server...")
    try:
        picam2.stop()
    except Exception:
        pass
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown_handler)
signal.signal(signal.SIGTERM, shutdown_handler)


if __name__ == "__main__":
    print("[Pi Camera] Starting server on http://0.0.0.0:8081")
    print("[Pi Camera] Live preview: /video_feed")
    print("[Pi Camera] Snapshot: /snapshot")
    app.run(host="0.0.0.0", port=8081, threaded=True)