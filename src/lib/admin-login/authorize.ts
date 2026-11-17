/**
 * `authorize` for the admin credentials provider (Node runtime only).
 *
 * The admin signs in with the email and scrypt hash configured in
 * `ADMIN_LOGIN_EMAIL` / `ADMIN_PASSWORD_HASH`, linked to the existing
 * `role=admin` User row with that email.
 *
 * Every well-formed attempt does the same work up to the password check: one
 * throttle write, then one scrypt run, also for another email or while the
 * attempt is throttled. Timing therefore does not reveal whether the email is
 * the admin's or whether it is locked. Database errors propagate, which makes
 * Auth.js reject the sign-in (fail-closed).
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getClientIp } from "./client-ip";
import { verifyPassword } from "./password";
import { markAttemptSucceeded, registerAttempt } from "./throttle";

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

function normalizeEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
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
  const { email, password } = parsed.data;

  const attempt = await registerAttempt({ email, ip: getClientIp(request) });

  const adminEmail = normalizeEmail(process.env.ADMIN_LOGIN_EMAIL);
  const adminHash = process.env.ADMIN_PASSWORD_HASH || undefined;
  const emailMatches = adminEmail !== null && adminHash !== undefined && email === adminEmail;
  // Always runs, even when the email is wrong or the attempt is throttled.
  const passwordMatches = await verifyPassword(password, emailMatches ? adminHash : undefined);

  if (!attempt.allowed) {
    logger.warn("Admin login rejected", {
      reason: "throttled",
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
    return null;
  }

  if (!emailMatches || !passwordMatches) {
    logger.warn("Admin login rejected", { reason: "invalid_credentials" });
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, role: "admin" },
    select: { id: true, email: true, name: true },
  });

  // Exact check on top of the case-insensitive lookup.
  if (!user || normalizeEmail(user.email) !== adminEmail) {
    logger.warn("Admin login rejected", { reason: "no_admin_user" });
    return null;
  }

  await markAttemptSucceeded(attempt.attemptId);
  logger.info("Admin login succeeded", { userId: user.id });

  return { id: user.id, email: user.email, name: user.name };
}
