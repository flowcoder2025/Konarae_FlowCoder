/**
 * Authentication Utilities
 * Helper functions for auth checks and role validation
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Check if user is admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user?.role === "admin";
}

/**
 * Get current session or throw
 */
export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("인증이 필요합니다");
  }

  return session;
}

/**
 * Require admin role or throw
 */
export async function requireAdmin() {
  const session = await requireAuth();

  const isUserAdmin = await isAdmin(session.user.id);

  if (!isUserAdmin) {
    throw new Error("관리자 권한이 필요합니다");
  }

  return session;
}
