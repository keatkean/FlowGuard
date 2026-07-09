import { describe, expect, test } from 'vitest';
import { buildZonePayload } from '../../src/pages/detectionSettingsPayload';

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
});
