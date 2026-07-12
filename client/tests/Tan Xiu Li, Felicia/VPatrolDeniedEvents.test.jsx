// Frontend tests — V-Patrol denied-event audit flow.
//
// Final RED outcomes (identity mismatch, liveness timeout, persistent
// multi-face abort) must be posted ONCE to the server-owned
// POST /api/facial-recognition/denied-event, and the returned REAL database
// record is prepended into the Security Timeline. Transient states (a single
// multi-face sample, offline services, camera faults) must never create a
// security log, and the fail-closed UI must never depend on the audit call.
import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";

const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/pages/VPatrol.jsx"), "utf8"
);

/** Source slice between two markers (for scoping structural assertions). */
const sliceBetween = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("denied-event call sites (exactly one per final outcome)", () => {
  test("13. failFinalConfirmation reports FINAL_IDENTITY_MISMATCH once, retaining the candidate first", () => {
    const block = sliceBetween("const failFinalConfirmation", "// Frontend filtering");
    // Candidate id/confidence are captured BEFORE the fail-closed reset clears them.
    const candidateCapture = block.indexOf("const candidate = candidateUserRef.current");
    const report = block.indexOf('recordDeniedSecurityEvent("FINAL_IDENTITY_MISMATCH"');
    const clear = block.indexOf("candidateUserRef.current = null");
    expect(candidateCapture).toBeGreaterThan(-1);
    expect(report).toBeGreaterThan(candidateCapture);
    expect(clear).toBeGreaterThan(report);
    // Exactly one FINAL_IDENTITY_MISMATCH submission in the whole page.
    expect(source.match(/recordDeniedSecurityEvent\("FINAL_IDENTITY_MISMATCH"/g)).toHaveLength(1);
  });

  test("14. failLivenessTimeout reports LIVENESS_TIMEOUT once, before clearing the candidate", () => {
    const block = sliceBetween("const failLivenessTimeout", "// ---");
    const report = block.indexOf('recordDeniedSecurityEvent("LIVENESS_TIMEOUT"');
    const clear = block.indexOf("candidateUserRef.current = null");
    expect(report).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(report);
    expect(source.match(/recordDeniedSecurityEvent\("LIVENESS_TIMEOUT"/g)).toHaveLength(1);
    // Fail-closed stays intact: no access paths from the timeout handler.
    expect(block).not.toMatch(/grantFinalAccess|ACCESS_EVENT_URL|attendance/i);
  });

  test("15/16. multi-face logs ONLY after the persistence threshold AND an aborted authorisation", () => {
    // A brief sample must not log: threshold is 1.5–2 s (≈ 6+ tracking samples).
    const constant = source.match(/const MULTI_FACE_LOG_PERSIST_MS = (\d+);/);
    expect(constant).not.toBeNull();
    expect(Number(constant[1])).toBeGreaterThanOrEqual(1500);
    expect(Number(constant[1])).toBeLessThanOrEqual(2000);

    const branch = sliceBetween("if (faceCount > 1)", "setMultipleFacesNotice(false)");
    // Gated on persistence + aborted attempt + once-per-episode flag.
    expect(branch).toMatch(/multiFaceRef\.current\.abortedAuth &&/);
    expect(branch).toMatch(/!multiFaceRef\.current\.logged &&/);
    expect(branch).toMatch(/now - multiFaceRef\.current\.since >= MULTI_FACE_LOG_PERSIST_MS/);
    expect(branch).toMatch(/multiFaceRef\.current\.logged = true;/);
    expect(branch).toMatch(/recordDeniedSecurityEvent\("MULTIPLE_FACES"/);
    // An aborted attempt is only recognised while authorising (not idle passers-by).
    expect(branch).toMatch(/TARGET_LOCKING|LIVENESS_CHECK/);
    // The immediate abort (fail-closed) still happens on the FIRST sample.
    expect(branch).toMatch(/abortAuthorizationForMultipleFaces\(\);/);
    expect(source.match(/recordDeniedSecurityEvent\("MULTIPLE_FACES"/g)).toHaveLength(1);
  });

  test("17. tracking samples cannot flood the endpoint: per-cycle and per-episode guards", () => {
    const helper = sliceBetween("const recordDeniedSecurityEvent", "// Liveness timeout");
    // One submission per reason per scanner cycle.
    expect(helper).toMatch(/if \(deniedReportedRef\.current\.has\(reason\)\) return;/);
    expect(helper).toMatch(/deniedReportedRef\.current\.add\(reason\);/);
    // The cycle guard re-arms only when the scanner resets / episode ends.
    const reset = sliceBetween("const resetScanner", "changeScanState(\"SYSTEM_ACTIVE\")");
    expect(reset).toMatch(/deniedReportedRef\.current\.clear\(\);/);
    // Exactly three denied call sites exist in the page (one per final outcome).
    expect(source.match(/recordDeniedSecurityEvent\("/g)).toHaveLength(3);
    // Never called from the raw tracking/recognition request loops.
    const trackingLoop = sliceBetween("const performTrackingScan", "const handleTrackingResult");
    expect(trackingLoop).not.toMatch(/recordDeniedSecurityEvent|DENIED_EVENT_URL/);
    const recognitionLoop = sliceBetween("const performRecognitionScan", "const resolveCandidateDecision");
    expect(recognitionLoop).not.toMatch(/recordDeniedSecurityEvent|DENIED_EVENT_URL/);
  });
});

describe("timeline update from the server-created record", () => {
  test("18. the RETURNED database log is prepended immediately (no fake browser-only twin)", () => {
    const helper = sliceBetween("const recordDeniedSecurityEvent", "// Liveness timeout");
    expect(helper).toMatch(/axios\.post\(DENIED_EVENT_URL/);
    expect(helper).toMatch(/res\.data\?\.logged \? res\.data\.log : null/);
    expect(helper).toMatch(/\[log, \.\.\.prev\.slice\(0, 14\)\]/);
    // The denied handlers do NOT also build a local `id: SEC-...` style entry.
    const finalBlock = sliceBetween("const failFinalConfirmation", "// Frontend filtering");
    const livenessBlock = sliceBetween("const failLivenessTimeout", "// ---");
    for (const block of [finalBlock, livenessBlock]) {
      expect(block).not.toMatch(/setIncidentLogs/);
      expect(block).not.toMatch(/id: `(SEC|ACC|DEN)-/);
    }
  });

  test("19. a duplicate returned database ID is never inserted twice", () => {
    const helper = sliceBetween("const recordDeniedSecurityEvent", "// Liveness timeout");
    expect(helper).toMatch(/prev\.some\(existing => existing\.id === log\.id\)\s*\?\s*prev/);
  });

  test("20. denied-event failure is non-fatal: no state reset, no access, fail-closed UI untouched", () => {
    const helper = sliceBetween("const recordDeniedSecurityEvent", "// Liveness timeout");
    expect(helper).toMatch(/catch \(err\)/);
    expect(helper).not.toMatch(/changeScanState|resetScanner|grantFinalAccess|setIdentifiedUser|throw/);
    // The red UI outcome is set by the failure handlers regardless of the audit call.
    const finalBlock = sliceBetween("const failFinalConfirmation", "// Frontend filtering");
    expect(finalBlock).toMatch(/setIdentifiedUser\("IDENTITY NOT CONFIRMED"\)/);
    expect(finalBlock).not.toMatch(/await recordDeniedSecurityEvent/); // never blocks the UI
  });

  test("21. stale responses after a camera-source switch or unmount are ignored", () => {
    const helper = sliceBetween("const recordDeniedSecurityEvent", "// Liveness timeout");
    expect(helper).toMatch(/const scanSession = scanSessionRef\.current;/);
    expect(helper).toMatch(/if \(scanSession !== scanSessionRef\.current\) return;/);
    // A source switch also closes any multi-face episode.
    const clear = sliceBetween("const clearTrackingState", "// Primary source");
    expect(clear).toMatch(/multiFaceRef\.current = \{ since: 0, abortedAuth: false, logged: false \};/);
  });
});

describe("existing unknown/suspended/success flows are preserved", () => {
  test("22. unknown/suspended recognition keeps its /recognize-owned log — no denied-event double write", () => {
    const decision = sliceBetween("const resolveCandidateDecision", "// ------");
    expect(decision).toMatch(/Suspended Access Attempt|Intrusion Alert/);
    expect(decision).not.toMatch(/recordDeniedSecurityEvent|DENIED_EVENT_URL/);
  });

  test("23. successful access still posts ONLY the access-event", () => {
    const grantBlock = sliceBetween("const grantFinalAccess", "// Capture one frame");
    expect(grantBlock).toMatch(/axios\.post\(ACCESS_EVENT_URL/);
    expect(grantBlock).not.toMatch(/recordDeniedSecurityEvent|DENIED_EVENT_URL/);
    // Exactly one denied-event POST exists (inside the helper), one access-event POST.
    expect(source.match(/axios\.post\(DENIED_EVENT_URL/g)).toHaveLength(1);
    expect(source.match(/axios\.post\(ACCESS_EVENT_URL/g)).toHaveLength(1);
  });

  test("24. V-Patrol never calls attendance, and operational faults are not security events", () => {
    expect(source).not.toMatch(/attendance\/scan|ATTENDANCE_SCAN_URL/);
    // Camera/service faults surface as notices, never as denied-event posts.
    const cctv = sliceBetween("const startCCTV", "const stopCCTV");
    expect(cctv).not.toMatch(/recordDeniedSecurityEvent|DENIED_EVENT_URL/);
    expect(source).toMatch(/facial-recognition\/denied-event/);
  });
});
