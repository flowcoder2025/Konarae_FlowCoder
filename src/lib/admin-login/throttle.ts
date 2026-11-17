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
 * An attempt reaches a bucket only if every earlier bucket allowed it. An
 * attempt denied by a bucket's upsert still counts in that bucket (it never
 * reaches the later ones), and counts already taken in earlier buckets are not
 * given back (they belong to the requester's own IP and pair). An attempt that
 * finds its IP bucket already full is denied without counting anywhere (see
 * the IP read below). With no IP only the email bucket applies. One IP can
 * therefore spend at most 5 of an email's 50 slots per window (its pair limit)
 * and touch at most 20 pair/email buckets (its IP limit): locking an email for
 * everyone takes 10 or more IPs.
 *
 * Each bucket is decided by one statement, a native upsert:
 *   INSERT ... (count 1) ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count
 * and the attempt is allowed iff the returned count is at most the limit.
 * Postgres serializes concurrent upserts of one key, so each gets a distinct
 * count and exactly `limit` of them are allowed. The pair and email stages are
 * only that statement, the same whether or not the bucket exists, so the work
 * done does not reveal earlier attempts on an email.
 *
 * The IP stage first reads its row (`findUnique`) and, if the count is already
 * at the limit, denies without writing. Under PgBouncer (`pgbouncer=true`)
 * Prisma wraps every statement in BEGIN ... COMMIT, so a flood from one IP that
 * kept upserting would serialize on that one hot row's lock while holding
 * pooled server connections; once the row is full the flood only reads. The
 * read never allows anything by itself: below the limit the upsert still
 * decides, so a stale read (another instance filled the row in between) is
 * denied by the upsert and the exact limits under concurrency are unchanged.
 * The read reveals only the requester's own IP state. No interactive
 * transaction or advisory lock (PgBouncer transaction pooling), and nothing is
 * left half-done if a request dies.
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

/** `readFirst`: skip the write when the row is already at the limit (the IP stage). */
type Bucket = { key: string; limit: number; readFirst?: boolean };
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
    { key: bucketKey(secret, `ip:${ip}\n${window}`), limit: IP_LIMIT, readFirst: true },
    { key: bucketKey(secret, `pair:${email}\n${ip}\n${window}`), limit: PAIR_LIMIT },
    emailBucket,
  ];
}

function denied(window: Window, now: Date): ConsumeAttemptResult {
  const reopensInMs = window.start.getTime() + WINDOW_MS - now.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(reopensInMs / 1000)) };
}

async function isFull({ key, limit }: Bucket): Promise<boolean> {
  const row = await prisma.adminLoginBucket.findUnique({ where: { key }, select: { count: true } });
  return row !== null && row.count >= limit;
}

async function tryConsume(bucket: Bucket, window: Window, now: Date): Promise<ConsumeAttemptResult> {
  // Only short-circuits a denial; an allow always comes from the upsert below.
  if (bucket.readFirst && (await isFull(bucket))) return denied(window, now);

  const { key, limit } = bucket;
  const { count } = await prisma.adminLoginBucket.upsert({
    where: { key },
    create: { key, windowStart: window.start, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return count <= limit ? { allowed: true } : denied(window, now);
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
