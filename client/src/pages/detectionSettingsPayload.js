export const DETECTION_TYPES = {
  unauthorized_access: {
    label: 'Unauthorized Access',
    defaults: {
      monitored_classes: 'person',
      density_threshold: '',
      unattended_threshold_seconds: '',
      alert_cooldown_seconds: '60',
      severity: 'Critical',
    },
  },
  unattended_object: {
    label: 'Unattended Pallet / Object',
    defaults: {
      monitored_classes: 'backpack, suitcase, pallet, box',
      density_threshold: '',
      unattended_threshold_seconds: '300',
      alert_cooldown_seconds: '120',
      severity: 'High',
    },
  },
  crowd_density: {
    label: 'Loading Bay Queue / Crowd Density',
    defaults: {
      monitored_classes: 'person',
      density_threshold: '8',
      unattended_threshold_seconds: '',
      alert_cooldown_seconds: '90',
      severity: 'Medium',
    },
  },
};

export const buildZonePayload = (form) => {
  const defaults = DETECTION_TYPES[form.detection_type]?.defaults || DETECTION_TYPES.unattended_object.defaults;
  const monitoredClasses = form.monitored_classes.trim() || defaults.monitored_classes;
  const densityThreshold = form.density_threshold === '' ? defaults.density_threshold : form.density_threshold;
  const unattendedSeconds = form.unattended_threshold_seconds === '' && form.detection_type === 'unattended_object'
    ? String(parseInt(form.time_threshold || '0', 10) * 60)
    : (form.unattended_threshold_seconds === '' ? defaults.unattended_threshold_seconds : form.unattended_threshold_seconds);
  const cooldownSeconds = form.alert_cooldown_seconds === '' ? defaults.alert_cooldown_seconds : form.alert_cooldown_seconds;

  return {
    zone_name: form.zone_name.trim(),
    location: form.location.trim(),
    time_threshold: parseInt(form.time_threshold, 10),
    monitored_classes: monitoredClasses.split(',').map((item) => item.trim()).filter(Boolean),
    density_threshold: densityThreshold === '' ? null : parseInt(densityThreshold, 10),
    unattended_threshold_seconds: unattendedSeconds === '' ? null : parseInt(unattendedSeconds, 10),
    alert_cooldown_seconds: cooldownSeconds === '' ? null : parseInt(cooldownSeconds, 10),
    severity: form.severity,
    assigned_team: form.assigned_team.trim() || null,
    detection_enabled: form.detection_enabled,
  };
};
