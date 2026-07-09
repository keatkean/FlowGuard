import argparse
import unittest

from securepi_edge import AlertBridge, CooldownGate, Detection, UnattendedTracker


class SecurePiBridgeTests(unittest.TestCase):
    def test_alert_bridge_builds_flowguard_payload(self):
        config = argparse.Namespace(
            zone_name="Loading Bay",
            camera_location="Loading Bay Camera 01",
            severity="High",
            device_id="securepi-loading-bay-01",
        )
        detection = Detection("backpack", 0.87654, (100, 100, 200, 200))
        bridge = AlertBridge("http://flowguard.local:5001", "/api/edge/detection-alerts", edge_ingest_token="edge")

        payload = bridge.build_payload(
            config=config,
            detection=detection,
            duration_seconds=75,
            snapshot_url="alerts/loading-bay/event.jpg",
        )

        self.assertEqual(payload["alert_type"], "Unattended Object")
        self.assertEqual(payload["object_class"], "backpack")
        self.assertEqual(payload["source"], "SecurePi Edge Node")
        self.assertEqual(payload["zone_name"], "Loading Bay")
        self.assertEqual(payload["camera_location"], "Loading Bay Camera 01")
        self.assertEqual(payload["duration_seconds"], 75)
        self.assertEqual(payload["confidence"], 0.8765)
        self.assertEqual(payload["snapshot_url"], "alerts/loading-bay/event.jpg")
        self.assertEqual(payload["device_id"], "securepi-loading-bay-01")

    def test_cooldown_prevents_duplicate_posts(self):
        gate = CooldownGate(30)
        self.assertTrue(gate.ready(now=100))
        gate.mark_sent(now=100)
        self.assertFalse(gate.ready(now=120))
        self.assertTrue(gate.ready(now=131))

    def test_unattended_timer_resets_when_owner_returns(self):
        tracker = UnattendedTracker(unattended_seconds=10, proximity_px=40)
        bag = Detection("suitcase", 0.9, (100, 100, 140, 140))
        owner_nearby = Detection("person", 0.9, (125, 120, 180, 220))

        alert, duration = tracker.update([bag], now=0)
        self.assertIsNone(alert)
        self.assertEqual(duration, 0)

        alert, duration = tracker.update([bag], now=11)
        self.assertEqual(alert, bag)
        self.assertEqual(duration, 11)

        alert, duration = tracker.update([bag, owner_nearby], now=12)
        self.assertIsNone(alert)
        self.assertEqual(duration, 0)


if __name__ == "__main__":
    unittest.main()
