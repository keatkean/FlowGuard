// Backend tests — environment-based CORS allowlist.
const { buildAllowedOrigins, buildCorsOptions } = require("../../middlewares/corsOptions");

const originAllowed = (options, origin) =>
  new Promise((resolve) => options.origin(origin, (err, allowed) => resolve(allowed)));

describe("buildAllowedOrigins", () => {
  test("combines CLIENT_URL and ALLOWED_ORIGINS, trimmed and deduplicated", () => {
    const env = {
      CLIENT_URL: "http://localhost:5173/",
      ALLOWED_ORIGINS: " https://flowguard.vercel.app , http://192.168.1.20:5173, http://localhost:5173",
    };
    expect(buildAllowedOrigins(env)).toEqual([
      "http://localhost:5173",
      "https://flowguard.vercel.app",
      "http://192.168.1.20:5173",
    ]);
  });

  test("empty env → empty allowlist", () => {
    expect(buildAllowedOrigins({})).toEqual([]);
  });
});

describe("buildCorsOptions", () => {
  test("no configured origins → development allow-all WITHOUT credentials", () => {
    const options = buildCorsOptions({});
    expect(options).toEqual({ origin: "*" });
    expect(options.credentials).toBeUndefined(); // never wildcard + credentials
  });

  test("configured origins: listed origins are allowed", async () => {
    const options = buildCorsOptions({
      CLIENT_URL: "http://localhost:5173",
      ALLOWED_ORIGINS: "https://flowguard.vercel.app",
    });
    expect(await originAllowed(options, "http://localhost:5173")).toBe(true);
    expect(await originAllowed(options, "https://flowguard.vercel.app")).toBe(true);
  });

  test("configured origins: unlisted origins are rejected", async () => {
    const options = buildCorsOptions({ CLIENT_URL: "http://localhost:5173" });
    expect(await originAllowed(options, "https://evil.example.com")).toBe(false);
  });

  test("requests with no Origin header (curl / server-to-server) pass through", async () => {
    const options = buildCorsOptions({ CLIENT_URL: "http://localhost:5173" });
    expect(await originAllowed(options, undefined)).toBe(true);
  });

  test("trailing slashes on the incoming origin are tolerated", async () => {
    const options = buildCorsOptions({ CLIENT_URL: "http://localhost:5173" });
    expect(await originAllowed(options, "http://localhost:5173/")).toBe(true);
  });
});
