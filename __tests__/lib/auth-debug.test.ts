/**
 * auth.ts turns Auth.js debug logging off explicitly. At debug level
 * @auth/core 0.41.0 logs the credentials request body, password included, when
 * `authorize` throws (lib/actions/callback/index.js L389 "callback route error
 * details" { method, query, body }).
 *
 * It also sets an Auth.js `logger` with only `error`. @auth/core 0.41.0 calls
 * `logger.error(error)` with the thrown error as the only argument
 * (index.js L122); a failed credentials sign-in is a `CredentialsSignin`
 * (lib/actions/callback/index.js L236) whose `type` is "CredentialsSignin"
 * (errors.js L26 `this.type = this.constructor.type`, L172) while its `name`
 * is `constructor.name` (L24), which a minifier may rename. next-auth is
 * mocked here, so the real error classes come from the @auth/core copy that
 * next-auth resolves, loaded with Node's own `require` (ESM only, see
 * auth-core-flow.test.ts); hand-built errors of the same shape cover a
 * minified name.
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

type AuthLogger = { error?: (error: Error) => void; warn?: unknown; debug?: unknown };

// Captured once at import: restoreAllMocks below must not lose it.
const nextAuthCalls = [...(NextAuth as unknown as jest.Mock).mock.calls];

function nextAuthConfig(): Record<string, unknown> {
  expect(nextAuthCalls).toHaveLength(1);
  return nextAuthCalls[0][0] as Record<string, unknown>;
}

type AuthErrorClass = new (message?: string) => Error & { type: string };

/** The real @auth/core error classes (the copy next-auth itself resolves). */
function realAuthErrors(): Record<"CredentialsSignin" | "CallbackRouteError", AuthErrorClass> {
  const { getBuiltinModule } = process as { getBuiltinModule?: (id: string) => unknown };
  if (typeof getBuiltinModule !== "function") {
    throw new Error(`Node ${process.version} lacks process.getBuiltinModule; needs Node >= 20.19 or >= 22.12.`);
  }
  const { createRequire } = getBuiltinModule("node:module") as typeof import("node:module");
  const fromNextAuth = createRequire(require.resolve("next-auth"));
  return fromNextAuth("@auth/core/errors") as Record<"CredentialsSignin" | "CallbackRouteError", AuthErrorClass>;
}

/** An error shaped like an @auth/core AuthError subclass instance. */
function authError(type: string, name: string, message = `Read more at https://errors.authjs.dev#${type.toLowerCase()}`) {
  return Object.assign(new Error(message), { name, type, kind: "signIn", code: "credentials" });
}

describe("auth.ts", () => {
  it("passes debug: false to NextAuth", () => {
    const config = nextAuthConfig();

    expect(Object.prototype.hasOwnProperty.call(config, "debug")).toBe(true);
    expect(config.debug).toBe(false);
  });

  describe("Auth.js logger", () => {
    let consoleSpies: Record<"log" | "info" | "warn" | "error" | "debug", jest.SpyInstance>;
    const logger = () => nextAuthConfig().logger as AuthLogger;

    beforeEach(() => {
      consoleSpies = {
        log: jest.spyOn(console, "log").mockImplementation(() => undefined),
        info: jest.spyOn(console, "info").mockImplementation(() => undefined),
        warn: jest.spyOn(console, "warn").mockImplementation(() => undefined),
        error: jest.spyOn(console, "error").mockImplementation(() => undefined),
        debug: jest.spyOn(console, "debug").mockImplementation(() => undefined),
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("overrides only error: a debug entry would replace the no-op that debug: false installs", () => {
      expect(Object.keys(logger())).toEqual(["error"]);
      expect(logger().debug).toBeUndefined();
      expect(typeof logger().error).toBe("function");
    });

    it.each([
      ["the real @auth/core class", () => new (realAuthErrors().CredentialsSignin)()],
      ["its class name", () => authError("CredentialsSignin", "CredentialsSignin")],
      ["a minified class name", () => authError("CredentialsSignin", "e")],
    ])("reports CredentialsSignin (%s) as one warn line without a stack", (_label, make) => {
      const error = make();
      expect(error.stack).toBeTruthy();

      logger().error!(error);

      expect(consoleSpies.error).not.toHaveBeenCalled();
      expect(consoleSpies.log).not.toHaveBeenCalled();
      expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
      const args = consoleSpies.warn.mock.calls[0];
      expect(args).toHaveLength(1);
      const line = String(args[0]);
      expect(line).not.toContain("\n");
      expect(line).toContain("CredentialsSignin");
      expect(line).not.toContain(" at ");
      expect(line).not.toContain(String(error.stack).split("\n")[1].trim());
      expect(JSON.parse(line)).toMatchObject({ level: "warn" });
    });

    it.each([
      ["the real @auth/core CallbackRouteError", () => new (realAuthErrors().CallbackRouteError)("db down")],
      ["another Auth.js error", () => authError("CallbackRouteError", "CallbackRouteError", "db down")],
      ["an AccessDenied error", () => authError("AccessDenied", "AccessDenied")],
      ["a plain Error", () => new Error("boom")],
      ["an error named CredentialsSignin without that type", () => Object.assign(new Error("x"), { name: "CredentialsSignin" })],
    ])("forwards %s unchanged to console.error", (_label, make) => {
      const error = make();

      logger().error!(error);

      expect(consoleSpies.warn).not.toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalledTimes(1);
      expect(consoleSpies.error.mock.calls[0]).toHaveLength(1);
      expect(consoleSpies.error.mock.calls[0][0]).toBe(error);
    });
  });
});
