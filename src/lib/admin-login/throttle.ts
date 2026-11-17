import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Admin password login throttle, backed by Postgres (`admin_login_attempts`).
 *
 * Every attempt is first written as a failure in its own autocommitted
 * statement, and only then are failures in the window counted. A request
 * therefore always sees its own row plus every row committed before it, so
 * concurrent requests cannot all slip under the limit. Do not wrap the two
 * steps in one REPEATABLE READ / SERIALIZABLE transaction: its snapshot would
 * hide concurrent rows.
 *
 * Semantics:
 * - An attempt is allowed iff, counting the row just written, failures in the
 *   last 15 minutes are <= 5 for the email and (when ip is known) <= 20 for
 *   the IP.
 * - Denied attempts are recorded as failures too, so retrying while locked
 *   extends the lock.
 * - A success marks only its own row; earlier failures stay in the window.
 * - DB errors propagate (the caller must deny the login: fail-closed).
 *
 * Keys are HMAC-SHA256 under the Auth.js secret, never the raw email/IP.
 */

const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export const ADMIN_LOGIN_THROTTLE = Object.freeze({
  windowMs: WINDOW_MS,
  emailLimit: EMAIL_LIMIT,
  ipLimit: IP_LIMIT,
  retentionMs: RETENTION_MS,
});

export type RegisterAttemptResult =
  | { allowed: true; attemptId: string }
  | { allowed: false; retryAfterSeconds: number };

type Bucket = { keyHash: string } | { ipHash: string };

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
 * Newest failures in the window for one bucket, capped at limit + 1 rows
 * (enough to tell "over the limit" and to find the limit-th newest row).
 */
function recentFailures(bucket: Bucket, windowStart: Date, limit: number) {
  return prisma.adminLoginAttempt.findMany({
    where: { ...bucket, success: false, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: { createdAt: true },
  });
}

/**
 * When a new attempt (which adds its own row) would fit under `limit` for this
 * bucket, assuming no further attempts: once the limit-th newest failure has
 * left the window. Null if the bucket already has room.
 */
function bucketReopensAt(rows: { createdAt: Date }[], limit: number): number | null {
  if (rows.length < limit) return null;
  return rows[limit - 1].createdAt.getTime() + WINDOW_MS;
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

  // 1. Record the attempt as a failure (committed before anything is counted).
  const attempt = await prisma.adminLoginAttempt.create({
    data: { keyHash, ipHash, success: false, createdAt: now },
    select: { id: true },
  });

  // 2. Count failures in the window, including the row just written.
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const [emailRows, ipRows] = await Promise.all([
    recentFailures({ keyHash }, windowStart, EMAIL_LIMIT),
    ipHash === null ? Promise.resolve(null) : recentFailures({ ipHash }, windowStart, IP_LIMIT),
  ]);

  const emailOver = emailRows.length > EMAIL_LIMIT;
  const ipOver = ipRows !== null && ipRows.length > IP_LIMIT;
  if (!emailOver && !ipOver) {
    return { allowed: true, attemptId: attempt.id };
  }

  const reopensAt = Math.max(
    bucketReopensAt(emailRows, EMAIL_LIMIT) ?? 0,
    ipRows === null ? 0 : (bucketReopensAt(ipRows, IP_LIMIT) ?? 0)
  );
  const retryAfterSeconds = Math.max(1, Math.ceil((reopensAt - now.getTime()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

export async function markAttemptSucceeded(attemptId: string): Promise<void> {
  await prisma.adminLoginAttempt.update({
    where: { id: attemptId },
    data: { success: true },
  });
  await prisma.adminLoginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  });
}
