/**
 * The admin password marker (`adminAuthAt`) through the REAL Auth.js request
 * handler: `Auth()` from the @auth/core copy that next-auth itself resolves,
 * the real callbacks of src/lib/auth.config.ts (with its real Kakao/Google
 * providers) and a Credentials provider registered like auth.ts does. Only
 * `authorize` is a stub (the real one needs the database). Requests are
 * HTTP-shaped: cookies, the CSRF double submit, form and JSON bodies. A
 * next-auth / @auth/core upgrade that changes how a sign-in, the CSRF check or
 * a session update reaches the jwt callback fails here, while the unit tests
 * of the callbacks (auth-admin-marker.test.ts) would still pass.
 *
 * Loading: next-auth and @auth/core are ESM only, which jest's CommonJS module
 * system cannot load. They are loaded with Node's own `require` (require of
 * ES modules: Node >= 20.19 or >= 22.12), outside jest's registry. The
 * TypeScript under test (auth.config.ts) still goes through jest.
 *
 * @jest-environment node
 */

import type { NextAuthConfig } from "next-auth";

type NativeRequire = (id: string) => unknown;

/**
 * Node's own `require`, resolving from `fromFile`. Named `mock*` so the
 * jest.mock factories below may call it.
 */
function mockNativeRequire(fromFile: string): NativeRequire {
  const { getBuiltinModule } = process as { getBuiltinModule?: (id: string) => unknown };
  if (typeof getBuiltinModule !== "function") {
    throw new Error(
      `Node ${process.version} lacks process.getBuiltinModule; this test needs Node >= 20.19 or >= 22.12 to load ESM-only next-auth natively.`
    );
  }
  const { createRequire } = getBuiltinModule("node:module") as typeof import("node:module");
  return createRequire(fromFile);
}

/** An ESM package loaded natively, shaped for jest's CommonJS interop. */
function mockNativeModule(id: string): Record<string, unknown> {
  const fromProjectRoot = mockNativeRequire(`${process.cwd()}/package.json`);
  return { __esModule: true, ...(fromProjectRoot(id) as Record<string, unknown>) };
}

// auth.config.ts imports these; give it the real (natively loaded) providers.
jest.mock("next-auth/providers/google", () => mockNativeModule("next-auth/providers/google"));
jest.mock("next-auth/providers/kakao", () => mockNativeModule("next-auth/providers/kakao"));

import { authConfig } from "@/lib/auth.config";
import { ADMIN_CREDENTIALS_ID } from "@/lib/admin-login/constants";

type JwtPayload = Record<string, unknown>;
type AuthHandler = (request: Request, config: NextAuthConfig) => Promise<Response>;

// The @auth/core copy next-auth uses (resolved from next-auth's own directory).
const fromNextAuth = mockNativeRequire(require.resolve("next-auth"));
const { Auth } = fromNextAuth("@auth/core") as { Auth: AuthHandler };
const { encode, decode } = fromNextAuth("@auth/core/jwt") as {
  encode: (params: { token: JwtPayload; secret: string; salt: string }) => Promise<string>;
  decode: (params: { token: string; secret: string; salt: string }) => Promise<JwtPayload | null>;
};
const Credentials = (mockNativeModule("next-auth/providers/credentials") as {
  default: (options: Record<string, unknown>) => NextAuthConfig["providers"][number];
}).default;

const ORIGIN = "http://localhost";
const SECRET = "auth-core-flow-test-secret-not-a-real-one-0123456789";
// Plain-http cookie names; the session cookie name is also the JWT salt.
const SESSION_COOKIE = "authjs.session-token";
const CSRF_COOKIE = "authjs.csrf-token";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "fixture password for the auth flow test";
const ADMIN_USER = { id: "admin-1", email: ADMIN_EMAIL, name: "Admin" };

const SOCIAL_TOKEN: JwtPayload = {
  name: "Social User",
  email: "user@example.com",
  sub: "user-1",
  id: "user-1",
  socialClaim: "set by a kakao sign-in",
};

// Returns null for anything but the fixture pair: Auth.js turns null into
// CredentialsSignin itself (a thrown error from this jest realm would not be
// an instance of the native AuthError).
const authorize = jest.fn(async (credentials: Partial<Record<string, unknown>>) =>
  credentials.email === ADMIN_EMAIL && credentials.password === ADMIN_PASSWORD ? { ...ADMIN_USER } : null
);

