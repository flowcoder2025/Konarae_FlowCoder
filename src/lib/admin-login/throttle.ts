import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Admin password login throttle, backed by Postgres (`admin_login_attempts`).
 *
 * Buckets, each over a 15-minute window and counting only real failures
 * (`success = false AND blocked = false`):
 * - pair:  same email AND same IP (IP unknown: `ipHash IS NULL`)  limit 5
 * - ip:    same IP, any email (skipped when the IP is unknown)    limit 20
 * - email: same email, any IP (including unknown)                 limit 50
 *
 * Every attempt is first written as a pending failure in its own autocommitted
 * statement, and only then are the buckets counted (the row just written
 * included). If any bucket is over its limit, that row is updated to
 * `blocked = true` and the attempt is denied. Allowed rows are never blocked,
 * so they are never excluded later: the (L+1)-th allowed insert into a bucket
 * would have seen the L earlier allowed rows plus itself and been denied.
 * Concurrent requests therefore cannot exceed a limit. Do not wrap the steps
 * in one REPEATABLE READ / SERIALIZABLE transaction (its snapshot would hide
 * concurrent rows), and keep to single statements (PgBouncer transaction
 * pooling: no session state, no advisory locks).
 *
 * Consequences:
 * - Denied (blocked) attempts count toward no limit, so retrying while locked
 *   neither extends the lock nor spills into the IP / email-wide buckets. A
 *   lock clears 15 minutes after the limit-th most recent real failure.
 * - A success marks only its own row; earlier failures stay in the window.
 * - DB errors propagate (the caller must deny the login: fail-closed).
 *
 * Keys are HMAC-SHA256 under the Auth.js secret, never the raw email/IP.
 */

const WINDOW_MS = 15 * 60 * 1000;
const PAIR_LIMIT = 5;
const IP_LIMIT = 20;
const EMAIL_LIMIT = 50;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export const ADMIN_LOGIN_THROTTLE = Object.freeze({
  windowMs: WINDOW_MS,
  pairLimit: PAIR_LIMIT,
  ipLimit: IP_LIMIT,
  emailLimit: EMAIL_LIMIT,
  retentionMs: RETENTION_MS,
});

export type RegisterAttemptResult =
  | { allowed: true; attemptId: string }
  | { allowed: false; retryAfterSeconds: number };

type Bucket = {
  where: Pick<Prisma.AdminLoginAttemptWhereInput, "keyHash" | "ipHash">;
  limit: number;
};
type FailureRow = { id: string; createdAt: Date };

/** Same lookup next-auth uses (next-auth/lib/env.js `setEnvDefaults`). */
function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Admin login throttle requires AUTH_SECRET or NEXTAUTH_SECRET");
  }
  return secret;
}

function hashKey(secret: string, kind: "email" | "ip", value: string): string {
  return createHmac("sha256", secret).update(`admin-login:${kind}:${value}`).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Newest real failures in the window for one bucket, capped at limit + 1 rows
 * (enough to tell "over the limit" and to find the limit-th newest other row).
 */
function recentFailures(bucket: Bucket, windowStart: Date): Promise<FailureRow[]> {
  return prisma.adminLoginAttempt.findMany({
    where: { ...bucket.where, success: false, blocked: false, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "desc" },
    take: bucket.limit + 1,
    select: { id: true, createdAt: true },
  });
}

/**
 * For a bucket that was over its limit: when a new attempt (which adds its own
 * row) would fit again, assuming no further attempts. The denied row is now
 * blocked and no longer counts, so this is when the limit-th newest of the
 * other rows leaves the window.
 */
function bucketReopensAt(rows: FailureRow[], limit: number, ownId: string): number {
  const others = rows.filter((row) => row.id !== ownId);
  return others[limit - 1].createdAt.getTime() + WINDOW_MS;
}

async function pruneOldAttempts(): Promise<void> {
  await prisma.adminLoginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  });
}

export async function registerAttempt(input: {
  email: string;
  ip: string | null;
  now?: Date;
}): Promise<RegisterAttemptResult> {
  const now = input.now ?? new Date();
  const secret = authSecret();
  const keyHash = hashKey(secret, "email", normalizeEmail(input.email));
  const ipHash = typeof input.ip === "string" ? hashKey(secret, "ip", input.ip) : null;

  // 1. Record the attempt as a pending failure (committed before anything is counted).
  const attempt = await prisma.adminLoginAttempt.create({
    data: { keyHash, ipHash, success: false, blocked: false, createdAt: now },
    select: { id: true },
  });

  // 2. Count real failures in the window per bucket, including the row just written.
  const buckets: Bucket[] = [
    { where: { keyHash, ipHash }, limit: PAIR_LIMIT },
    ...(ipHash === null ? [] : [{ where: { ipHash }, limit: IP_LIMIT }]),
    { where: { keyHash }, limit: EMAIL_LIMIT },
  ];
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const counted = await Promise.all(buckets.map((bucket) => recentFailures(bucket, windowStart)));

  const exceeded = buckets
    .map((bucket, i) => ({ bucket, rows: counted[i] }))
    .filter(({ bucket, rows }) => rows.length > bucket.limit);
  if (exceeded.length === 0) {
    return { allowed: true, attemptId: attempt.id };
  }

  // 3. Denied: the row stops counting toward any limit.
  await prisma.adminLoginAttempt.update({
    where: { id: attempt.id },
    data: { blocked: true },
  });
  await pruneOldAttempts();

  const reopensAt = Math.max(
    ...exceeded.map(({ bucket, rows }) => bucketReopensAt(rows, bucket.limit, attempt.id))
  );
  const retryAfterSeconds = Math.max(1, Math.ceil((reopensAt - now.getTime()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

export async function markAttemptSucceeded(attemptId: string): Promise<void> {
  await prisma.adminLoginAttempt.update({
    where: { id: attemptId },
    data: { success: true },
  });
  await pruneOldAttempts();
}
