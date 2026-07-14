"""Off-device tests for securePi tracking, matching, alerting, and CLI parsing.

Runs on any machine — cv2 and picamera2 are not required (cv2 is stubbed
before import). Usage:

    python tests/test_securepi.py
"""
import contextlib
import io
import json
import urllib.request
import sys
import tempfile
import types
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

# Stub cv2 so the module imports without OpenCV. imwrite writes a placeholder
# file so the snapshot-pruning test can observe real files on disk; the drawing
# stubs record their calls so annotation tests can assert what was drawn.
_draw_calls = []
_cv2 = types.SimpleNamespace(
    imwrite=lambda path, img: Path(path).write_bytes(b"jpg") > 0,
    imencode=lambda ext, frame, params=None: (True, types.SimpleNamespace(tobytes=lambda: b"encoded-jpeg")),
    rectangle=lambda frame, p1, p2, color, thickness: _draw_calls.append(
        ("rect", p1, p2, color, thickness)),
    putText=lambda frame, text, org, font, scale, color, thickness: _draw_calls.append(
        ("text", text, color)),
    FONT_HERSHEY_SIMPLEX=0,
)
sys.modules.setdefault("cv2", _cv2)

from securePi import (Config, Detection, PersonTracker, BagTracker, TrackedBag,  # noqa: E402
                      match_detections, smooth_box, parse_args, _alert_due,
                      save_snapshot_worker, append_event_worker,
                      Renderer, _fire_alert, SNAPSHOT_EXECUTOR, COLOR_ALERT,
                      dedup_detections, FrameBuffer, StreamServer,
                      FlowGuardBridge, CrowdGate)


class FakeFrame:
    """Minimal frame stand-in: drawing stubs ignore it, save_snapshot copies it."""

    def copy(self):
        return self

CFG = Config()


def test_smooth_box():
    old, new = (100, 100, 50, 50), (110, 110, 50, 50)
    assert smooth_box(old, new, 0.6) == (106, 106, 50, 50)
    far = (400, 400, 50, 50)
    assert smooth_box(old, far, 0.6) == far          # jump: snap, don't drag
    assert smooth_box(old, new, 1.0) == new          # 1.0 disables smoothing


def test_match_detections_order_independent():
    class T:
        def __init__(self, box):
            self.box = box
            self.centroid = (box[0] + box[2] / 2, box[1] + box[3] / 2)

    tA, tB = T((100, 100, 40, 40)), T((160, 100, 40, 40))
    d1 = Detection("bag", 0.9, (158, 100, 40, 40))   # clearly B, but first in list
    d2 = Detection("bag", 0.9, (102, 100, 40, 40))   # clearly A
    m = match_detections([d1, d2], [tA, tB], iou_gate=0.3, dist_gate=120)
    assert m[0] is tB and m[1] is tA


def test_person_tracker_stable_ids():
    pt = PersonTracker(CFG)
    pt.update([Detection("person", 0.9, (100, 100, 60, 120))], now=0.0)
    pt.update([Detection("person", 0.9, (104, 98, 62, 118))], now=0.1)
    assert len(pt.tracks) == 1
    track = next(iter(pt.tracks.values()))
    assert track.person_id == 0
    assert 100 <= track.box[0] <= 104                # smoothed between detections


def test_bag_tracker_no_swap():
    bt = BagTracker(CFG)
    bt.update([Detection("suitcase", 0.9, (100, 100, 40, 40)),
               Detection("suitcase", 0.9, (200, 100, 40, 40))], [], now=0.0)
    bt.update([Detection("suitcase", 0.9, (201, 101, 40, 40)),   # reversed order
               Detection("suitcase", 0.9, (99, 99, 40, 40))], [], now=0.1)
    assert len(bt.bags) == 2
    assert abs(bt.bags[0].centroid[0] - 120) < 5     # bag 0 stayed left
    assert abs(bt.bags[1].centroid[0] - 220) < 5     # bag 1 stayed right


def test_alert_due():
    bt = BagTracker(CFG)
    bt.update([Detection("suitcase", 0.9, (0, 0, 10, 10))], [], now=0.0)
    bag = bt.bags[0]
    bag.unattended_start = 0.0
    assert not _alert_due(bag, CFG, now=10.0)
    assert _alert_due(bag, CFG, now=CFG.unattended_time_sec + 1)
    bag.alerted = True
    bag.last_alert_time = CFG.unattended_time_sec + 1
    assert not _alert_due(bag, CFG, now=CFG.unattended_time_sec + 5)
    assert _alert_due(bag, CFG,
                      now=CFG.unattended_time_sec + 1 + CFG.alert_cooldown_sec)


