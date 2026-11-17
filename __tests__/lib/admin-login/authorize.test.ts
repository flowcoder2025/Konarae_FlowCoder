/**
 * @jest-environment node
 */

type UserRow = { id: string; email: string; name: string | null; role: string };

const mockUsers: UserRow[] = [];

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: jest.fn() } },
}));

jest.mock("@/lib/admin-login/throttle", () => ({
  consumeAttempt: jest.fn(),
}));

jest.mock("@/lib/admin-login/client-ip", () => ({
  getClientIp: jest.fn(),
}));

// The real scrypt verification, observed.
jest.mock("@/lib/admin-login/password", () => {
  const actual = jest.requireActual<typeof import("@/lib/admin-login/password")>(
    "@/lib/admin-login/password"
  );
  return { ...actual, verifyPassword: jest.fn(actual.verifyPassword) };
});

import { Prisma } from "@prisma/client";
import { authorizeAdmin } from "@/lib/admin-login/authorize";
import { getClientIp } from "@/lib/admin-login/client-ip";
import { hashPassword, verifyPassword } from "@/lib/admin-login/password";
import { consumeAttempt } from "@/lib/admin-login/throttle";
import { prisma } from "@/lib/prisma";

const mockFindMany = prisma.user.findMany as unknown as jest.Mock;
const mockConsumeAttempt = consumeAttempt as jest.MockedFunction<typeof consumeAttempt>;
const mockGetClientIp = getClientIp as jest.MockedFunction<typeof getClientIp>;
const mockVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;

// Test fixtures only: not a real account or password.
const ADMIN_EMAIL = "admin@example.com";
const PASSWORD = "unit-test-password-0123";
const CLIENT_IP = "203.0.113.9";
const ADMIN_ROW: UserRow = { id: "admin-1", email: ADMIN_EMAIL, name: "Admin", role: "admin" };

