/**
 * Authentication Utilities
 * Helper functions for auth checks and role validation
 *
 * Admin = role "admin" in the database AND an admin password sign-in
 * (`session.adminAuthAt`) within ADMIN_SESSION_MAX_AGE_MS. A social (Kakao,
 * Google) session is never an admin, whatever the role. `judgeAdmin` below is
 * the only place that decides this; `getAdminSession`, `requireAdmin` and the
 * admin page guard all go through it.
 */

import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APIErrors } from "@/lib/api-error";
import { ADMIN_SESSION_MAX_AGE_MS } from "@/lib/admin-login/constants";

// Tolerated clock difference between the instance that stamped the marker
// and the one checking it.
const CLOCK_SKEW_MS = 60 * 1000;

/** Role lookup on every call (no caching), so a revoked role applies at once. */
async function hasAdminRole(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user?.role === "admin";
}

function hasRecentAdminSignIn(session: Session, now: number): boolean {
  const adminAuthAt: unknown = session.adminAuthAt;
  if (typeof adminAuthAt !== "number" || !Number.isFinite(adminAuthAt)) return false;
  if (adminAuthAt > now + CLOCK_SKEW_MS) return false;
  return now - adminAuthAt < ADMIN_SESSION_MAX_AGE_MS;
}

/**
 * The admin judgement for a session already read in this request. The
 * sign-in marker is checked before the database, so social sessions never
 * reach Prisma. Database errors propagate.
 */
async function judgeAdmin(session: Session | null): Promise<Session | null> {
  const userId = session?.user?.id;
  if (!session || !userId) return null;
  if (!hasRecentAdminSignIn(session, Date.now())) return null;
  if (!(await hasAdminRole(userId))) return null;
  return session;
}

/**
 * The current session if it belongs to an admin (see the module comment),
 * otherwise null.
 */
export async function getAdminSession(): Promise<Session | null> {
  return judgeAdmin(await auth());
}

/**
 * Get current session or throw
 */
export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.id) {
    throw APIErrors.unauthorized("인증이 필요합니다");
  }

  return session;
}

/**
 * Require an admin session or throw: 401 without a session, 403 otherwise.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();

  const adminSession = await judgeAdmin(session);

  if (!adminSession) {
    throw APIErrors.forbidden("관리자 권한이 필요합니다");
  }

  return adminSession;
}