def test_snapshot_pruning():
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        for i in range(5):
            (directory / f"alert_bag0_2026010{i}-000000.jpg").write_bytes(b"x")
        save_snapshot_worker(None, directory / "alert_bag1_new.jpg",
                             directory, keep=3)
        remaining = sorted(f.name for f in directory.glob("alert_*.jpg"))
        assert len(remaining) == 3, remaining
        assert "alert_bag1_new.jpg" in remaining     # newest survives


def test_event_log_append():
    with tempfile.TemporaryDirectory() as tmp:
        log = Path(tmp) / "events.csv"
        append_event_worker(log, ["2026-07-07 10:00:00", 0, 12, "alert_bag0_x.jpg"])
        append_event_worker(log, ["2026-07-07 10:01:00", 1, 45, "alert_bag1_y.jpg"])
        lines = log.read_text(encoding="utf-8").strip().splitlines()
        assert lines[0] == "time,bag_id,unattended_sec,snapshot"  # header once
        assert len(lines) == 3
        assert lines[2].startswith("2026-07-07 10:01:00,1,45,")


def test_demo_preset():
    args = parse_args(["@demo.args"])
    assert args.unattended_time == 10.0              # demo override
    assert args.owner_claim_time == 5.0              # demo override
    assert args.alert_cooldown == 15.0               # demo override
    assert args.crowd_threshold == 1                 # inherited from common.args
    assert args.proximity == 150.0                   # inherited from common.args
    assert str(args.snapshot_dir).replace("\\", "/") == "alerts/demo"


def test_presets_resolution_and_layering():
    args = parse_args(["@lobby.args"])               # short name, any CWD
    assert args.unattended_time == 60.0              # lobby override
    assert args.proximity == 120.0                   # lobby override
    assert args.alert_cooldown == 30.0               # inherited from common.args
    assert args.crowd_threshold == 1                 # inherited from common.args
    args = parse_args(["@kitchen.args"])
    assert args.unattended_time == 300.0
    assert args.proximity == 150.0                   # inherited
    args = parse_args(["@lobby.args", "--unattended-time", "15"])
    assert args.unattended_time == 15.0              # CLI beats preset


def test_preset_required():
    for argv in ([], ["--headless"]):
        err = io.StringIO()
        try:
            with contextlib.redirect_stderr(err):
                parse_args(argv)
            raise AssertionError(f"should have exited for argv={argv}")
        except SystemExit as e:
            assert e.code == 2
        assert "settings file is required" in err.getvalue()
        assert "@lobby.args" in err.getvalue()
    # -h still prints help without a preset
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            parse_args(["-h"])
    except SystemExit as e:
        assert e.code == 0
    assert "--unattended-time" in out.getvalue()


def test_dedup_cross_label_detections():
    """One bag reported as backpack AND handbag in the same frame -> one detection."""
    dets = [Detection("backpack", 0.7, (100, 100, 40, 40)),
            Detection("handbag", 0.9, (102, 101, 40, 42)),
            Detection("suitcase", 0.8, (300, 100, 40, 40))]   # a genuinely separate bag
    kept = dedup_detections(dets)
    assert len(kept) == 2
    assert kept[0].label == "handbag"                          # highest score wins
    assert any(d.label == "suitcase" for d in kept)


def test_duplicate_bag_detections_one_track():
    bt = BagTracker(CFG)
    bt.update([Detection("backpack", 0.7, (100, 100, 40, 40)),
               Detection("handbag", 0.9, (102, 101, 40, 42))], [], now=0.0)
    assert len(bt.bags) == 1


def test_duplicate_bag_tracks_merge():
    """A stale flicker track stacked on the same bag collapses into the oldest,
    which keeps its id and unattended timer."""
    bt = BagTracker(CFG)
    bt.update([Detection("suitcase", 0.9, (100, 100, 40, 40))], [], now=0.0)
    bt._register(Detection("suitcase", 0.9, (104, 102, 40, 40)), now=5.0)
    assert len(bt.bags) == 2
    bt.update([], [], now=6.0)
    assert list(bt.bags) == [0]                                # oldest id survives
    assert bt.bags[0].unattended_start == 0.0                  # timer not reset
    assert bt.bags[0].last_seen == 5.0                         # fresher sighting adopted


def test_flowguard_payload():
    bridge = FlowGuardBridge(
        "http://flowguard.local:5001",
        "/api/edge/detection-alerts",
        "edge-token",
        "securepi-loading-bay-01",
        "Loading Bay",
        "Loading Bay Camera 01",
        "High",
    )
    payload = bridge.build_payload("suitcase", 75, 0.91)
    bridge.close()
    assert payload["alert_type"] == "Unattended Object"
    assert payload["object_class"] == "suitcase"
    assert payload["source"] == "SecurePi Edge Node"
    assert payload["zone_name"] == "Loading Bay"
    assert payload["camera_location"] == "Loading Bay Camera 01"
    assert payload["duration_seconds"] == 75
    assert payload["device_id"] == "securepi-loading-bay-01"
    assert payload["confidence"] == 0.91


