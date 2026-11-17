import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

/**
 * Admin password login throttle: counters in Postgres (`admin_login_buckets`),
 * one row per bucket per fixed 15-minute window.
 *
 * Windows are fixed epoch windows: window index = floor(now / 15 min), so
 * every counter resets at the same quarter-hour boundaries. The window index
 * is part of each bucket's key, so each window has its own row and there is no
 * reset path.
 *
 * Every attempt (failed or successful) is counted, in this order:
 *   1. ip:    same client IP, any email           limit 20
 *   2. pair:  same email AND same IP               limit 5
 *   3. email: same email, any IP or no IP          limit 50
 * An attempt reaches a bucket only if every earlier bucket allowed it. A
 * denied attempt still counts in the bucket that denied it (it never reaches
 * the later ones), and counts already taken in earlier buckets are not given
 * back (they belong to the requester's own IP and pair). With no IP only the
 * email bucket applies. One IP can therefore spend at most 5 of an email's 50
 * slots per window (its pair limit) and touch at most 20 pair/email buckets
 * (its IP limit): locking an email for everyone takes 10 or more IPs.
 *
 * Each bucket is one statement, a native upsert:
 *   INSERT ... (count 1) ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count
 * and the attempt is allowed iff the returned count is at most the limit.
 * Postgres serializes concurrent upserts of one key, so each gets a distinct
 * count and exactly `limit` of them are allowed. The statement is the same
 * whether or not the bucket exists, so the work done does not reveal that.
 * No read-then-write, interactive transaction or advisory lock (PgBouncer
 * transaction pooling), and nothing is left half-done if a request dies.
 *
 * After the decision, rows older than the previous window are deleted
 * (best-effort; errors are logged and never change the result). The previous
 * window is kept so that a request whose clock is just behind a boundary
 * still counts on its window's existing row instead of recreating it.
 * Decision errors propagate: the caller must deny the login (fail-closed).
 *
 * Keys are HMAC-SHA256 under the Auth.js secret, never the raw email/IP.
 */

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 20;
const PAIR_LIMIT = 5;
const EMAIL_LIMIT = 50;

export const ADMIN_LOGIN_THROTTLE = Object.freeze({
  windowMs: WINDOW_MS,
  ipLimit: IP_LIMIT,
  pairLimit: PAIR_LIMIT,
  emailLimit: EMAIL_LIMIT,
});

export type ConsumeAttemptResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = { key: string; limit: number };
type Window = { index: number; start: Date };

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

function windowOf(now: Date): Window {
  const index = Math.floor(now.getTime() / WINDOW_MS);
  return { index, start: new Date(index * WINDOW_MS) };
}

// The window index (digits) is always the last "\n"-separated part and an IP
// never contains "\n" (header values cannot), so every input splits one way.
function buckets(secret: string, email: string, ip: string | null, window: number): Bucket[] {
  const emailBucket = { key: bucketKey(secret, `email:${email}\n${window}`), limit: EMAIL_LIMIT };
  if (!ip) return [emailBucket];
  return [
    { key: bucketKey(secret, `ip:${ip}\n${window}`), limit: IP_LIMIT },
    { key: bucketKey(secret, `pair:${email}\n${ip}\n${window}`), limit: PAIR_LIMIT },
    emailBucket,
  ];
}

async function tryConsume({ key, limit }: Bucket, window: Window, now: Date): Promise<ConsumeAttemptResult> {
  const { count } = await prisma.adminLoginBucket.upsert({
    where: { key },
    create: { key, windowStart: window.start, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  if (count <= limit) return { allowed: true };

  const reopensInMs = window.start.getTime() + WINDOW_MS - now.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(reopensInMs / 1000)) };
}

async function pruneOldWindows(window: Window): Promise<void> {
  try {
    await prisma.adminLoginBucket.deleteMany({
      where: { windowStart: { lt: new Date(window.start.getTime() - WINDOW_MS) } },
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
  const window = windowOf(now);

  let result: ConsumeAttemptResult = { allowed: true };
  for (const bucket of buckets(secret, normalizeEmail(input.email), input.ip, window.index)) {
    result = await tryConsume(bucket, window, now);
    if (!result.allowed) break;
  }

  await pruneOldWindows(window);
  return result;
}
