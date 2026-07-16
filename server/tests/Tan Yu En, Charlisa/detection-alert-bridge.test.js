// Unit tests for the shared detection-alert -> IncidentLog type mapping helper used by
// BOTH /api/detection-alerts and /api/edge/detection-alerts, so a crowd/person-count
// alert never bridges into the Incident Dashboard mislabeled as an unattended object.
const { resolveIncidentType, DEFAULT_INCIDENT_TYPE } = require("../../utils/detectionAlertBridge");

describe("resolveIncidentType", () => {
  test("unattended object class (e.g. 'backpack') maps to UNATTENDED_OBJECT", () => {
    expect(resolveIncidentType({ object_class: "backpack" })).toBe("UNATTENDED_OBJECT");
  });

  test("SecurePi's default 'package-like object' maps to UNATTENDED_OBJECT", () => {
    expect(resolveIncidentType({ alert_type: "Unattended Object", object_class: "package-like object" }))
      .toBe("UNATTENDED_OBJECT");
  });

  test("a single-person alert ('Critical: Person Detected') maps to OVERCROWDING", () => {
    expect(resolveIncidentType({ object_class: "Critical: Person Detected" })).toBe("OVERCROWDING");
  });

  test("a crowd/person-count alert ('Warning: 3 People Detected') maps to OVERCROWDING", () => {
    expect(resolveIncidentType({ object_class: "Warning: 3 People Detected" })).toBe("OVERCROWDING");
  });

  test("an explicit unauthorized-access alert_type maps to UNAUTHORIZED_ACCESS", () => {
    expect(resolveIncidentType({ alert_type: "Unauthorized Access", object_class: "person" }))
      .toBe("UNAUTHORIZED_ACCESS");
  });

  test("zone.detection_type (crowd_density) takes precedence over object_class text", () => {
    expect(resolveIncidentType({ object_class: "backpack", detection_type: "crowd_density" }))
      .toBe("OVERCROWDING");
  });

  test("zone.detection_type (unauthorized_access) takes precedence over object_class text", () => {
    expect(resolveIncidentType({ object_class: "backpack", detection_type: "unauthorized_access" }))
      .toBe("UNAUTHORIZED_ACCESS");
  });

  test("an unrecognized detection_type falls back to the object_class/alert_type heuristic", () => {
    expect(resolveIncidentType({ object_class: "Critical: Person Detected", detection_type: "not_a_real_type" }))
      .toBe("OVERCROWDING");
  });

  test("no identifying fields at all falls back to the default (UNATTENDED_OBJECT)", () => {
    expect(resolveIncidentType({})).toBe(DEFAULT_INCIDENT_TYPE);
    expect(resolveIncidentType()).toBe(DEFAULT_INCIDENT_TYPE);
  });
});
