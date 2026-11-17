/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import {
  hashPassword,
  isWellFormedHash,
  verifyPassword,
  SCRYPT_PARAMS,
} from "@/lib/admin-login/password";

const PASSWORD = "correct horse battery staple 42";

function b64url(bytes: number, fill = 1): string {
  return Buffer.alloc(bytes, fill).toString("base64url");
}

describe("hashPassword", () => {
  it("produces the scrypt:<N>:<r>:<p>:<salt>:<hash> format without '$'", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(stored).not.toContain("$");
    const parts = stored.split(":");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(SCRYPT_PARAMS.N);
    expect(Number(parts[2])).toBe(SCRYPT_PARAMS.r);
    expect(Number(parts[3])).toBe(SCRYPT_PARAMS.p);
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[5]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(parts[4], "base64url")).toHaveLength(SCRYPT_PARAMS.saltBytes);
    expect(Buffer.from(parts[5], "base64url")).toHaveLength(SCRYPT_PARAMS.keyLength);
  });

  it("uses at least N=2^15, r=8, p=1", () => {
    expect(SCRYPT_PARAMS.N).toBeGreaterThanOrEqual(2 ** 15);
    expect(SCRYPT_PARAMS.r).toBeGreaterThanOrEqual(8);
    expect(SCRYPT_PARAMS.p).toBeGreaterThanOrEqual(1);
  });

  it("produces a different hash for the same password each time", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).not.toBe(b);
    expect(a.split(":")[4]).not.toBe(b.split(":")[4]);
  });
});

describe("verifyPassword", () => {
  let stored: string;

  beforeAll(async () => {
    stored = await hashPassword(PASSWORD);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("accepts the right password (round trip)", async () => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    await expect(verifyPassword(`${PASSWORD}x`, stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("rejects when the stored hash is undefined or empty", async () => {
    await expect(verifyPassword(PASSWORD, undefined)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, "")).resolves.toBe(false);
  });

  const salt = b64url(16);
  const hash = b64url(32);
  const malformed: Array<[string, string]> = [
    ["garbage", "not-a-hash"],
    ["wrong algorithm", `bcrypt:32768:8:1:${salt}:${hash}`],
    ["too few fields", `scrypt:32768:8:1:${salt}`],
    ["too many fields", `scrypt:32768:8:1:${salt}:${hash}:extra`],
    ["N not a power of two", `scrypt:30000:8:1:${salt}:${hash}`],
    ["N not digits", `scrypt:0x8000:8:1:${salt}:${hash}`],
    ["N with sign", `scrypt:+32768:8:1:${salt}:${hash}`],
    ["N too small", `scrypt:1024:8:1:${salt}:${hash}`],
    ["N too large (memory)", `scrypt:${2 ** 20}:8:1:${salt}:${hash}`],
    ["r too large (memory)", `scrypt:32768:64:1:${salt}:${hash}`],
    ["r zero", `scrypt:32768:0:1:${salt}:${hash}`],
    ["p zero", `scrypt:32768:8:0:${salt}:${hash}`],
    ["p too large", `scrypt:32768:8:64:${salt}:${hash}`],
    ["salt with invalid characters", `scrypt:32768:8:1:${salt}$:${hash}`],
    ["hash with standard base64 characters", `scrypt:32768:8:1:${salt}:${hash.slice(0, -1)}+`],
    ["salt too short", `scrypt:32768:8:1:${b64url(4)}:${hash}`],
    ["hash too short", `scrypt:32768:8:1:${salt}:${b64url(8)}`],
    ["hash too long", `scrypt:32768:8:1:${salt}:${b64url(128)}`],
    ["empty salt", `scrypt:32768:8:1::${hash}`],
    ["whitespace around", ` scrypt:32768:8:1:${salt}:${hash}`],
  ];

  it.each(malformed)("rejects a malformed stored hash (%s)", async (_label, value) => {
    await expect(verifyPassword(PASSWORD, value)).resolves.toBe(false);
  });

  describe("isWellFormedHash", () => {
    it("accepts what hashPassword produces, and in-bounds params whose bytes do not match", () => {
      expect(isWellFormedHash(stored)).toBe(true);
      const [, n, r, p, s] = stored.split(":");
      expect(isWellFormedHash(`scrypt:${n}:${r}:${p}:${s}:${b64url(32, 7)}`)).toBe(true);
    });

    it.each([["undefined", undefined], ["empty", ""], ...malformed])("rejects %s", (_label, value) => {
      expect(isWellFormedHash(value)).toBe(false);
    });

    it("runs no scrypt", () => {
      const spy = jest.spyOn(crypto, "scrypt");
      isWellFormedHash(stored);
      isWellFormedHash("not-a-hash");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it("rejects a hash whose params are in bounds but whose bytes do not match", async () => {
    const [, n, r, p, s] = stored.split(":");
    const tampered = `scrypt:${n}:${r}:${p}:${s}:${b64url(32, 7)}`;
    await expect(verifyPassword(PASSWORD, tampered)).resolves.toBe(false);
  });

  it("accepts stronger in-bounds params (upper bound does not throw)", async () => {
    const saltBuf = Buffer.alloc(16, 3);
    const N = SCRYPT_PARAMS.maxN;
    const r = 8;
    const p = 1;
    const derived = crypto.scryptSync(PASSWORD, saltBuf, 32, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
    const strong = `scrypt:${N}:${r}:${p}:${saltBuf.toString("base64url")}:${derived.toString("base64url")}`;
    await expect(verifyPassword(PASSWORD, strong)).resolves.toBe(true);
  });

  describe("equal cost on missing or malformed input", () => {
    function scryptCallOptions(spy: jest.SpyInstance) {
      expect(spy).toHaveBeenCalledTimes(1);
      const [, saltArg, keylen, options] = spy.mock.calls[0];
      return { saltLength: (saltArg as Buffer).length, keylen, options };
    }

    it("runs scrypt for a valid stored hash", async () => {
      const spy = jest.spyOn(crypto, "scrypt");
      await verifyPassword(PASSWORD, stored);
      const call = scryptCallOptions(spy);
      expect(call.keylen).toBe(SCRYPT_PARAMS.keyLength);
      expect(call.options).toMatchObject({
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
      });
    });

    it.each([
      ["undefined", undefined],
      ["empty", ""],
      ["garbage", "not-a-hash"],
      ["out-of-bounds params", `scrypt:${2 ** 20}:8:1:${salt}:${hash}`],
    ])("runs scrypt with the default params when stored is %s", async (_label, value) => {
      const spy = jest.spyOn(crypto, "scrypt");
      await expect(verifyPassword(PASSWORD, value)).resolves.toBe(false);
      const call = scryptCallOptions(spy);
      expect(call.keylen).toBe(SCRYPT_PARAMS.keyLength);
      expect(call.saltLength).toBe(SCRYPT_PARAMS.saltBytes);
      expect(call.options).toMatchObject({
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
      });
    });

    it("always returns false on the dummy path", async () => {
      // The dummy path must always return false, whatever the password is.
      await expect(verifyPassword("", undefined)).resolves.toBe(false);
      await expect(verifyPassword("dummy", undefined)).resolves.toBe(false);
    });
  });

  it("returns false for a non-string password", async () => {
    await expect(
      verifyPassword(undefined as unknown as string, stored)
    ).resolves.toBe(false);
  });
});
