/**
 * The admin password marker (`adminAuthAt`) on the JWT and the session.
 *
 * Only a sign-in through the admin credentials provider may set it. In
 * @auth/core 0.41.0 a client can POST /api/auth/session with `{ data }`, which
 * reaches the jwt callback as `{ token, trigger: "update", session: data }`
 * (lib/index.js L57-59 -> lib/actions/session.js L28-32), and whatever the
 * callback returns is re-encoded into the cookie (session.js L46). So the
 * callback must never read `session`.
 *
 * @jest-environment node
 */

import type { Account, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "google" })),
}));

jest.mock("next-auth/providers/kakao", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "kakao" })),
}));

import { authConfig } from "@/lib/auth.config";
import { ADMIN_CREDENTIALS_ID } from "@/lib/admin-login/constants";

const NOW = Date.UTC(2026, 10, 17, 3, 0, 0);
const EARLIER = NOW - 60 * 60 * 1000;
const USER = { id: "admin-1", email: "admin@example.com", name: "Admin" } as User;

type JwtParams = Parameters<NonNullable<NonNullable<typeof authConfig.callbacks>["jwt"]>>[0];
type SessionParams = Parameters<NonNullable<NonNullable<typeof authConfig.callbacks>["session"]>>[0];

function jwt(params: Partial<JwtParams> & { token: JWT }) {
  const callback = authConfig.callbacks?.jwt;
  if (!callback) throw new Error("jwt callback is missing");
  return callback(params as JwtParams) as Promise<JWT | null>;
}

function session(token: JWT): Promise<Session> {
  const callback = authConfig.callbacks?.session;
  if (!callback) throw new Error("session callback is missing");
  const base = {
    user: { id: "", name: "Admin", email: "admin@example.com", image: null },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
  return callback({ session: base, token } as unknown as SessionParams) as Promise<Session>;
}

function account(provider: string, type: Account["type"]): Account {
  return { provider, type, providerAccountId: "provider-account-1" } as Account;
}

function freshToken(extra: Partial<JWT> = {}): JWT {
  return { name: "Admin", email: "admin@example.com", sub: "admin-1", ...extra };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ADMIN_CREDENTIALS_ID", () => {
  it("is the credentials provider id", () => {
    expect(ADMIN_CREDENTIALS_ID).toBe("admin-credentials");
  });
});

describe("authConfig.callbacks.jwt", () => {
  it("stamps adminAuthAt on an admin credentials sign-in", async () => {
    const token = await jwt({
      token: freshToken(),
      user: USER,
      account: account(ADMIN_CREDENTIALS_ID, "credentials"),
      trigger: "signIn",
    });

    expect(token?.adminAuthAt).toBe(NOW);
    expect(token?.id).toBe("admin-1");
    // Typed access: the JWT augmentation must give a number, not unknown.
    const at: number | undefined = token?.adminAuthAt;
    expect(at).toBe(NOW);
  });

  it.each([
    ["kakao", "oauth", "signIn"],
    ["google", "oidc", "signIn"],
    ["kakao", "oauth", "signUp"],
    ["google", "oidc", "signUp"],
  ] as const)("clears an existing marker on a %s %s (%s)", async (provider, type, trigger) => {
    const token = await jwt({
      token: freshToken({ adminAuthAt: EARLIER }),
      user: USER,
      account: account(provider, type),
      trigger,
    });

    expect(token).not.toHaveProperty("adminAuthAt");
    expect(token?.id).toBe("admin-1");
  });

  it("does not stamp a social sign-in", async () => {
    const token = await jwt({
      token: freshToken(),
      user: USER,
      account: account("kakao", "oauth"),
      trigger: "signIn",
    });

    expect(token).not.toHaveProperty("adminAuthAt");
  });

  it.each([
    ["the admin provider id with a non-credentials type", account(ADMIN_CREDENTIALS_ID, "oauth")],
    ["another provider id with the credentials type", account("credentials", "credentials")],
    ["no account", null],
  ])("does not stamp a sign-in with %s", async (_label, acct) => {
    const token = await jwt({
      token: freshToken({ adminAuthAt: EARLIER }),
      user: USER,
      account: acct,
      trigger: "signIn",
    });

    expect(token).not.toHaveProperty("adminAuthAt");
  });

  it("ignores an update that tries to add the marker", async () => {
    const token = await jwt({
      token: freshToken({ id: "user-1" }),
      trigger: "update",
      session: { adminAuthAt: NOW, user: { adminAuthAt: NOW } },
    });

    expect(token).not.toHaveProperty("adminAuthAt");
  });

  it.each([
    ["a newer time", NOW],
    ["a string", "now"],
    ["null", null],
  ])("ignores an update that tries to change the marker to %s", async (_label, value) => {
    const token = await jwt({
      token: freshToken({ id: "admin-1", adminAuthAt: EARLIER }),
      trigger: "update",
      session: { adminAuthAt: value },
    });

    expect(token?.adminAuthAt).toBe(EARLIER);
  });

  it("ignores the session argument without a trigger as well", async () => {
    const token = await jwt({
      token: freshToken({ id: "user-1" }),
      session: { adminAuthAt: NOW },
    });

    expect(token).not.toHaveProperty("adminAuthAt");
  });

  it("keeps the marker on later plain calls", async () => {
    const signedIn = await jwt({
      token: freshToken(),
      user: USER,
      account: account(ADMIN_CREDENTIALS_ID, "credentials"),
      trigger: "signIn",
    });

    jest.setSystemTime(NOW + 5 * 60 * 60 * 1000);
    const later = await jwt({ token: { ...signedIn! } });
    const evenLater = await jwt({ token: { ...later! } });

    expect(later?.adminAuthAt).toBe(NOW);
    expect(evenLater?.adminAuthAt).toBe(NOW);
    expect(evenLater?.id).toBe("admin-1");
  });
});

describe("authConfig.callbacks.session", () => {
  it("exposes a numeric marker", async () => {
    const result = await session(freshToken({ id: "admin-1", adminAuthAt: EARLIER }));

    expect(result.adminAuthAt).toBe(EARLIER);
    expect(result.user.id).toBe("admin-1");
  });

  it.each([
    ["missing", undefined],
    ["a numeric string", String(EARLIER)],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an object", { at: EARLIER }],
  ])("does not expose a marker that is %s", async (_label, value) => {
    const token = freshToken({ id: "user-1" }) as Record<string, unknown>;
    if (value !== undefined) token.adminAuthAt = value;

    const result = await session(token as JWT);

    expect(result).not.toHaveProperty("adminAuthAt");
    expect(result.user.id).toBe("user-1");
  });
});
