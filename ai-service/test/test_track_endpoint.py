"""FastAPI /user/track tests — detection-only tracking telemetry.

The endpoint must reuse the already-loaded InsightFace DETECTION model (never
the embedding/recognition model), return safe transient telemetry only, and
perform zero database work. InsightFace/YOLO/psycopg2 are replaced with fakes
BEFORE importing main so the suite runs fast on any machine.

Run from the repo root:
    ai-service/.venv/Scripts/python -m pytest ai-service/test/test_track_endpoint.py -v
"""
import base64
import importlib.util
import os
import pathlib
import sys
import types

import numpy as np
import pytest

os.environ["AI_SERVICE_KEY"] = "test-track-key"

# ---------------------------------------------------------------------------
# Fakes injected before importing main.py
# ---------------------------------------------------------------------------

class FakeDetectionModel:
    """Stands in for the SCRFD detector. Records calls; result is settable."""

    def __init__(self):
        self.calls = []
        self.result = (np.zeros((0, 5), dtype=np.float32), None)

    def detect(self, img, input_size=None, max_num=0, metric="default"):
        self.calls.append({"input_size": input_size, "max_num": max_num, "metric": metric})
        return self.result


class FakeEmbeddingModel:
    def __init__(self):
        self.calls = 0

    def get(self, *a, **k):
        self.calls += 1
        raise AssertionError("embedding model must never run for /user/track")


FAKE_DET = FakeDetectionModel()
FAKE_REC = FakeEmbeddingModel()


class FakeFaceAnalysis:
    def __init__(self, name=None, **kwargs):
        self.models = {"detection": FAKE_DET, "recognition": FAKE_REC}

    def prepare(self, ctx_id=None, det_size=None):
        pass

    def get(self, img):
        raise AssertionError("full face_app.get pipeline must never run for /user/track")


_insightface = types.ModuleType("insightface")
_insightface_app = types.ModuleType("insightface.app")
_insightface_app.FaceAnalysis = FakeFaceAnalysis
_insightface.app = _insightface_app
sys.modules["insightface"] = _insightface
sys.modules["insightface.app"] = _insightface_app


def _yolo_unavailable(*a, **k):
    raise RuntimeError("YOLO disabled in tests")


_ultralytics = types.ModuleType("ultralytics")
_ultralytics.YOLO = _yolo_unavailable
sys.modules["ultralytics"] = _ultralytics


class FakePsycopg2(types.ModuleType):
    def __init__(self):
        super().__init__("psycopg2")
        self.connect_calls = 0

    def connect(self, *a, **k):
        self.connect_calls += 1
        raise RuntimeError("database disabled in tests")


FAKE_PSYCOPG2 = FakePsycopg2()
sys.modules["psycopg2"] = FAKE_PSYCOPG2

BASE = pathlib.Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("ai_main_under_test", BASE / "main.py")
main = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(main)

from fastapi.testclient import TestClient  # noqa: E402  (after fakes on purpose)

client = TestClient(main.app)
AUTH = {"X-AI-Service-Key": "test-track-key"}


def make_data_url():
    import cv2
    img = np.full((48, 64, 3), 127, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


FRAME = make_data_url()

# Keypoints where the nose sits midway between the eyes -> ratio 0.5.
CENTERED_KPS = np.array([
    [[30.0, 50.0], [90.0, 50.0], [60.0, 60.0], [45.0, 80.0], [75.0, 80.0]],
], dtype=np.float32)


@pytest.fixture(autouse=True)
def reset_fakes():
    FAKE_DET.calls.clear()
    FAKE_DET.result = (np.zeros((0, 5), dtype=np.float32), None)
    db_calls_before = FAKE_PSYCOPG2.connect_calls
    yield
    # 6. No DB queries from tracking requests (startup's cache load aside).
    assert FAKE_PSYCOPG2.connect_calls == db_calls_before


def test_track_requires_the_service_key():
    res = client.post("/user/track", json={"image": FRAME})
    assert res.status_code == 401
    res = client.post("/user/track", json={"image": FRAME}, headers={"X-AI-Service-Key": "wrong"})
    assert res.status_code == 401
    assert FAKE_DET.calls == []


def test_track_returns_box_and_ratio_without_any_identity_data():
    FAKE_DET.result = (
        np.array([[10.0, 20.0, 110.0, 220.0, 0.9]], dtype=np.float32),
        CENTERED_KPS,
    )
    res = client.post("/user/track", json={"image": FRAME}, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["faceDetected"] is True
    assert body["faceCount"] == 1
    assert body["box"] == [10, 20, 100, 200]  # [x, y, width, height]
    assert body["headTurnRatio"] == pytest.approx(0.5)
    assert isinstance(body["inferenceMs"], int)
    # Safe transient telemetry ONLY — no identity, no template.
    assert set(body.keys()) == {"faceDetected", "faceCount", "box", "headTurnRatio", "inferenceMs"}
    assert FAKE_REC.calls == 0  # embedding model untouched


def test_track_uses_the_smaller_detector_input_and_max_two_faces():
    FAKE_DET.result = (
        np.array([[10.0, 20.0, 110.0, 220.0, 0.9]], dtype=np.float32),
        CENTERED_KPS,
    )
    client.post("/user/track", json={"image": FRAME}, headers=AUTH)
    assert FAKE_DET.calls[0]["input_size"] == (256, 256)
    assert FAKE_DET.calls[0]["max_num"] == 2


def test_track_no_face_returns_explicit_nulls():
    res = client.post("/user/track", json={"image": FRAME}, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["faceDetected"] is False
    assert body["faceCount"] == 0
    assert body["box"] is None
    assert body["headTurnRatio"] is None


def test_track_multiple_faces_reports_count_and_the_largest_primary_box():
    FAKE_DET.result = (
        np.array([
            [5.0, 5.0, 25.0, 25.0, 0.8],        # small face
            [10.0, 20.0, 110.0, 220.0, 0.9],    # largest face -> primary
        ], dtype=np.float32),
        np.concatenate([CENTERED_KPS, CENTERED_KPS]),
    )
    res = client.post("/user/track", json={"image": FRAME}, headers=AUTH)
    body = res.json()
    assert body["faceCount"] == 2
    assert body["box"] == [10, 20, 100, 200]


def test_track_rejects_invalid_image_data():
    res = client.post("/user/track", json={"image": "data:image/jpeg;base64,%%%%"}, headers=AUTH)
    assert res.status_code == 400
