// Static source scan — user-facing files must not contain corrupted
// UTF-8 (mojibake) sequences such as "â€"", "ðŸ" or the replacement char.
import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";

// Classic Windows-1252-misdecoded UTF-8 lead sequences + U+FFFD.
const MOJIBAKE = /â€|ðŸ|â›|âœ\S|âš |â—|â³|â†|Ã¢|�/;

const CLIENT_SRC = path.resolve(__dirname, "../../src");
const SERVER_DIR = path.resolve(__dirname, "../../../server");

const collect = (dir, exts) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "assets") continue;
      out.push(...collect(full, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
};

describe("No corrupted mojibake sequences in user-facing sources", () => {
  test("client/src JSX, JS and CSS files are clean UTF-8", () => {
    const offenders = [];
    for (const file of collect(CLIENT_SRC, [".jsx", ".js", ".css"])) {
      const text = fs.readFileSync(file, "utf8");
      if (MOJIBAKE.test(text)) offenders.push(path.relative(CLIENT_SRC, file));
    }
    expect(offenders).toEqual([]);
  });

  test("key server route/service files are clean UTF-8", () => {
    const files = [
      "index.js",
      "routes/facialRecognition.js",
      "routes/attendance.js",
      "routes/dashboard.js",
      "routes/user.js",
      "routes/booking.js",
      "services/attendanceSummary.js",
      "services/securityAudit.js",
    ].map((f) => path.join(SERVER_DIR, f));

    const offenders = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (MOJIBAKE.test(text)) offenders.push(path.basename(file));
    }
    expect(offenders).toEqual([]);
  });
});