def test_crowd_gate_disabled_when_threshold_zero():
    gate = CrowdGate()
    assert gate.update(50, 0) is False
    assert gate.update(0, 0) is False


def test_crowd_gate_fires_once_then_rearms_below_threshold():
    gate = CrowdGate()
    assert gate.update(3, 5) is False          # below threshold
    assert gate.update(5, 5) is True            # reaches threshold: fires
    assert gate.update(6, 5) is False           # still crowded: no repeat
    assert gate.update(7, 5) is False           # still crowded: no repeat
    assert gate.update(4, 5) is False           # drops below: re-arm, no fire
    assert gate.update(5, 5) is True            # crosses again: fires once more


def test_crowd_gate_single_person_does_not_fire_unless_threshold_is_one():
    gate = CrowdGate()
    assert gate.update(1, 5) is False
    gate2 = CrowdGate()
    assert gate2.update(1, 1) is True           # explicitly configured for 1


def test_flowguard_crowd_payload():
    bridge = FlowGuardBridge(
        "http://flowguard.local:5001",
        "/api/edge/detection-alerts",
        "edge-token",
        "securepi-loading-bay-01",
        "Loading Bay",
        "Loading Bay Camera 01",
        "High",
    )
    payload = bridge.build_person_payload(8)
    assert payload["alert_type"] == "Critical: 8 People Detected"
    assert payload["severity"] == "Critical"
    assert payload["source"] == "SecurePi Edge Node"
    assert payload["zone_name"] == "Loading Bay"
    assert payload["camera_location"] == "Loading Bay Camera 01"
    assert payload["device_id"] == "securepi-loading-bay-01"
    assert payload["person_count"] == 8
    single = bridge.build_person_payload(1)
    bridge.close()
    assert single["alert_type"] == "Warning: Person Detected"
    assert single["severity"] == "Medium"


def test_frame_buffer_updates_sequence():
    buf = FrameBuffer()
    jpeg, seq = buf.wait_for_frame(0, timeout=0.01)
    assert jpeg is None
    assert seq == 0
    buf.publish(b"frame-a")
    jpeg, seq = buf.wait_for_frame(0, timeout=0.01)
    assert jpeg == b"frame-a"
    assert seq == 1


def test_stream_health_endpoint():
    cfg = Config(stream_enabled=True, stream_host="127.0.0.1", stream_port=0)
    buf = FrameBuffer()
    server = StreamServer(cfg, buf)
    server.start()
    try:
        port = server.port
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["status"] == "online"
        assert payload["camera"] == "IMX500"
        assert payload["streaming"] is True
    finally:
        server.stop()


def test_stream_people_count_endpoint_reports_fresh_status():
    cfg = Config(stream_enabled=True, stream_host="127.0.0.1", stream_port=0)
    buf = FrameBuffer()
    buf.publish_status(3, 1)
    server = StreamServer(cfg, buf)
    server.start()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{server.port}/people-count", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["count"] == 3
        assert payload["person_count"] == 3
        assert payload["bag_count"] == 1
        assert payload["detection_active"] is True
    finally:
        server.stop()


def test_alert_snapshot_has_bag_box():
    """The saved alert snapshot must mark the offending bag, even if the
    renderer skipped its box (track coasting past draw_grace_sec)."""
    with tempfile.TemporaryDirectory() as td:
        cfg = Config(snapshot_dir=Path(td))
        bt = BagTracker(cfg)
        bt.update([Detection("suitcase", 0.9, (50, 60, 40, 40))], [], now=0.0)
        bag = bt.bags[0]
        bag.unattended_start = 0.0

        _draw_calls.clear()
        import securePi
        securePi.LOGGER.disabled = True
        try:
            _fire_alert(FakeFrame(), bag, cfg, now=cfg.unattended_time_sec + 5,
                        renderer=Renderer(cfg))
        finally:
            securePi.LOGGER.disabled = False
        # Drain the single-worker executor so the snapshot write has finished.
        SNAPSHOT_EXECUTOR.submit(lambda: None).result()

        rects = [c for c in _draw_calls if c[0] == "rect"]
        assert any(c[3] == COLOR_ALERT and c[4] == 3 for c in rects), \
            "no thick red alert box was drawn on the frame"
        texts = [c for c in _draw_calls if c[0] == "text"]
        assert any("ALERT" in c[1] and f"Bag #{bag.bag_id}" in c[1] for c in texts)
        assert len(list(Path(td).glob("alert_*.jpg"))) == 1


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
        print(f"{test.__name__} OK")
    print(f"ALL {len(tests)} TESTS PASSED")
