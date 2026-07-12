import { describe, expect, test } from 'vitest';
import { buildZonePayload } from '../../src/pages/detectionSettingsPayload';
import { buildAnalyzeFramePayload, resolveAlertSource } from '../../src/pages/ObjectDetection';

describe('Detection Setup payload mapping', () => {
  test('Unattended Pallet / Object threshold maps to unattended seconds', () => {
    const payload = buildZonePayload({
      zone_name: 'Loading Bay',
      location: 'Dock 1',
      detection_type: 'unattended_object',
      time_threshold: '2',
      monitored_classes: '',
      density_threshold: '',
      unattended_threshold_seconds: '',
      alert_cooldown_seconds: '',
      severity: 'High',
      assigned_team: '',
      detection_enabled: true,
    });

    expect(payload.time_threshold).toBe(2);
    expect(payload.unattended_threshold_seconds).toBe(120);
    expect(payload.monitored_classes).toContain('backpack');
    expect(payload.alert_cooldown_seconds).toBe(120);
  });

  test('saves the explicit detection_type chosen on the form, not an inferred one', () => {
    const payload = buildZonePayload({
      zone_name: 'Loading Bay',
      location: 'Dock 1',
      detection_type: 'crowd_density',
      time_threshold: '2',
      monitored_classes: '',
      density_threshold: '',
      unattended_threshold_seconds: '',
      alert_cooldown_seconds: '',
      severity: 'Critical', // previously the inference heuristic mistook Critical+person for Unauthorized Access
      assigned_team: '',
      detection_enabled: true,
    });

    expect(payload.detection_type).toBe('crowd_density');
  });
});

describe('Object Detection analyse-frame payload', () => {
  test('includes camera_id and zone_id for the selected camera', () => {
    const camera = { id: 7, zone_id: 3 };
    expect(buildAnalyzeFramePayload('data:image/jpeg;base64,abc', camera)).toEqual({
      image: 'data:image/jpeg;base64,abc',
      camera_id: 7,
      zone_id: 3,
    });
  });

  test('omits zone_id when the selected camera has no assigned zone', () => {
    const camera = { id: 7, zone_id: null };
    expect(buildAnalyzeFramePayload('img', camera)).toEqual({ image: 'img', camera_id: 7 });
  });

  test('sends only { image } when no camera is selected (backward compatible fallback)', () => {
    expect(buildAnalyzeFramePayload('img', null)).toEqual({ image: 'img' });
  });

  test('includes source alongside camera_id/zone_id when provided', () => {
    const camera = { id: 7, zone_id: 3 };
    expect(buildAnalyzeFramePayload('img', camera, 'Browser Webcam')).toEqual({
      image: 'img',
      camera_id: 7,
      zone_id: 3,
      source: 'Browser Webcam',
    });
  });

  test('omits source when not provided (backward compatible)', () => {
    expect(buildAnalyzeFramePayload('img', null, undefined)).toEqual({ image: 'img' });
  });
});

describe('resolveAlertSource (sourceMode -> canonical alert source label)', () => {
  test('camera mode resolves to Browser Webcam', () => {
    expect(resolveAlertSource('camera')).toBe('Browser Webcam');
  });

  test('file mode resolves to Uploaded Video', () => {
    expect(resolveAlertSource('file')).toBe('Uploaded Video');
  });

  test('hardware mode resolves to SecurePi Edge Node', () => {
    expect(resolveAlertSource('hardware')).toBe('SecurePi Edge Node');
  });

  test('an unrecognized mode falls back to Browser Webcam', () => {
    expect(resolveAlertSource('something-else')).toBe('Browser Webcam');
  });
});