type Callbacks = NonNullable<NextAuthConfig["callbacks"]>;

function makeConfig(callbacks: Callbacks = authConfig.callbacks ?? {}): NextAuthConfig {
  return {
    ...authConfig,
    callbacks,
    // Like auth.ts: the Edge providers plus the admin credentials provider.
    providers: [
      ...authConfig.providers,
      Credentials({ id: ADMIN_CREDENTIALS_ID, credentials: { email: {}, password: {} }, authorize }),
    ],
    secret: SECRET,
    trustHost: true,
    basePath: "/api/auth",
    debug: false,
    logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  };
}

type Jar = Record<string, string>;

function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/** Cookies a response sets (name -> value; a cleared cookie has value ""). */
function setCookies(response: Response): Jar {
  const jar: Jar = {};
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
  }
  return jar;
}

function sessionCookies(response: Response): Jar {
  return Object.fromEntries(
    Object.entries(setCookies(response)).filter(([name, value]) => name.startsWith(SESSION_COOKIE) && value !== "")
  );
}

async function sessionPayload(response: Response): Promise<JwtPayload> {
  const value = setCookies(response)[SESSION_COOKIE];
  if (!value) throw new Error("no session cookie was set");
  const payload = await decode({ token: value, secret: SECRET, salt: SESSION_COOKIE });
  if (!payload) throw new Error("session cookie did not decode");
  return payload;
}

function mintSocialToken(): Promise<string> {
  return encode({ token: SOCIAL_TOKEN, secret: SECRET, salt: SESSION_COOKIE });
}

/** GET /api/auth/csrf: the token for the body and the cookie it pairs with. */
async function fetchCsrf(config: NextAuthConfig, jar: Jar = {}): Promise<{ token: string; cookie: string }> {
  const response = await Auth(
    new Request(`${ORIGIN}/api/auth/csrf`, { headers: { cookie: cookieHeader(jar) } }),
    config
  );
  expect(response.status).toBe(200);
  const { csrfToken } = (await response.json()) as { csrfToken: string };
  const cookie = setCookies(response)[CSRF_COOKIE] ?? jar[CSRF_COOKIE];
  if (!csrfToken || !cookie) throw new Error("no CSRF token");
  return { token: csrfToken, cookie };
}

/** POST /api/auth/callback/admin-credentials, as the sign-in form's signIn() does. */
async function passwordSignIn(
  config: NextAuthConfig,
  password: string,
  { csrf = true, jar = {} as Jar } = {}
): Promise<Response> {
  const cookies = { ...jar };
  const body = new URLSearchParams({ email: ADMIN_EMAIL, password, callbackUrl: "/admin" });
  if (csrf) {
    const { token, cookie } = await fetchCsrf(config, cookies);
    cookies[CSRF_COOKIE] = cookie;
    body.set("csrfToken", token);
  }
  return Auth(
    new Request(`${ORIGIN}/api/auth/callback/${ADMIN_CREDENTIALS_ID}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(cookies) },
      body,
    }),
    config
  );
}

/** POST /api/auth/session { csrfToken, data }: what useSession().update(data) sends. */
async function sessionUpdate(config: NextAuthConfig, sessionToken: string, data: unknown): Promise<Response> {
  const jar: Jar = { [SESSION_COOKIE]: sessionToken };
  const { token, cookie } = await fetchCsrf(config, jar);
  jar[CSRF_COOKIE] = cookie;
  return Auth(
    new Request(`${ORIGIN}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
      body: JSON.stringify({ csrfToken: token, data }),
    }),
    config
  );
}

function redirectError(response: Response) {
  const location = response.headers.get("location");
  if (!location) throw new Error("expected a redirect");
  const url = new URL(location);
  return { path: url.pathname, error: url.searchParams.get("error"), code: url.searchParams.get("code") };
}

beforeEach(() => {
  authorize.mockClear();
});

