// Backend tests — WhatsApp service mock vs real Cloud API behavior.
const whatsapp = require("../../services/whatsappService");

const KEYS = [
  "WHATSAPP_ENABLED", "WHATSAPP_API_URL", "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_API_KEY", "WHATSAPP_PHONE_NUMBER_ID",
];

let snapshot;
let origFetch;

beforeEach(() => {
  // Clean slate for env; restore exactly after each test.
  snapshot = {};
  KEYS.forEach((k) => { snapshot[k] = process.env[k]; delete process.env[k]; });
  origFetch = global.fetch;
});

afterEach(() => {
  KEYS.forEach((k) => {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  });
  global.fetch = origFetch;
  jest.restoreAllMocks();
});

const enableReal = () => {
  process.env.WHATSAPP_ENABLED = "true";
  process.env.WHATSAPP_API_URL = "https://graph.facebook.com/v20.0";
  process.env.WHATSAPP_ACCESS_TOKEN = "EAAtoken1234567890";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID123";
};

const okFetch = () =>
  jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.X" }] }) });

describe("normalizePhone", () => {
  test("SG formats normalize to 65XXXXXXXX", () => {
    expect(whatsapp.normalizePhone("+6591540822")).toBe("6591540822");
    expect(whatsapp.normalizePhone("91540822")).toBe("6591540822");
    expect(whatsapp.normalizePhone("65 9154-0822")).toBe("6591540822");
    expect(whatsapp.normalizePhone("+65 9154 0822")).toBe("6591540822");
  });
});

describe("mock mode (WHATSAPP_ENABLED not 'true')", () => {
  test("simulates and does NOT call the API", async () => {
    global.fetch = jest.fn();
    const res = await whatsapp.sendMessage("+6591234567", "hi");
    expect(res).toEqual(expect.objectContaining({ success: true, simulated: true }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("real mode (WHATSAPP_ENABLED='true')", () => {
  test("builds the correct endpoint + payload and uses the access token", async () => {
    enableReal();
    global.fetch = okFetch();

    const res = await whatsapp.sendMessage("+65 9154 0822", "hello");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v20.0/PNID123/messages");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer EAAtoken1234567890");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "6591540822",
      type: "text",
      text: { preview_url: false, body: "hello" },
    });
    expect(res).toEqual(expect.objectContaining({ success: true, simulated: false }));
  });

  test("8-digit SG number becomes 65XXXXXXXX in the payload", async () => {
    enableReal();
    global.fetch = okFetch();
    await whatsapp.sendMessage("91540822", "x");
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.to).toBe("6591540822");
  });

  test("falls back to WHATSAPP_API_KEY when ACCESS_TOKEN is unset", async () => {
    process.env.WHATSAPP_ENABLED = "true";
    process.env.WHATSAPP_API_URL = "https://graph.facebook.com/v20.0";
    process.env.WHATSAPP_API_KEY = "FALLBACKkey123456";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID123";
    global.fetch = okFetch();
    await whatsapp.sendMessage("+6591234567", "x");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer FALLBACKkey123456");
  });

  test("API failure returns a safe failure object and does NOT throw", async () => {
    enableReal();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: { message: "Invalid recipient" } }),
    });
    const res = await whatsapp.sendMessage("+6591234567", "x");
    expect(res).toEqual(expect.objectContaining({ success: false, simulated: false, error: "Invalid recipient" }));
  });

  test("network throw is caught and returns a safe failure", async () => {
    enableReal();
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    const res = await whatsapp.sendMessage("+6591234567", "x");
    expect(res.success).toBe(false);
    expect(res.simulated).toBe(false);
  });

  test("missing token / phone id returns a safe failure without calling the API", async () => {
    process.env.WHATSAPP_ENABLED = "true";
    process.env.WHATSAPP_API_URL = "https://graph.facebook.com/v20.0";
    // no token, no phone id
    global.fetch = jest.fn();
    const res = await whatsapp.sendMessage("+6591234567", "x");
    expect(res).toEqual(expect.objectContaining({ success: false, simulated: false }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("masking helpers", () => {
  test("token shows first 6 + last 4 only", () => {
    expect(whatsapp._maskToken("EAAtoken1234567890")).toBe("EAAtok...7890");
    expect(whatsapp._maskToken("")).toBe("(none)");
  });
  test("phone shows last 4 only", () => {
    expect(whatsapp._maskPhone("6591540822")).toBe("****0822");
  });
});
