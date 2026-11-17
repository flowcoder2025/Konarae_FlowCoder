import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

/**
 * Admin password login throttle: fixed-window counters in Postgres
 * (`admin_login_buckets`), one row per bucket.
 *
 * Every attempt (failed or successful) takes one slot, in this order, over a
 * fixed 15-minute window that starts with the first attempt in the bucket:
 *   1. ip:    same client IP, any email           limit 20
 *   2. pair:  same email AND same IP               limit 5
 *   3. email: same email, any IP or no IP          limit 50
 * A bucket is consumed only if every earlier bucket allowed the attempt, and
 * slots already taken in earlier buckets are not given back when a later one
 * denies (they belong to the requester's own IP and pair). With no IP only the
 * email bucket applies. One IP can therefore spend at most 5 slots of an
 * email's 50 per window (its pair limit), and at most 20 pair/email slots in
 * total (its IP limit): locking an email for everyone takes 10 or more IPs.
 *
 * Each bucket is decided with single statements only, so concurrent requests
 * can never exceed a limit and nothing is left half-done if a request dies:
 *   1. UPDATE ... SET count = count + 1 WHERE key AND window running AND count < limit
 *   2. UPDATE ... SET count = 1, windowStart = now WHERE key AND window over
 *   3. SELECT the row: running and full => denied; missing => INSERT it with
 *      count 1 (a concurrent INSERT of the same key fails with P2002: retry).
 *      Any other state means a concurrent request changed the row between the
 *      statements: retry. After 3 rounds without a decision: denied.
 * Postgres re-evaluates an UPDATE's WHERE on the newest row version after
 * waiting for a concurrent writer, so the conditional increment and reset
 * cannot overshoot or both win. No pending state, interactive transaction or
 * advisory lock is used (PgBouncer transaction pooling).
 *
 * After the decision, buckets whose window is over are deleted (best-effort;
 * errors are logged and never change the result). Decision errors propagate:
 * the caller must deny the login (fail-closed).
 *
 * Keys are HMAC-SHA256 under the Auth.js secret, never the raw email/IP.
 */

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 20;
const PAIR_LIMIT = 5;
const EMAIL_LIMIT = 50;
const MAX_ROUNDS = 3;

export const ADMIN_LOGIN_THROTTLE = Object.freeze({
  windowMs: WINDOW_MS,
  ipLimit: IP_LIMIT,
  pairLimit: PAIR_LIMIT,
  emailLimit: EMAIL_LIMIT,
});

export type ConsumeAttemptResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = { key: string; limit: number };

const logger = createLogger({ lib: "admin-login-throttle" });

/** Same lookup next-auth uses (next-auth/lib/env.js `setEnvDefaults`). */
function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Admin login throttle requires AUTH_SECRET or NEXTAUTH_SECRET");
  }
  return secret;
}

function bucketKey(secret: string, scopedInput: string): string {
  return createHmac("sha256", secret).update(`admin-login:${scopedInput}`).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buckets(secret: string, email: string, ip: string | null): Bucket[] {
  const emailBucket = { key: bucketKey(secret, `email:${email}`), limit: EMAIL_LIMIT };
  if (!ip) return [emailBucket];
  return [
    { key: bucketKey(secret, `ip:${ip}`), limit: IP_LIMIT },
    // An IP never contains "\n" (header values cannot), so the split is unambiguous.
    { key: bucketKey(secret, `pair:${email}\n${ip}`), limit: PAIR_LIMIT },
    emailBucket,
  ];
}

function denied(windowStart: Date, now: Date): ConsumeAttemptResult {
  const reopensInMs = windowStart.getTime() + WINDOW_MS - now.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(reopensInMs / 1000)) };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function tryConsume({ key, limit }: Bucket, now: Date): Promise<ConsumeAttemptResult> {
  const windowOverAt = new Date(now.getTime() - WINDOW_MS);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const taken = await prisma.adminLoginBucket.updateMany({
      where: { key, windowStart: { gt: windowOverAt }, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    if (taken.count === 1) return { allowed: true };

    const reset = await prisma.adminLoginBucket.updateMany({
      where: { key, windowStart: { lte: windowOverAt } },
      data: { count: 1, windowStart: now },
    });
    if (reset.count === 1) return { allowed: true };

    const bucket = await prisma.adminLoginBucket.findUnique({ where: { key } });
    if (bucket === null) {
      try {
        await prisma.adminLoginBucket.create({ data: { key, windowStart: now, count: 1 } });
        return { allowed: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        continue; // created concurrently: count on that row
      }
    }
    if (bucket.windowStart > windowOverAt && bucket.count >= limit) {
      return denied(bucket.windowStart, now);
    }
    // Reset, emptied or expired by a concurrent request in between: start over.
  }

  return { allowed: false, retryAfterSeconds: WINDOW_MS / 1000 };
}

async function pruneExpired(now: Date): Promise<void> {
  try {
    await prisma.adminLoginBucket.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - WINDOW_MS) } },
    });
  } catch (error) {
    logger.warn("Admin login throttle prune failed", {
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
  }
}

export async function consumeAttempt(input: {
  email: string;
  ip: string | null;
  now?: Date;
}): Promise<ConsumeAttemptResult> {
  const now = input.now ?? new Date();
  const secret = authSecret();

  let result: ConsumeAttemptResult = { allowed: true };
  for (const bucket of buckets(secret, normalizeEmail(input.email), input.ip)) {
    result = await tryConsume(bucket, now);
    if (!result.allowed) break;
  }

  await pruneExpired(now);
  return result;
}