const ENV_KEYS = ["ADMIN_LOGIN_EMAIL", "ADMIN_PASSWORD_HASH"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let passwordHash: string;
let consoleSpies: jest.SpyInstance[];

function request(): Request {
  return new Request("https://mate.example.test/api/auth/callback/admin-credentials", {
    method: "POST",
  });
}

const ADMIN_QUERY = {
  where: { role: "admin" },
  select: { id: true, email: true, name: true },
};

/** Mimics Postgres for the query authorizeAdmin is expected to send. */
function findManyFromRows(args: {
  where: { role: string };
  select: Record<string, boolean>;
}): Promise<Array<Pick<UserRow, "id" | "email" | "name">>> {
  expect(args).toEqual(ADMIN_QUERY);
  return Promise.resolve(
    mockUsers
      .filter((user) => user.role === args.where.role)
      .map((user) => ({ id: user.id, email: user.email, name: user.name }))
  );
}

/** `context.reason` of every "Admin login rejected" line, in order. */
function rejectionReasons(): string[] {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => {
      try {
        return JSON.parse(String(args[0]));
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.message === "Admin login rejected")
    .map((entry) => entry.context.reason);
}

function loggedText(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => args.map((arg: unknown) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "))
    .join("\n");
}

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUsers.length = 0;
  mockUsers.push(ADMIN_ROW);
  process.env.ADMIN_LOGIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD_HASH = passwordHash;
  mockConsumeAttempt.mockResolvedValue({ allowed: true });
  mockGetClientIp.mockReturnValue(CLIENT_IP);
  mockFindMany.mockImplementation(findManyFromRows);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined)
  );
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("authorizeAdmin", () => {
  it("returns the admin user for the configured email and password", async () => {
    const req = request();

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, req)).resolves.toEqual({
      id: "admin-1",
      email: ADMIN_EMAIL,
      name: "Admin",
    });

    expect(mockGetClientIp).toHaveBeenCalledWith(req);
    // A success takes a throttle slot like any attempt; nothing is given back.
    expect(mockConsumeAttempt).toHaveBeenCalledTimes(1);
    expect(mockConsumeAttempt).toHaveBeenCalledWith({ email: ADMIN_EMAIL, ip: CLIENT_IP });
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, passwordHash);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith(ADMIN_QUERY);
  });

  it("passes a null IP through to the throttle", async () => {
    mockGetClientIp.mockReturnValue(null);

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.not.toBeNull();
    expect(mockConsumeAttempt).toHaveBeenCalledWith({ email: ADMIN_EMAIL, ip: null });
  });

  it("ignores extra form fields such as csrfToken and callbackUrl", async () => {
    const credentials = {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      csrfToken: "x",
      callbackUrl: "/admin",
    } as unknown as Partial<Record<"email" | "password", unknown>>;

    await expect(authorizeAdmin(credentials, request())).resolves.toMatchObject({ id: "admin-1" });
  });

  it.each([
    ["upper case", "ADMIN@EXAMPLE.COM"],
    ["surrounding whitespace", "  admin@example.com\t"],
    ["mixed case and whitespace", " Admin@Example.Com "],
  ])("normalizes an email in %s", async (_label, email) => {
    await expect(authorizeAdmin({ email, password: PASSWORD }, request())).resolves.toMatchObject({
      id: "admin-1",
    });
    expect(mockConsumeAttempt).toHaveBeenCalledWith({ email: ADMIN_EMAIL, ip: CLIENT_IP });
  });

  it("normalizes the configured email the same way", async () => {
    process.env.ADMIN_LOGIN_EMAIL = "  Admin@Example.COM ";

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toMatchObject({
      id: "admin-1",
    });
  });

  it("rejects a wrong password", async () => {
    await expect(
      authorizeAdmin({ email: ADMIN_EMAIL, password: `${PASSWORD}x` }, request())
    ).resolves.toBeNull();

    expect(mockVerifyPassword).toHaveBeenCalledWith(`${PASSWORD}x`, passwordHash);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("does not trim the password", async () => {
    await expect(
      authorizeAdmin({ email: ADMIN_EMAIL, password: ` ${PASSWORD} ` }, request())
    ).resolves.toBeNull();
  });

  it("rejects another email, still running scrypt but never against the real hash", async () => {
    await expect(
      authorizeAdmin({ email: "someone@example.com", password: PASSWORD }, request())
    ).resolves.toBeNull();

    expect(mockConsumeAttempt).toHaveBeenCalledWith({ email: "someone@example.com", ip: CLIENT_IP });
    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, undefined);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["ADMIN_LOGIN_EMAIL is missing", { ADMIN_LOGIN_EMAIL: undefined }, "not_configured"],
    ["ADMIN_LOGIN_EMAIL is blank", { ADMIN_LOGIN_EMAIL: "  " }, "not_configured"],
    ["ADMIN_PASSWORD_HASH is missing", { ADMIN_PASSWORD_HASH: undefined }, "not_configured"],
    ["ADMIN_PASSWORD_HASH is empty", { ADMIN_PASSWORD_HASH: "" }, "not_configured"],
    ["ADMIN_PASSWORD_HASH is only whitespace", { ADMIN_PASSWORD_HASH: " \n\t" }, "not_configured"],
    ["both are missing", { ADMIN_LOGIN_EMAIL: undefined, ADMIN_PASSWORD_HASH: undefined }, "not_configured"],
    ["ADMIN_PASSWORD_HASH is garbage", { ADMIN_PASSWORD_HASH: "not-a-hash-value" }, "malformed_hash"],
    [
      "ADMIN_PASSWORD_HASH has params below the minimum",
      { ADMIN_PASSWORD_HASH: "scrypt:1024:8:1:AQEBAQEBAQEBAQEBAQEBAQ:AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE" },
      "malformed_hash",
    ],
  ])(
    "always rejects when %s, logging the reason",
    async (_label, overrides: Record<string, string | undefined>, reason) => {
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }

      await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();

      // Same work as any other failure: the attempt is recorded and scrypt runs once.
      expect(mockConsumeAttempt).toHaveBeenCalledTimes(1);
      expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(rejectionReasons()).toEqual([reason]);

      const logs = loggedText();
      for (const value of Object.values(overrides)) {
        if (value && value.trim()) expect(logs).not.toContain(value.trim());
      }
      expect(logs).not.toContain(passwordHash);
      expect(logs).not.toContain(PASSWORD);
    }
  );

  it("reports a malformed hash for another email too (operators see it on any attempt)", async () => {
    process.env.ADMIN_PASSWORD_HASH = "not-a-hash-value";
    await expect(
      authorizeAdmin({ email: "someone@example.com", password: PASSWORD }, request())
    ).resolves.toBeNull();
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, undefined);
    expect(rejectionReasons()).toEqual(["malformed_hash"]);
  });

  it.each([
    ["a trailing newline", (hash: string) => `${hash}\n`],
    ["surrounding spaces and tabs", (hash: string) => ` \t${hash}  `],
  ])("trims %s from ADMIN_PASSWORD_HASH", async (_label, wrap) => {
    process.env.ADMIN_PASSWORD_HASH = wrap(passwordHash);

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toMatchObject({
      id: "admin-1",
    });
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, passwordHash);
  });

  it.each([
    ["a wrong password", { email: ADMIN_EMAIL, password: "wrong-password-0" }],
    ["another email", { email: "someone@example.com", password: PASSWORD }],
  ])("logs invalid_credentials for %s", async (_label, credentials) => {
    await expect(authorizeAdmin(credentials, request())).resolves.toBeNull();
    expect(rejectionReasons()).toEqual(["invalid_credentials"]);
  });

  it("rejects when no User row has the email", async () => {
    mockUsers.length = 0;
    mockUsers.push({ id: "other-admin", email: "someone@example.com", name: null, role: "admin" });

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("rejects when the User row with the email has role=user", async () => {
    mockUsers.length = 0;
    mockUsers.push({ ...ADMIN_ROW, role: "user" });

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
  });

  it("matches the stored email after trimming and lower-casing it", async () => {
    mockUsers.length = 0;
    mockUsers.push({ ...ADMIN_ROW, email: " Admin@Example.COM" });

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toEqual({
      id: "admin-1",
      email: " Admin@Example.COM",
      name: "Admin",
    });
  });

  describe("picks the admin row by exact email, never by pattern (M2)", () => {
    const CONFIGURED = "probe_a@example.com";

    beforeEach(() => {
      process.env.ADMIN_LOGIN_EMAIL = CONFIGURED;
    });

    it.each([
      ["before", "first"],
      ["after", "last"],
    ])("finds the real row when LIKE-pattern decoys sort %s it", async (_label, position) => {
      // `_` and `%` are LIKE wildcards: an ILIKE lookup for the configured
      // email would match each of these decoys too.
      const decoys: UserRow[] = [
        { id: "decoy-underscore", email: "probeXa@example.com", name: null, role: "admin" },
        { id: "decoy-percent", email: "probe%a@example.com", name: null, role: "admin" },
        { id: "decoy-upper", email: "PROBE-A@EXAMPLE.COM", name: null, role: "admin" },
      ];
      const real: UserRow = { id: "real-admin", email: CONFIGURED, name: "Real", role: "admin" };
      mockUsers.length = 0;
      mockUsers.push(...(position === "first" ? [real, ...decoys] : [...decoys, real]));

      await expect(authorizeAdmin({ email: CONFIGURED, password: PASSWORD }, request())).resolves.toEqual({
        id: "real-admin",
        email: CONFIGURED,
        name: "Real",
      });
    });

    it("rejects when only a decoy row exists", async () => {
      mockUsers.length = 0;
      mockUsers.push({ id: "decoy", email: "probeXa@example.com", name: null, role: "admin" });

      await expect(
        authorizeAdmin({ email: CONFIGURED, password: PASSWORD }, request())
      ).resolves.toBeNull();
    });

    it("rejects when several admin rows normalize to the configured email", async () => {
      mockUsers.length = 0;
      mockUsers.push(
        { id: "admin-a", email: CONFIGURED, name: null, role: "admin" },
        { id: "admin-b", email: "PROBE_A@example.com", name: null, role: "admin" }
      );

      await expect(
        authorizeAdmin({ email: CONFIGURED, password: PASSWORD }, request())
      ).resolves.toBeNull();
    });
  });

  it("rejects the right password while the throttle denies the attempt, still running scrypt", async () => {
    mockConsumeAttempt.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();

    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, passwordHash);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("runs scrypt for another email while the throttle denies the attempt", async () => {
    mockConsumeAttempt.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });

    await expect(
      authorizeAdmin({ email: "someone@example.com", password: PASSWORD }, request())
    ).resolves.toBeNull();

    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, undefined);
  });

  it.each([
    ["no credentials", undefined],
    ["an empty object", {}],
    ["a missing password", { email: ADMIN_EMAIL }],
    ["a missing email", { password: PASSWORD }],
    ["an empty password", { email: ADMIN_EMAIL, password: "" }],
    ["a blank email", { email: "   ", password: PASSWORD }],
    ["a non-string email", { email: ["admin@example.com"], password: PASSWORD }],
    ["a non-string password", { email: ADMIN_EMAIL, password: 12345 }],
    ["an oversized email", { email: `${"a".repeat(300)}@example.com`, password: PASSWORD }],
    ["an oversized password", { email: ADMIN_EMAIL, password: "p".repeat(5000) }],
  ])("rejects %s before touching the throttle", async (_label, credentials) => {
    await expect(
      authorizeAdmin(credentials as Partial<Record<"email" | "password", unknown>>, request())
    ).resolves.toBeNull();

    expect(mockConsumeAttempt).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  describe("errors deny the attempt instead of throwing (M4)", () => {
    // The message carries the email and password on purpose: none of it may be logged.
    const leakyError = () => new Error(`db down for ${ADMIN_EMAIL} / ${PASSWORD} from ${CLIENT_IP}`);
    const knownError = () =>
      new Prisma.PrismaClientKnownRequestError(`Timed out for ${ADMIN_EMAIL}`, {
        code: "P2024",
        clientVersion: "test",
      });

    function expectSafeErrorLog(expectedCode?: string) {
      const errorLines = consoleSpies[3].mock.calls.map((args) => String(args[0]));
      expect(errorLines).toHaveLength(1);
      const entry = JSON.parse(errorLines[0]);
      expect(entry).toMatchObject({ level: "error", context: { reason: "internal_error" } });
      if (expectedCode) expect(entry.context.errorCode).toBe(expectedCode);
      const logs = loggedText();
      expect(logs).not.toContain(ADMIN_EMAIL);
      expect(logs).not.toContain(PASSWORD);
      expect(logs).not.toContain(CLIENT_IP);
    }

    it("returns null when the throttle throws, still running scrypt, and logs no secrets", async () => {
      mockConsumeAttempt.mockRejectedValue(leakyError());

      await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
      expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
      expect(mockFindMany).not.toHaveBeenCalled();
      expectSafeErrorLog();
    });

    it("returns null when the throttle throws a Prisma error, logging only its code", async () => {
      mockConsumeAttempt.mockRejectedValue(knownError());

      await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
      expectSafeErrorLog("P2024");
    });

    it("returns null when the User lookup throws", async () => {
      mockFindMany.mockRejectedValue(leakyError());

      await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
      expectSafeErrorLog();
    });

    it("returns null when the IP lookup throws", async () => {
      mockGetClientIp.mockImplementation(() => {
        throw leakyError();
      });

      await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
      expectSafeErrorLog();
    });

    it("returns null when a non-Error value is thrown", async () => {
      mockConsumeAttempt.mockRejectedValue(`${ADMIN_EMAIL}:${PASSWORD}`);

      await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
      expectSafeErrorLog();
    });
  });

  it("never logs the submitted email or the client IP", async () => {
    const otherEmail = "someone-else@example.com";
    const attempts: Array<[Partial<Record<"email" | "password", unknown>>, () => void]> = [
      [{ email: otherEmail, password: PASSWORD }, () => undefined],
      [{ email: ADMIN_EMAIL, password: "wrong-password" }, () => undefined],
      [
        { email: ADMIN_EMAIL, password: PASSWORD },
        () => mockConsumeAttempt.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 }),
      ],
      [{ email: ADMIN_EMAIL, password: PASSWORD }, () => (mockUsers.length = 0)],
      [
        { email: ADMIN_EMAIL, password: PASSWORD },
        () => mockConsumeAttempt.mockRejectedValueOnce(new Error(`down: ${ADMIN_EMAIL} ${CLIENT_IP}`)),
      ],
      [{ email: `${"a".repeat(300)}@example.com`, password: PASSWORD }, () => undefined],
    ];

    for (const [credentials, arrange] of attempts) {
      arrange();
      await expect(authorizeAdmin(credentials, request())).resolves.toBeNull();
    }

    const logs = loggedText();
    expect(logs).not.toContain(otherEmail);
    expect(logs).not.toContain(ADMIN_EMAIL);
    expect(logs).not.toContain("a".repeat(50));
    expect(logs).not.toContain(CLIENT_IP);
    expect(logs).not.toContain(PASSWORD);
    expect(logs).not.toContain("wrong-password");
  });
});
