// Frontend tests — Security Timeline helpers: Singapore-time formatting and
// frontend filtering (date range, event type, person/location search).
import { describe, test, expect } from "vitest";

import {
  formatSingaporeTimestamp,
  formatSingaporeFull,
} from "../../src/constants/datetime";
import {
  deriveAccessResult,
  getLogTimestamp,
  filterSecurityLogs,
  hasActiveFilters,
  ACCESS_RESULTS,
} from "../../src/constants/securityTimeline";

// Fixed "now": 09 Jul 2026, 9:50 PM Singapore time (UTC+8).
const NOW = new Date("2026-07-09T21:50:00+08:00");

describe("formatSingaporeTimestamp", () => {
  test("same Singapore calendar day → 'Today, h:mm AM/PM'", () => {
    expect(formatSingaporeTimestamp("2026-07-09T21:50:00+08:00", NOW)).toBe("Today, 9:50 PM");
  });

  test("previous Singapore calendar day → 'Yesterday, h:mm AM/PM'", () => {
    expect(formatSingaporeTimestamp("2026-07-08T16:12:00+08:00", NOW)).toBe("Yesterday, 4:12 PM");
  });

  test("older date → 'DD MMM YYYY, h:mm AM/PM'", () => {
    expect(formatSingaporeTimestamp("2026-07-01T09:05:00+08:00", NOW)).toBe("01 Jul 2026, 9:05 AM");
  });

  test("converts UTC input into Singapore time (UTC+8)", () => {
    // 13:50 UTC on 09 Jul = 21:50 SGT the same day.
    expect(formatSingaporeTimestamp("2026-07-09T13:50:00Z", NOW)).toBe("Today, 9:50 PM");
    // 17:00 UTC on 08 Jul = 01:00 SGT on 09 Jul → still "Today" in Singapore.
    expect(formatSingaporeTimestamp("2026-07-08T17:00:00Z", NOW)).toBe("Today, 1:00 AM");
  });

  test("missing or invalid values return ''", () => {
    expect(formatSingaporeTimestamp(null, NOW)).toBe("");
    expect(formatSingaporeTimestamp("not-a-date", NOW)).toBe("");
  });

  test("full format includes seconds for tooltips/details", () => {
    expect(formatSingaporeFull("2026-07-09T21:50:12+08:00")).toBe("09 Jul 2026, 9:50:12 PM");
  });
});

describe("getLogTimestamp — real backend timestamp, never invented", () => {
  test("prefers occurredAt, then createdAt, then updatedAt", () => {
    expect(getLogTimestamp({ occurredAt: "a", createdAt: "b", updatedAt: "c" })).toBe("a");
    expect(getLogTimestamp({ createdAt: "b", updatedAt: "c" })).toBe("b");
    expect(getLogTimestamp({ updatedAt: "c" })).toBe("c");
  });

  test("returns null (not a new Date) when the log has no timestamp", () => {
    expect(getLogTimestamp({ id: "x" })).toBeNull();
  });
});

describe("deriveAccessResult", () => {
  test("safe severity → Granted; suspended → Denied; intrusion → Suspicious", () => {
    expect(deriveAccessResult({ severity: "safe", type: "Gantry Access" })).toBe(ACCESS_RESULTS.GRANTED);
    expect(deriveAccessResult({ severity: "critical", type: "Suspended Access Attempt" })).toBe(ACCESS_RESULTS.DENIED);
    expect(deriveAccessResult({ severity: "critical", type: "Intrusion Alert" })).toBe(ACCESS_RESULTS.SUSPICIOUS);
  });
});

describe("filterSecurityLogs", () => {
  const LOGS = [
    { id: "u1", type: "Gantry Access", severity: "safe", personnelName: "Tan Xiu Li, Felicia", role: "FM", cameraLocation: "Biometric Gantry", createdAt: "2026-07-09T20:00:00+08:00" },
    { id: "u2", type: "Intrusion Alert", severity: "critical", personnelName: null, cameraLocation: "Main Gate", createdAt: "2026-07-08T10:00:00+08:00" },
    { id: "u3", type: "Suspended Access Attempt", severity: "critical", personnelName: "Bob Lim", role: "Staff", cameraLocation: "Biometric Gantry", createdAt: "2026-07-05T10:00:00+08:00" },
    { id: "u4", type: "Gantry Access", severity: "safe", personnelName: "Old Entry", createdAt: "2026-05-01T10:00:00+08:00" },
  ];

  test("Today filter keeps only today's Singapore-date logs", () => {
    const out = filterSecurityLogs(LOGS, { dateRange: "today" }, NOW);
    expect(out.map((l) => l.id)).toEqual(["u1"]);
  });

  test("Yesterday filter keeps only yesterday's logs", () => {
    const out = filterSecurityLogs(LOGS, { dateRange: "yesterday" }, NOW);
    expect(out.map((l) => l.id)).toEqual(["u2"]);
  });

  test("Last 7 Days keeps this week's logs and drops older ones", () => {
    const out = filterSecurityLogs(LOGS, { dateRange: "7days" }, NOW);
    expect(out.map((l) => l.id)).toEqual(["u1", "u2", "u3"]);
  });

  test("event-type filters map to Granted / Denied / Suspicious", () => {
    expect(filterSecurityLogs(LOGS, { eventType: "granted" }, NOW).map((l) => l.id)).toEqual(["u1", "u4"]);
    expect(filterSecurityLogs(LOGS, { eventType: "denied" }, NOW).map((l) => l.id)).toEqual(["u3"]);
    expect(filterSecurityLogs(LOGS, { eventType: "suspicious" }, NOW).map((l) => l.id)).toEqual(["u2"]);
  });

  test("search matches person name, role, and camera location", () => {
    expect(filterSecurityLogs(LOGS, { search: "felicia" }, NOW).map((l) => l.id)).toEqual(["u1"]);
    expect(filterSecurityLogs(LOGS, { search: "staff" }, NOW).map((l) => l.id)).toEqual(["u3"]);
    expect(filterSecurityLogs(LOGS, { search: "main gate" }, NOW).map((l) => l.id)).toEqual(["u2"]);
    // Unknown persons are findable by the displayed "Unknown Person" label.
    expect(filterSecurityLogs(LOGS, { search: "unknown" }, NOW).map((l) => l.id)).toEqual(["u2"]);
  });

  test("filters combine, and no matches yields an empty list", () => {
    const out = filterSecurityLogs(LOGS, { dateRange: "today", eventType: "suspicious" }, NOW);
    expect(out).toEqual([]);
  });

  test("hasActiveFilters is false only for the defaults", () => {
    expect(hasActiveFilters({ dateRange: "all", eventType: "all", search: "" })).toBeFalsy();
    expect(hasActiveFilters({ dateRange: "today", eventType: "all", search: "" })).toBeTruthy();
    expect(hasActiveFilters({ dateRange: "all", eventType: "granted", search: "" })).toBeTruthy();
    expect(hasActiveFilters({ dateRange: "all", eventType: "all", search: "bob" })).toBeTruthy();
  });
});
