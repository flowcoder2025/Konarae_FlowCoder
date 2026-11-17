/**
 * @jest-environment node
 */

type UserRow = { id: string; email: string; name: string | null; role: string };

const mockUsers: UserRow[] = [];

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: jest.fn() } },
}));

jest.mock("@/lib/admin-login/throttle", () => ({
  registerAttempt: jest.fn(),
  markAttemptSucceeded: jest.fn(),
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

import { authorizeAdmin } from "@/lib/admin-login/authorize";
import { getClientIp } from "@/lib/admin-login/client-ip";
import { hashPassword, verifyPassword } from "@/lib/admin-login/password";
import { markAttemptSucceeded, registerAttempt } from "@/lib/admin-login/throttle";
import { prisma } from "@/lib/prisma";

const mockFindFirst = prisma.user.findFirst as unknown as jest.Mock;
const mockRegisterAttempt = registerAttempt as jest.MockedFunction<typeof registerAttempt>;
const mockMarkSucceeded = markAttemptSucceeded as jest.MockedFunction<typeof markAttemptSucceeded>;
const mockGetClientIp = getClientIp as jest.MockedFunction<typeof getClientIp>;
const mockVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;

// Test fixtures only: not a real account or password.
const ADMIN_EMAIL = "admin@example.com";
const PASSWORD = "unit-test-password-0123";
const CLIENT_IP = "203.0.113.9";
const ATTEMPT_ID = "attempt-1";
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

/** Mimics Postgres for the where clause authorizeAdmin is expected to send. */
function findFirstFromRows(args: {
  where: { email: { equals: string; mode: "insensitive" }; role: string };
}): Promise<Pick<UserRow, "id" | "email" | "name"> | null> {
  const { where } = args;
  const row = mockUsers.find(
    (user) =>
      user.email.toLowerCase() === where.email.equals.toLowerCase() && user.role === where.role
  );
  return Promise.resolve(row ? { id: row.id, email: row.email, name: row.name } : null);
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
  mockRegisterAttempt.mockResolvedValue({ allowed: true, attemptId: ATTEMPT_ID });
  mockMarkSucceeded.mockResolvedValue(undefined);
  mockGetClientIp.mockReturnValue(CLIENT_IP);
  mockFindFirst.mockImplementation(findFirstFromRows);
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
    expect(mockRegisterAttempt).toHaveBeenCalledWith({ email: ADMIN_EMAIL, ip: CLIENT_IP });
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, passwordHash);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: ADMIN_EMAIL, mode: "insensitive" }, role: "admin" },
      })
    );
    expect(mockMarkSucceeded).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it("passes a null IP through to the throttle", async () => {
    mockGetClientIp.mockReturnValue(null);

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.not.toBeNull();
    expect(mockRegisterAttempt).toHaveBeenCalledWith({ email: ADMIN_EMAIL, ip: null });
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
    expect(mockRegisterAttempt).toHaveBeenCalledWith({ email: ADMIN_EMAIL, ip: CLIENT_IP });
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
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
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

    expect(mockRegisterAttempt).toHaveBeenCalledWith({ email: "someone@example.com", ip: CLIENT_IP });
    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, undefined);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it.each([
    ["ADMIN_LOGIN_EMAIL is missing", { ADMIN_LOGIN_EMAIL: undefined }],
    ["ADMIN_LOGIN_EMAIL is blank", { ADMIN_LOGIN_EMAIL: "  " }],
    ["ADMIN_PASSWORD_HASH is missing", { ADMIN_PASSWORD_HASH: undefined }],
    ["ADMIN_PASSWORD_HASH is empty", { ADMIN_PASSWORD_HASH: "" }],
    ["both are missing", { ADMIN_LOGIN_EMAIL: undefined, ADMIN_PASSWORD_HASH: undefined }],
  ])("always rejects when %s", async (_label, overrides: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();

    // Same work as any other failure: the attempt is recorded and scrypt runs once.
    expect(mockRegisterAttempt).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it("rejects when no User row has the email", async () => {
    mockUsers.length = 0;

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it("rejects when the User row with the email has role=user", async () => {
    mockUsers.length = 0;
    mockUsers.push({ ...ADMIN_ROW, role: "user" });

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it("rejects a row whose email is not exactly the configured one (no wildcard matches)", async () => {
    process.env.ADMIN_LOGIN_EMAIL = "admin_ops@example.com";
    mockFindFirst.mockResolvedValue({ id: "other-1", email: "adminxops@example.com", name: null });

    await expect(
      authorizeAdmin({ email: "admin_ops@example.com", password: PASSWORD }, request())
    ).resolves.toBeNull();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it("rejects the right password while the throttle denies the attempt, still running scrypt", async () => {
    mockRegisterAttempt.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).resolves.toBeNull();

    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledWith(PASSWORD, passwordHash);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it("runs scrypt for another email while the throttle denies the attempt", async () => {
    mockRegisterAttempt.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });

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

    expect(mockRegisterAttempt).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("throws when the throttle cannot reach the database (fail-closed)", async () => {
    mockRegisterAttempt.mockRejectedValue(new Error("db down"));

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).rejects.toThrow(
      "db down"
    );
  });

  it("throws when the User lookup fails", async () => {
    mockFindFirst.mockRejectedValue(new Error("db down"));

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).rejects.toThrow(
      "db down"
    );
    expect(mockMarkSucceeded).not.toHaveBeenCalled();
  });

  it("throws when the success cannot be recorded", async () => {
    mockMarkSucceeded.mockRejectedValue(new Error("db down"));

    await expect(authorizeAdmin({ email: ADMIN_EMAIL, password: PASSWORD }, request())).rejects.toThrow(
      "db down"
    );
  });

  it("never logs the submitted email or the client IP", async () => {
    const otherEmail = "someone-else@example.com";
    const attempts: Array<[Partial<Record<"email" | "password", unknown>>, () => void]> = [
      [{ email: otherEmail, password: PASSWORD }, () => undefined],
      [{ email: ADMIN_EMAIL, password: "wrong-password" }, () => undefined],
      [
        { email: ADMIN_EMAIL, password: PASSWORD },
        () => mockRegisterAttempt.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 }),
      ],
      [{ email: ADMIN_EMAIL, password: PASSWORD }, () => (mockUsers.length = 0)],
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
