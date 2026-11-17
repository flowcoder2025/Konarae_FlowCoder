/**
 * The admin judgement: role=admin in the database AND an admin password
 * sign-in (`adminAuthAt`) within the last 12 hours. Rows follow the state
 * table in the admin password login plan.
 *
 * @jest-environment node
 */

import type { Session } from "next-auth";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APIError } from "@/lib/api-error";
import { ADMIN_SESSION_MAX_AGE_MS } from "@/lib/admin-login/constants";
import * as authUtils from "@/lib/auth-utils";
import { getAdminSession, requireAdmin, requireAuth } from "@/lib/auth-utils";

const mockAuth = auth as unknown as jest.Mock;
const mockFindUnique = prisma.user.findUnique as unknown as jest.Mock;

const NOW = Date.UTC(2026, 10, 17, 3, 0, 0);
const HOUR = 60 * 60 * 1000;

function session(userId: string | undefined, adminAuthAt?: unknown): Session {
  const value = {
    user: userId === undefined ? { email: "someone@example.com" } : { id: userId },
    expires: "2099-01-01T00:00:00.000Z",
  } as Record<string, unknown>;
  if (adminAuthAt !== undefined) value.adminAuthAt = adminAuthAt;
  return value as unknown as Session;
}

function roleIs(role: string | null) {
  mockFindUnique.mockResolvedValue(role === null ? null : { role });
}

async function apiStatus(): Promise<number | "passed"> {
  try {
    await requireAdmin();
    return "passed";
  } catch (error) {
    if (error instanceof APIError) return error.statusCode;
    throw error;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("auth-utils exports", () => {
  it("does not export a role-only admin check", () => {
    expect(Object.keys(authUtils)).not.toContain("isAdmin");
  });
});

describe("state table: getAdminSession and requireAdmin", () => {
  it("no session: null / 401, no database lookup", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(getAdminSession()).resolves.toBeNull();
    expect(await apiStatus()).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("a session without a user id counts as no session", async () => {
    mockAuth.mockResolvedValue(session(undefined, NOW - HOUR));
    roleIs("admin");

    await expect(getAdminSession()).resolves.toBeNull();
    expect(await apiStatus()).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["role=user", "user"],
    ["role=admin", "admin"],
  ])("social session, %s: null / 403, never reaches the database", async (_label, role) => {
    mockAuth.mockResolvedValue(session("user-1"));
    roleIs(role);

    await expect(getAdminSession()).resolves.toBeNull();
    expect(await apiStatus()).toBe(403);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("password admin: returns the session / passes", async () => {
    const current = session("admin-1", NOW - HOUR);
    mockAuth.mockResolvedValue(current);
    roleIs("admin");

    await expect(getAdminSession()).resolves.toBe(current);
    await expect(requireAdmin()).resolves.toBe(current);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { role: true },
    });
  });

  it("checks the role on every call", async () => {
    mockAuth.mockResolvedValue(session("admin-1", NOW - HOUR));
    roleIs("admin");

    await getAdminSession();
    await getAdminSession();
    await requireAdmin();

    expect(mockFindUnique).toHaveBeenCalledTimes(3);
  });

  it("password sign-in older than 12 hours: null / 403, never reaches the database", async () => {
    mockAuth.mockResolvedValue(session("admin-1", NOW - ADMIN_SESSION_MAX_AGE_MS - 1));
    roleIs("admin");

    await expect(getAdminSession()).resolves.toBeNull();
    expect(await apiStatus()).toBe(403);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["role revoked to user", "user"],
    ["user row deleted", null],
  ])("password sign-in, then %s: null / 403", async (_label, role) => {
    mockAuth.mockResolvedValue(session("admin-1", NOW - HOUR));
    roleIs(role);

    await expect(getAdminSession()).resolves.toBeNull();
    expect(await apiStatus()).toBe(403);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { role: true },
    });
  });

  it("surfaces a database failure instead of answering", async () => {
    mockAuth.mockResolvedValue(session("admin-1", NOW - HOUR));
    mockFindUnique.mockRejectedValue(new Error("db down"));

    await expect(getAdminSession()).rejects.toThrow("db down");
    await expect(requireAdmin()).rejects.toThrow("db down");
  });

  it("keeps the 401 and 403 error shapes", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message: "인증이 필요합니다",
    });

    mockAuth.mockResolvedValue(session("user-1"));
    await expect(requireAdmin()).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "관리자 권한이 필요합니다",
    });
  });
});

describe("adminAuthAt validation", () => {
  beforeEach(() => {
    roleIs("admin");
  });

  it.each([
    ["just signed in", NOW],
    ["one minute short of 12 hours ago", NOW - ADMIN_SESSION_MAX_AGE_MS + 60_000],
    ["1 ms short of 12 hours ago", NOW - ADMIN_SESSION_MAX_AGE_MS + 1],
    ["30 seconds in the future (clock skew)", NOW + 30_000],
  ])("accepts a sign-in %s", async (_label, at) => {
    mockAuth.mockResolvedValue(session("admin-1", at));

    await expect(getAdminSession()).resolves.not.toBeNull();
  });

  it.each([
    ["exactly 12 hours ago", NOW - ADMIN_SESSION_MAX_AGE_MS],
    ["12 hours and 1 ms ago", NOW - ADMIN_SESSION_MAX_AGE_MS - 1],
    ["far in the past", 0],
    ["more than a minute in the future", NOW + 61_000],
    ["far in the future", NOW + 365 * 24 * HOUR],
    ["a numeric string", String(NOW - HOUR)],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["null", null],
    ["a boolean", true],
  ])("rejects a marker that is %s, before any database lookup", async (_label, at) => {
    mockAuth.mockResolvedValue(session("admin-1", at));

    await expect(getAdminSession()).resolves.toBeNull();
    expect(await apiStatus()).toBe(403);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("expires a session that was valid a moment ago", async () => {
    mockAuth.mockResolvedValue(session("admin-1", NOW - ADMIN_SESSION_MAX_AGE_MS + 1000));
    await expect(getAdminSession()).resolves.not.toBeNull();

    jest.setSystemTime(NOW + 1000);
    await expect(getAdminSession()).resolves.toBeNull();
  });
});

describe("requireAuth", () => {
  it("still accepts any signed-in user", async () => {
    const current = session("user-1");
    mockAuth.mockResolvedValue(current);

    await expect(requireAuth()).resolves.toBe(current);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
