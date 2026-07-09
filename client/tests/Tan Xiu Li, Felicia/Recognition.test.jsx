// Frontend tests — recognition result presentation (Gate Scanner / V-Patrol).
// The UI works only with safe fields (id, name, role, status, confidence) and
// must clearly distinguish Authorized / Suspended / Unknown outcomes.
import { describe, test, expect } from "vitest";

import { describeRecognitionSubject, RECOGNITION_STATUS } from "../../src/constants/recognition";

describe("describeRecognitionSubject", () => {
  test("recognised active user → name, role and confidence, access granted", () => {
    const out = describeRecognitionSubject({
      id: 25, name: "Tan Xiu Li, Felicia", role: "FM",
      status: RECOGNITION_STATUS.AUTHORIZED, confidence: 0.92,
    });
    expect(out.identityLabel).toContain("Tan Xiu Li, Felicia");
    expect(out.identityLabel).toContain("FM");
    expect(out.identityLabel).toContain("92% match");
    expect(out.accessLabel).toBe("ACCESS GRANTED");
    expect(out.granted).toBe(true);
  });

  test("suspended user → identity shown but access denied", () => {
    const out = describeRecognitionSubject({
      id: 25, name: "Tan Xiu Li, Felicia", role: "FM",
      status: RECOGNITION_STATUS.SUSPENDED, confidence: 0.92,
    });
    expect(out.identityLabel).toContain("Tan Xiu Li, Felicia");
    expect(out.accessLabel).toBe("ACCESS DENIED — ACCOUNT SUSPENDED");
    expect(out.granted).toBe(false);
  });

  test("unknown person → suspicious-person denial", () => {
    const out = describeRecognitionSubject({
      id: null, name: "Unknown Person", role: null,
      status: RECOGNITION_STATUS.DENIED, confidence: 0.34,
    });
    expect(out.identityLabel).toBe("Unknown Person");
    expect(out.accessLabel).toMatch(/SUSPICIOUS PERSON/);
    expect(out.granted).toBe(false);
  });

  test("null / missing user is treated as unknown", () => {
    const out = describeRecognitionSubject(null);
    expect(out.granted).toBe(false);
    expect(out.identityLabel).toBe("Unknown Person");
  });

  test("labels never contain raw biometric data", () => {
    const out = describeRecognitionSubject({
      id: 25, name: "Tan Xiu Li, Felicia", role: "FM",
      status: RECOGNITION_STATUS.AUTHORIZED, confidence: 0.92,
      // Even if a hostile payload smuggled extra fields, the labels stay safe.
      faceVector: [0.1, 0.2], embedding: [0.3],
    });
    const rendered = `${out.identityLabel} ${out.accessLabel}`;
    expect(rendered).not.toMatch(/faceVector|embedding|0\.1,0\.2/);
  });
});
