"""Focused verification for zone_rules.resolve_zone_config — the pure branching logic
behind "the selected camera loads THAT camera's Detection Setup rule" (see main.py's
resolve_zone_for_request). Deliberately imports only zone_rules, not main.py, so it runs
without YOLO/InsightFace/Postgres installed.

Run with:  python -m unittest ai-service/tests/test_zone_resolution.py -v
       or:  python ai-service/tests/test_zone_resolution.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zone_rules import resolve_zone_config, DEFAULT_ZONE_THRESHOLD_SEC  # noqa: E402


ZONE_A = (1, "Zone A", 5, 300, True)   # id, name, time_threshold(min), unattended_sec, enabled
ZONE_B = (2, "Zone B", 1, 60, True)
ZONE_DISABLED = (3, "Zone C", 5, None, False)


def cam_lookup(mapping):
    """Builds a fetch_camera_zone_id(camera_id) fake from {camera_id: zone_id}."""
    def _lookup(camera_id):
        if camera_id not in mapping:
            return False, None
        return True, mapping[camera_id]
    return _lookup


def zone_lookup(zones_by_id):
    def _lookup(zone_id):
        return zones_by_id.get(zone_id)
    return _lookup


class ZoneResolutionTests(unittest.TestCase):
    def test_camera_a_loads_camera_a_zone(self):
        fetch_cam = cam_lookup({101: 1, 102: 2})
        fetch_zone = zone_lookup({1: ZONE_A, 2: ZONE_B})
        config = resolve_zone_config(101, None, fetch_cam, fetch_zone)
        self.assertEqual(config["applied_zone_id"], 1)
        self.assertEqual(config["applied_zone_name"], "Zone A")
        self.assertEqual(config["applied_threshold_seconds"], 300)
        self.assertIsNone(config["zone_error"])

    def test_camera_b_loads_camera_b_zone_not_global_smallest(self):
        # Zone B has the smaller threshold (60s) — selecting Camera A must NOT leak it.
        fetch_cam = cam_lookup({101: 1, 102: 2})
        fetch_zone = zone_lookup({1: ZONE_A, 2: ZONE_B})
        config_a = resolve_zone_config(101, None, fetch_cam, fetch_zone)
        config_b = resolve_zone_config(102, None, fetch_cam, fetch_zone)
        self.assertEqual(config_a["applied_threshold_seconds"], 300)
        self.assertEqual(config_b["applied_threshold_seconds"], 60)
        self.assertNotEqual(config_a["applied_zone_id"], config_b["applied_zone_id"])

    def test_zone_id_takes_precedence_when_supplied_directly(self):
        fetch_cam = cam_lookup({})  # should never be called
        fetch_zone = zone_lookup({2: ZONE_B})
        config = resolve_zone_config(None, 2, fetch_cam, fetch_zone)
        self.assertEqual(config["applied_zone_id"], 2)
        self.assertEqual(config["applied_camera_id"], None)

    def test_camera_id_wins_over_stale_client_zone_id(self):
        # The frontend may send its cached camera.zone_id, but the AI service must trust
        # the camera's current DB assignment so a stale page cannot apply the wrong rule.
        fetch_cam = cam_lookup({101: 1})
        fetch_zone = zone_lookup({1: ZONE_A, 2: ZONE_B})
        config = resolve_zone_config(101, 2, fetch_cam, fetch_zone)
        self.assertEqual(config["applied_zone_id"], 1)
        self.assertEqual(config["applied_zone_name"], "Zone A")
        self.assertEqual(config["applied_threshold_seconds"], 300)

    def test_camera_with_no_zone_is_handled_safely(self):
        fetch_cam = cam_lookup({101: None})
        fetch_zone = zone_lookup({})
        config = resolve_zone_config(101, None, fetch_cam, fetch_zone)
        self.assertEqual(config["zone_error"], "camera_has_no_zone")
        self.assertFalse(config["detection_enabled"])
        self.assertEqual(config["applied_threshold_seconds"], DEFAULT_ZONE_THRESHOLD_SEC)

    def test_invalid_camera_id_is_controlled_not_a_crash(self):
        fetch_cam = cam_lookup({})  # camera 999 does not exist
        fetch_zone = zone_lookup({})
        config = resolve_zone_config(999, None, fetch_cam, fetch_zone)
        self.assertEqual(config["zone_error"], "camera_not_found")
        self.assertFalse(config["detection_enabled"])

    def test_deleted_or_missing_zone_is_not_treated_as_active(self):
        fetch_cam = cam_lookup({101: 5})
        fetch_zone = zone_lookup({})  # zone 5 soft-deleted / gone
        config = resolve_zone_config(101, None, fetch_cam, fetch_zone)
        self.assertEqual(config["zone_error"], "zone_not_found")
        self.assertFalse(config["detection_enabled"])

    def test_disabled_zone_resolves_with_detection_enabled_false(self):
        fetch_cam = cam_lookup({101: 3})
        fetch_zone = zone_lookup({3: ZONE_DISABLED})
        config = resolve_zone_config(101, None, fetch_cam, fetch_zone)
        self.assertIsNone(config["zone_error"])
        self.assertFalse(config["detection_enabled"])


if __name__ == "__main__":
    unittest.main()