describe("admin password sign-in through the real Auth() handler", () => {
  it("rejects a credentials callback without the CSRF token before calling authorize", async () => {
    const response = await passwordSignIn(makeConfig(), ADMIN_PASSWORD, { csrf: false });

    expect(response.status).toBe(302);
    expect(redirectError(response)).toMatchObject({ path: "/login", error: "MissingCSRF" });
    expect(sessionCookies(response)).toEqual({});
    expect(authorize).not.toHaveBeenCalled();
  });

  it("signs in with the CSRF token and stamps a numeric adminAuthAt on the session cookie", async () => {
    const config = makeConfig();
    const before = Date.now();
    const response = await passwordSignIn(config, ADMIN_PASSWORD);
    const after = Date.now();
    // A configuration problem would be logged here rather than thrown.
    expect(config.logger?.error).not.toHaveBeenCalled();
    expect(config.logger?.warn).not.toHaveBeenCalled();

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/admin");
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize.mock.calls[0][0]).toMatchObject({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    const payload = await sessionPayload(response);
    expect(typeof payload.adminAuthAt).toBe("number");
    expect(payload.adminAuthAt as number).toBeGreaterThanOrEqual(before);
    expect(payload.adminAuthAt as number).toBeLessThanOrEqual(after);
    expect(payload).toMatchObject({ sub: ADMIN_USER.id, id: ADMIN_USER.id, email: ADMIN_EMAIL });
  });

  it("exposes the marker on GET /api/auth/session", async () => {
    const signIn = await passwordSignIn(makeConfig(), ADMIN_PASSWORD);
    const { adminAuthAt } = await sessionPayload(signIn);

    const response = await Auth(
      new Request(`${ORIGIN}/api/auth/session`, {
        headers: { cookie: cookieHeader({ [SESSION_COOKIE]: setCookies(signIn)[SESSION_COOKIE] }) },
      }),
      makeConfig()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ adminAuthAt, user: { id: ADMIN_USER.id } });
  });

  it("does not let a session update add adminAuthAt to a social token", async () => {
    const social = await mintSocialToken();
    const now = Date.now();

    const response = await sessionUpdate(makeConfig(), social, {
      adminAuthAt: now,
      user: { adminAuthAt: now },
    });

    expect(response.status).toBe(200);
    const session = (await response.json()) as Record<string, unknown>;
    expect(session).not.toHaveProperty("adminAuthAt");
    // The token was re-issued (so the update really ran) and is still the social one.
    const payload = await sessionPayload(response);
    expect(payload).not.toHaveProperty("adminAuthAt");
    expect(payload).toMatchObject({ sub: "user-1", id: "user-1", socialClaim: SOCIAL_TOKEN.socialClaim });
  });

  it("control: the same update request does reach the jwt callback as trigger=update with the posted data", async () => {
    // Proves the previous test is not passing vacuously: a jwt callback that
    // trusted `session` would receive the marker from this very request.
    const realJwt = authConfig.callbacks?.jwt;
    if (!realJwt) throw new Error("jwt callback is missing");
    const trusting: Callbacks = {
      ...authConfig.callbacks,
      async jwt(params) {
        const token = await realJwt(params);
        const posted = (params.session as { adminAuthAt?: unknown } | undefined)?.adminAuthAt;
        return params.trigger === "update" && token ? { ...token, adminAuthAt: posted } : token;
      },
    };
    const social = await mintSocialToken();
    const now = Date.now();

    const response = await sessionUpdate(makeConfig(trusting), social, { adminAuthAt: now });

    expect(response.status).toBe(200);
    expect((await sessionPayload(response)).adminAuthAt).toBe(now);
  });

  it("replaces a social token on a password sign-in: adminAuthAt set, old claims gone", async () => {
    const social = await mintSocialToken();
    const before = Date.now();

    const response = await passwordSignIn(makeConfig(), ADMIN_PASSWORD, { jar: { [SESSION_COOKIE]: social } });

    expect(response.status).toBe(302);
    const payload = await sessionPayload(response);
    expect(payload.adminAuthAt as number).toBeGreaterThanOrEqual(before);
    expect(payload).toMatchObject({ sub: ADMIN_USER.id, id: ADMIN_USER.id, email: ADMIN_EMAIL });
    expect(payload).not.toHaveProperty("socialClaim");
    expect(payload.email).not.toBe(SOCIAL_TOKEN.email);
  });

  it("redirects a wrong password with CredentialsSignin and sets no session cookie", async () => {
    const response = await passwordSignIn(makeConfig(), `${ADMIN_PASSWORD}!`);

    expect(response.status).toBe(302);
    expect(redirectError(response)).toEqual({ path: "/login", error: "CredentialsSignin", code: "credentials" });
    expect(sessionCookies(response)).toEqual({});
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});
