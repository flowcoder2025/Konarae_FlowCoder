/**
 * auth.ts turns Auth.js debug logging off explicitly. At debug level
 * @auth/core 0.41.0 logs the credentials request body, password included, when
 * `authorize` throws (lib/actions/callback/index.js L389 "callback route error
 * details" { method, query, body }).
 *
 * @jest-environment node
 */

jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(() => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() })),
}));

jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "google", type: "oidc" })),
}));

jest.mock("next-auth/providers/kakao", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "kakao", type: "oauth" })),
}));

jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "credentials", type: "credentials" })),
}));

jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: jest.fn(() => ({})) }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/admin-login/authorize", () => ({ authorizeAdmin: jest.fn() }));

import NextAuth from "next-auth";
import "@/lib/auth";

describe("auth.ts", () => {
  it("passes debug: false to NextAuth", () => {
    const nextAuthMock = NextAuth as unknown as jest.Mock;
    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    const config = nextAuthMock.mock.calls[0][0] as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(config, "debug")).toBe(true);
    expect(config.debug).toBe(false);
  });
});
