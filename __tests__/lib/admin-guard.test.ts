/**
 * requireAdminPage uses the real admin judgement from auth-utils; only the
 * session and the database are mocked. Rows follow the plan's state table
 * (`/admin/**` column).
 *
 * @jest-environment node
 */

import type { Session } from "next-auth";
import { requireAdminPage } from "@/lib/admin-guard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_MAX_AGE_MS } from "@/lib/admin-login/constants";

class RedirectSignal extends Error {
  constructor(public readonly location: string) {
    super(`NEXT_REDIRECT ${location}`);
  }
}

jest.mock("next/navigation", () => ({
  redirect: jest.fn((location: string) => {
    throw new RedirectSignal(location);
  }),
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const mockAuth = auth as unknown as jest.Mock;
const mockFindUnique = prisma.user.findUnique as unknown as jest.Mock;

const ADMIN_LOGIN = "/admin-login?callbackUrl=%2Fadmin";
const HOUR = 60 * 60 * 1000;

function session(userId: string | undefined, adminAuthAt?: number): Session {
  return {
    user: userId === undefined ? { email: "a@example.com" } : { id: userId },
    expires: "2099-01-01T00:00:00.000Z",
    ...(adminAuthAt === undefined ? {} : { adminAuthAt }),
  } as Session;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requireAdminPage", () => {
  it.each([
    ["no session", null],
    ["a session without a user id", session(undefined)],
  ])("sends a visitor with %s to the admin sign-in", async (_label, current) => {
    mockAuth.mockResolvedValue(current);

    await expect(requireAdminPage()).rejects.toMatchObject({ location: ADMIN_LOGIN });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["role=user", "user"],
    ["role=admin", "admin"],
  ])("sends a social session with %s to the admin sign-in without a database lookup", async (_label, role) => {
    mockAuth.mockResolvedValue(session("user-1"));
    mockFindUnique.mockResolvedValue({ role });

    await expect(requireAdminPage()).rejects.toMatchObject({ location: ADMIN_LOGIN });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("lets a password admin through", async () => {
    mockAuth.mockResolvedValue(session("admin-1", Date.now() - HOUR));
    mockFindUnique.mockResolvedValue({ role: "admin" });

    await expect(requireAdminPage()).resolves.toBeUndefined();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "admin-1" }, select: { role: true } });
  });

  it("sends a password sign-in older than 12 hours to the admin sign-in", async () => {
    mockAuth.mockResolvedValue(session("admin-1", Date.now() - ADMIN_SESSION_MAX_AGE_MS - 60_000));
    mockFindUnique.mockResolvedValue({ role: "admin" });

    await expect(requireAdminPage()).rejects.toMatchObject({ location: ADMIN_LOGIN });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("sends a password sign-in whose role was revoked to the admin sign-in", async () => {
    mockAuth.mockResolvedValue(session("admin-1", Date.now() - HOUR));
    mockFindUnique.mockResolvedValue({ role: "user" });

    await expect(requireAdminPage()).rejects.toMatchObject({ location: ADMIN_LOGIN });
  });

  it("surfaces a database failure instead of redirecting", async () => {
    mockAuth.mockResolvedValue(session("admin-1", Date.now() - HOUR));
    mockFindUnique.mockRejectedValue(new Error("db down"));

    await expect(requireAdminPage()).rejects.toThrow("db down");
  });
});
