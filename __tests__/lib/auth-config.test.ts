/**
 * @jest-environment node
 */

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";

jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "google" })),
}));

jest.mock("next-auth/providers/kakao", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "kakao" })),
}));

import { authConfig } from "@/lib/auth.config";
import { config as middlewareConfig } from "@/middleware";

jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(() => ({ auth: jest.fn() })),
}));

const ORIGIN = "https://mate.flow-coder.com";
const SIGNED_IN: Session = { user: { id: "user-1" }, expires: "2099-01-01T00:00:00.000Z" };

async function authorize(path: string, auth: Session | null = null) {
  const authorized = authConfig.callbacks?.authorized;
  if (!authorized) throw new Error("authorized callback is missing");
  const request = { nextUrl: new URL(path, ORIGIN) } as unknown as NextRequest;
  return authorized({ auth, request });
}

function locationOf(result: unknown): string {
  if (!(result instanceof Response)) throw new Error(`expected a redirect, got ${String(result)}`);
  expect(result.status).toBeGreaterThanOrEqual(300);
  expect(result.status).toBeLessThan(400);
  return result.headers.get("Location") ?? "";
}

describe("authConfig.callbacks.authorized", () => {
  it("uses /login as the sign-in and error page", () => {
    expect(authConfig.pages).toEqual({ signIn: "/login", error: "/login" });
  });

  it("does not redirect an anonymous request for the sign-in page", async () => {
    expect(await authorize("/login")).toBe(true);
    expect(await authorize("/login?callbackUrl=%2Fadmin")).toBe(true);
  });

  it("redirects an anonymous /admin request to the admin sign-in on the same origin", async () => {
    expect(locationOf(await authorize("/admin"))).toBe(`${ORIGIN}/admin-login?callbackUrl=%2Fadmin`);
    expect(locationOf(await authorize("/admin/crawler?tab=jobs"))).toBe(
      `${ORIGIN}/admin-login?callbackUrl=%2Fadmin%2Fcrawler%3Ftab%3Djobs`
    );
  });

  // State table, middleware column: a signed-in request reaches the page, whose
  // guard then decides (social and expired sessions go to /admin-login).
  it("lets a signed-in request through to /admin", async () => {
    expect(await authorize("/admin", SIGNED_IN)).toBe(true);
    expect(await authorize("/admin/users", SIGNED_IN)).toBe(true);
  });

  it("does not redirect the admin sign-in page, with or without a session", async () => {
    expect(await authorize("/admin-login")).toBe(true);
    expect(await authorize("/admin-login?callbackUrl=%2Fadmin&error=1")).toBe(true);
    expect(await authorize("/admin-login", SIGNED_IN)).toBe(true);
  });

  it("sends /admin-login sub-paths to the admin sign-in page", async () => {
    expect(locationOf(await authorize("/admin-login/x"))).toBe(`${ORIGIN}/admin-login`);
    expect(locationOf(await authorize("/admin-login/x", SIGNED_IN))).toBe(`${ORIGIN}/admin-login`);
  });

  it("keeps sending other anonymous protected pages to the social sign-in", async () => {
    expect(locationOf(await authorize("/reports"))).toBe(`${ORIGIN}/login?callbackUrl=%2Freports`);
  });

  it("still redirects legacy routes to /projects", async () => {
    expect(locationOf(await authorize("/dashboard"))).toBe(`${ORIGIN}/projects`);
    expect(locationOf(await authorize("/matching/results/1", SIGNED_IN))).toBe(`${ORIGIN}/projects`);
  });

  it("keeps public routes open", async () => {
    expect(await authorize("/")).toBe(true);
    expect(await authorize("/projects/abc")).toBe(true);
  });

  it("serves public files to an anonymous request", async () => {
    expect(await authorize("/Flow_icon.png")).toBe(true);
    expect(await authorize("/opengraph-image.png")).toBe(true);
    expect(await authorize("/manifest.webmanifest")).toBe(true);
  });
});

describe("middleware matcher", () => {
  const [pattern] = middlewareConfig.matcher;
  const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

  it("runs on the sign-in pages, admin pages, and legacy routes", () => {
    expect(matches("/login")).toBe(true);
    expect(matches("/admin-login")).toBe(true);
    expect(matches("/admin-login/x")).toBe(true);
    expect(matches("/admin")).toBe(true);
    expect(matches("/admin/crawler")).toBe(true);
    expect(matches("/dashboard")).toBe(true);
  });

  it("runs on public files, so the route decision alone opens them", () => {
    // Excluding them here by extension would also skip page paths that end in
    // a file extension.
    expect(matches("/Flow_icon.png")).toBe(true);
    expect(matches("/opengraph-image.png")).toBe(true);
    expect(matches("/fonts/NotoSansKR-Regular.ttf")).toBe(true);
    expect(matches("/manifest.webmanifest")).toBe(true);
    expect(matches("/admin/Flow_icon.png")).toBe(true);
  });

  it("skips API routes and Next.js assets", () => {
    expect(matches("/api/auth/callback/google")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
  });
});
