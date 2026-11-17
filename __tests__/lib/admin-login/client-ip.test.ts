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
