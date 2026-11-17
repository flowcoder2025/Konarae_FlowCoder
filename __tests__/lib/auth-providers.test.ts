/**
 * The admin credentials provider is registered in the Node-only auth
 * (`auth.ts`), next to the social providers from the Edge config.
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
  default: jest.fn((options: Record<string, unknown>) => ({
    id: "credentials",
    type: "credentials",
    options,
  })),
}));

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({ name: "prisma-adapter" })),
}));

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

jest.mock("@/lib/admin-login/authorize", () => ({
  authorizeAdmin: jest.fn(),
}));

import NextAuth from "next-auth";
import "@/lib/auth";
import { authConfig } from "@/lib/auth.config";
import { authorizeAdmin } from "@/lib/admin-login/authorize";
import { ADMIN_CREDENTIALS_ID } from "@/lib/admin-login/constants";

type ProviderStub = { id: string; type: string; options?: Record<string, unknown> };

const nextAuthMock = NextAuth as unknown as jest.Mock;

function fullConfig() {
  expect(nextAuthMock).toHaveBeenCalledTimes(1);
  return nextAuthMock.mock.calls[0][0] as { providers: ProviderStub[]; adapter: unknown };
}

describe("auth.ts", () => {
  it("keeps the social providers and adds the admin credentials provider", () => {
    const providers = fullConfig().providers;

    expect(providers.map((p) => p.id)).toEqual(["kakao", "google", "credentials"]);

    const credentials = providers.filter((p) => p.type === "credentials");
    expect(credentials).toHaveLength(1);
    expect(credentials[0].options).toMatchObject({
      id: ADMIN_CREDENTIALS_ID,
      credentials: { email: {}, password: {} },
    });
    expect(credentials[0].options?.authorize).toBe(authorizeAdmin);
  });

  it("uses the Prisma adapter", () => {
    expect(fullConfig().adapter).toEqual({ name: "prisma-adapter" });
  });

  it("leaves credentials providers out of the Edge config", () => {
    const edgeProviders = authConfig.providers as unknown as ProviderStub[];

    expect(edgeProviders.map((p) => p.id)).toEqual(["kakao", "google"]);
    expect(edgeProviders.some((p) => p.type === "credentials")).toBe(false);
  });
});
