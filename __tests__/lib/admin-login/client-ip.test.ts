/**
 * @jest-environment node
 */

import { getClientIp } from "@/lib/admin-login/client-ip";

const ORIGINAL_VERCEL = process.env.VERCEL;

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://mate.example.test/api/auth/callback/admin-credentials", {
    method: "POST",
    headers,
  });
}

afterEach(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
});

describe("getClientIp off Vercel", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["a value other than 1", "true"],
  ])("returns null when VERCEL is %s, even with client IP headers", (_label, value) => {
    if (value === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = value;

    const request = requestWith({
      "x-real-ip": "203.0.113.1",
      "x-vercel-forwarded-for": "203.0.113.2",
      "x-forwarded-for": "203.0.113.3, 10.0.0.1",
    });

    expect(getClientIp(request)).toBeNull();
  });
});

describe("getClientIp on Vercel", () => {
  beforeEach(() => {
    process.env.VERCEL = "1";
  });

  it("prefers x-real-ip", () => {
    const request = requestWith({
      "x-real-ip": "203.0.113.1",
      "x-vercel-forwarded-for": "203.0.113.2",
      "x-forwarded-for": "203.0.113.3",
    });

    expect(getClientIp(request)).toBe("203.0.113.1");
  });

  it("falls back to x-vercel-forwarded-for", () => {
    const request = requestWith({
      "x-vercel-forwarded-for": "203.0.113.2",
      "x-forwarded-for": "203.0.113.3",
    });

    expect(getClientIp(request)).toBe("203.0.113.2");
  });

  it("falls back to the first x-forwarded-for value", () => {
    const request = requestWith({ "x-forwarded-for": " 203.0.113.3 , 10.0.0.1, 10.0.0.2" });

    expect(getClientIp(request)).toBe("203.0.113.3");
  });

  it("trims whitespace", () => {
    expect(getClientIp(requestWith({ "x-real-ip": "  2001:db8::1  " }))).toBe("2001:db8::1");
  });

  it("skips blank headers and uses the next one", () => {
    const request = requestWith({
      "x-real-ip": "   ",
      "x-vercel-forwarded-for": "",
      "x-forwarded-for": "203.0.113.3",
    });

    expect(getClientIp(request)).toBe("203.0.113.3");
  });

  it("returns null when every header is missing or blank", () => {
    expect(getClientIp(requestWith({}))).toBeNull();
    expect(getClientIp(requestWith({ "x-real-ip": " ", "x-forwarded-for": " , 10.0.0.1" }))).toBeNull();
  });

  it("caps an oversized value", () => {
    const huge = "9".repeat(10_000);
    const ip = getClientIp(requestWith({ "x-real-ip": huge }));

    expect(ip).not.toBeNull();
    expect(ip!.length).toBeLessThanOrEqual(64);
    expect(huge.startsWith(ip!)).toBe(true);
  });
});

describe("production warning when there is no client IP", () => {
  type ClientIpModule = typeof import("@/lib/admin-login/client-ip");
  const HEADERS = {
    "x-real-ip": "203.0.113.1",
    "x-vercel-forwarded-for": "203.0.113.2",
    "x-forwarded-for": "203.0.113.3, 10.0.0.1",
  };
  let warn: jest.SpyInstance;
  let others: jest.SpyInstance[];

  /** A fresh module, so the once-per-process flag starts unset. */
  function freshModule(): ClientIpModule {
    let mod: ClientIpModule | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("@/lib/admin-login/client-ip") as ClientIpModule;
    });
    return mod as ClientIpModule;
  }

  function warnings(): Array<{ level: string; message: string; context: Record<string, unknown> }> {
    return warn.mock.calls.map((args) => JSON.parse(String(args[0])));
  }

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    others = (["log", "info", "error", "debug"] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("warns once per process in production when VERCEL is not 1, never logging header values", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    delete process.env.VERCEL;
    const { getClientIp } = freshModule();

    expect(getClientIp(requestWith(HEADERS))).toBeNull();
    expect(getClientIp(requestWith(HEADERS))).toBeNull();
    expect(getClientIp(requestWith({}))).toBeNull();

    expect(warnings()).toHaveLength(1);
    const [entry] = warnings();
    expect(entry.level).toBe("warn");
    expect(entry.message).toMatch(/IP limit/i);
    expect(entry.message).toMatch(/system env/i);
    expect(entry.context).toMatchObject({ reason: "vercel_system_env_not_exposed" });
    const text = warn.mock.calls.flat().map(String).join("\n");
    for (const value of ["203.0.113.1", "203.0.113.2", "203.0.113.3", "10.0.0.1"]) {
      expect(text).not.toContain(value);
    }
    others.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it("warns once in production on Vercel when no IP header is present", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    process.env.VERCEL = "1";
    const { getClientIp } = freshModule();

    expect(getClientIp(requestWith({ "x-real-ip": " " }))).toBeNull();
    expect(getClientIp(requestWith({}))).toBeNull();

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0].context).toMatchObject({ reason: "no_client_ip_header" });
  });

  it("does not warn when an IP is found", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");
    process.env.VERCEL = "1";
    const { getClientIp } = freshModule();

    expect(getClientIp(requestWith(HEADERS))).toBe("203.0.113.1");
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["test", "development"])("does not warn when NODE_ENV is %s", (nodeEnv) => {
    jest.replaceProperty(process.env, "NODE_ENV", nodeEnv);
    delete process.env.VERCEL;
    const { getClientIp } = freshModule();

    expect(getClientIp(requestWith(HEADERS))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
