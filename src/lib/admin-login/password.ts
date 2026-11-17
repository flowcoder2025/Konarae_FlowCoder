import crypto from "node:crypto";

/**
 * Admin password hashing (scrypt, Node built-in, no extra dependency).
 *
 * Stored format: `scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>`.
 * No `$` anywhere, because `.env` loaders expand `$` sequences.
 */

const DEFAULT_N = 2 ** 15;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const SALT_BYTES = 16;
const KEY_LENGTH = 32;

// Bounds a stored hash must satisfy. They keep a crafted or mistyped env value
// from requesting huge memory/CPU, and reject weaker-than-default params.
const MIN_N = DEFAULT_N;
const MIN_R = DEFAULT_R;
const MAX_R = 16;
const MIN_P = 1;
const MAX_P = 4;
const MIN_SALT_BYTES = SALT_BYTES;
const MAX_SALT_BYTES = 64;
const MIN_KEY_LENGTH = KEY_LENGTH;
const MAX_KEY_LENGTH = 64;
// scrypt's main buffer is 128 * N * r bytes.
const MAX_BLOCK_MEMORY = 64 * 1024 * 1024;
const MAX_N = MAX_BLOCK_MEMORY / (128 * MIN_R);
// OpenSSL also counts 128 * r * p (B) and a few extra blocks on top of
// 128 * N * r, so give maxmem headroom over the block bound. Every in-bounds
// hash then derives without ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const MAX_MEM = 2 * MAX_BLOCK_MEMORY;

export const SCRYPT_PARAMS = Object.freeze({
  N: DEFAULT_N,
  r: DEFAULT_R,
  p: DEFAULT_P,
  saltBytes: SALT_BYTES,
  keyLength: KEY_LENGTH,
  maxN: MAX_N,
});

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

// Fixed inputs for the dummy path. The expected bytes are not the scrypt of
// anything meaningful; the dummy path always returns false.
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0x5a);
const DUMMY_HASH = Buffer.alloc(KEY_LENGTH, 0xa5);

const DIGITS = /^[0-9]+$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Looked up on the module at call time (not promisified once) so the
    // call is observable in tests.
    crypto.scrypt(
      password,
      salt,
      keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEM },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      }
    );
  });
}

function parseInteger(value: string, min: number, max: number): number | null {
  if (!DIGITS.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

function parseBytes(value: string, min: number, max: number): Buffer | null {
  if (!BASE64URL.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < min || bytes.length > max) return null;
  // Reject non-canonical encodings (trailing bits) so one value maps to one string.
  if (bytes.toString("base64url") !== value) return null;
  return bytes;
}

function parseStoredHash(stored: string | undefined): ParsedHash | null {
  if (typeof stored !== "string" || stored.length === 0) return null;
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const N = parseInteger(parts[1], MIN_N, MAX_N);
  const r = parseInteger(parts[2], MIN_R, MAX_R);
  const p = parseInteger(parts[3], MIN_P, MAX_P);
  if (N === null || r === null || p === null) return null;
  // N must be a power of two.
  if ((N & (N - 1)) !== 0) return null;
  if (128 * N * r > MAX_BLOCK_MEMORY) return null;

  const salt = parseBytes(parts[4], MIN_SALT_BYTES, MAX_SALT_BYTES);
  const hash = parseBytes(parts[5], MIN_KEY_LENGTH, MAX_KEY_LENGTH);
  if (salt === null || hash === null) return null;

  return { N, r, p, salt, hash };
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string") {
    throw new TypeError("password must be a string");
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = await deriveKey(password, salt, KEY_LENGTH, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
  });
  return [
    "scrypt",
    DEFAULT_N,
    DEFAULT_R,
    DEFAULT_P,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

/**
 * Constant-cost verification. A missing or malformed `stored` value runs
 * scrypt against a fixed dummy hash with the default params and returns
 * false, so the caller cannot tell "no hash configured" from "wrong password"
 * by timing.
 */
export async function verifyPassword(
  password: string,
  stored: string | undefined
): Promise<boolean> {
  const passwordIsString = typeof password === "string";
  const candidate = passwordIsString ? password : "";
  const parsed = parseStoredHash(stored);

  if (parsed === null) {
    const derived = await deriveKey(candidate, DUMMY_SALT, KEY_LENGTH, {
      N: DEFAULT_N,
      r: DEFAULT_R,
      p: DEFAULT_P,
    });
    crypto.timingSafeEqual(derived, DUMMY_HASH);
    return false;
  }

  const derived = await deriveKey(candidate, parsed.salt, parsed.hash.length, parsed);
  const matches = crypto.timingSafeEqual(derived, parsed.hash);
  return matches && passwordIsString;
}
