/**
 * `authorize` for the admin credentials provider (Node runtime only).
 *
 * The admin signs in with the email and scrypt hash configured in
 * `ADMIN_LOGIN_EMAIL` / `ADMIN_PASSWORD_HASH`, linked to the existing
 * `role=admin` User row with that email.
 *
 * Every well-formed attempt takes one throttle slot (successes too) and then
 * runs scrypt once, also for another email and also while the attempt is
 * throttled. The User table is read only after the right password for the
 * configured email. So whether an email belongs to an account is not
 * revealed by the response or its timing. The pair and email buckets cost
 * one statement each whether or not they exist yet, so earlier attempts on an
 * email do not show either. The statement count does vary with the stage
 * that denies (with an IP: 1, a read, when the IP bucket is already full; 2
 * when the IP upsert denies; 3 when the pair does; 4 when the email does or
 * nothing does; with no IP always 1), which reveals only the requester's own
 * IP or IP+email throttling: a full email-wide bucket costs the same as an
 * allowed attempt.
 *
 * Every rejection is logged with a reason and without the email, IP,
 * password or configured hash: `not_configured` (ADMIN_LOGIN_EMAIL or
 * ADMIN_PASSWORD_HASH missing) and `malformed_hash` (a hash that does not
 * parse) at error level, so operators can tell them from `invalid_credentials`.
 *
 * Any error (database, throttle) is logged the same way and the attempt is
 * denied: `authorize` returns `null` and never throws, so Auth.js reports
 * `CredentialsSignin`. A throw would surface as `error=Configuration`, and
 * @auth/core logs the request body (the plaintext password) at debug level
 * for errors thrown from `authorize`.
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getClientIp } from "./client-ip";
import { isWellFormedHash, verifyPassword } from "./password";
import { consumeAttempt, type ConsumeAttemptResult } from "./throttle";

const logger = createLogger({ lib: "admin-login" });

// RFC 5321 path limit.
const MAX_EMAIL_LENGTH = 254;
// Bounds the work per request; far above any real password.
const MAX_PASSWORD_LENGTH = 1024;

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(MAX_EMAIL_LENGTH),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type AdminCredentials = Partial<Record<"email" | "password", unknown>>;

export interface AuthorizedAdmin {
  id: string;
  email: string;
  name: string | null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

/** Name and Prisma code only: messages may carry query details. */
function logInternalError(error: unknown): void {
  logger.error("Admin login rejected", {
    reason: "internal_error",
    errorName: error instanceof Error ? error.name : typeof error,
    errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
  });
}

/**
 * The `role=admin` row whose email equals `adminEmail` after trimming and
 * lower-casing, compared here rather than in SQL: a case-insensitive Prisma
 * filter compiles to ILIKE, where `_` and `%` in the address are wildcards.
 * No match, or more than one, is no admin.
 */
async function findAdminUser(adminEmail: string): Promise<AuthorizedAdmin | null> {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true, email: true, name: true },
  });
  const matches = admins.filter((user) => normalizeEmail(user.email) === adminEmail);
  return matches.length === 1 ? matches[0] : null;
}

async function authorizeChecked(
  email: string,
  password: string,
  request: Request
): Promise<AuthorizedAdmin | null> {
  let attempt: ConsumeAttemptResult | null = null;
  let throttleError: unknown = null;
  try {
    attempt = await consumeAttempt({ email, ip: getClientIp(request) });
  } catch (error) {
    throttleError = error;
  }

  const adminEmail = normalizeEmail(process.env.ADMIN_LOGIN_EMAIL);
  // A pasted value can carry a trailing newline or spaces.
  const adminHash = process.env.ADMIN_PASSWORD_HASH?.trim() || undefined;
  const emailMatches = adminEmail !== null && adminHash !== undefined && email === adminEmail;
  // Always runs: for another email, while throttled, and when the throttle failed.
  const passwordMatches = await verifyPassword(password, emailMatches ? adminHash : undefined);

  if (attempt === null) {
    logInternalError(throttleError);
    return null;
  }

  if (!attempt.allowed) {
    logger.warn("Admin login rejected", {
      reason: "throttled",
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
    return null;
  }

  if (adminEmail === null || adminHash === undefined) {
    logger.error("Admin login rejected", { reason: "not_configured" });
    return null;
  }

  if (!isWellFormedHash(adminHash)) {
    logger.error("Admin login rejected", { reason: "malformed_hash" });
    return null;
  }

  if (!emailMatches || !passwordMatches) {
    logger.warn("Admin login rejected", { reason: "invalid_credentials" });
    return null;
  }

  const user = await findAdminUser(adminEmail);
  if (!user) {
    logger.warn("Admin login rejected", { reason: "no_admin_user" });
    return null;
  }

  logger.info("Admin login succeeded", { userId: user.id });
  return user;
}

export async function authorizeAdmin(
  credentials: AdminCredentials,
  request: Request
): Promise<AuthorizedAdmin | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    logger.warn("Admin login rejected", { reason: "invalid_input" });
    return null;
  }

  try {
    return await authorizeChecked(parsed.data.email, parsed.data.password, request);
  } catch (error) {
    logInternalError(error);
    return null;
  }
}
