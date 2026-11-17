/**
 * /admin-login: the admin email + password sign-in page and its form action.
 * The page runs the real admin judgement (auth-utils); only the session, the
 * database and next-auth's sign-in are mocked. Rows follow the plan's state
 * table (`/admin-login` column).
 */

import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthError, CredentialsSignin } from "next-auth";
import AdminLoginPage, { metadata } from "@/app/admin-login/page";
import { submitAdminLogin } from "@/lib/admin-login/submit";
import { auth, signIn } from "@/lib/auth";
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

// next-auth ships ESM only. Its error classes are stood in for with the same
// hierarchy (CredentialsSignin extends AuthError); the real classes are
// exercised by the local production build.
jest.mock("next-auth", () => {
  class MockAuthError extends Error {
    type = "AuthError";
  }
  class MockCredentialsSignin extends MockAuthError {
    type = "CredentialsSignin";
  }
  return { __esModule: true, AuthError: MockAuthError, CredentialsSignin: MockCredentialsSignin };
});

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
  signIn: jest.fn(),
}));

// auth-utils -> api-error loads next/server, which needs Fetch API globals that
// jsdom lacks. Nothing here builds a response, so a stub is enough.
jest.mock("next/server", () => ({ NextResponse: { json: jest.fn() } }));

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const mockAuth = auth as unknown as jest.Mock;
const mockSignIn = signIn as unknown as jest.Mock;
const mockFindUnique = prisma.user.findUnique as unknown as jest.Mock;

const ERROR_TEXT = "이메일 또는 비밀번호가 올바르지 않거나 잠시 잠겨 있습니다";
const HOUR = 60 * 60 * 1000;

const passwordAdmin = () => ({ user: { id: "admin-1" }, adminAuthAt: Date.now() - HOUR });

const renderPage = (searchParams: Record<string, string | string[] | undefined> = {}) =>
  AdminLoginPage({ searchParams: Promise.resolve(searchParams) });

async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

function formData(fields: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

function expectForm() {
  const email = screen.getByLabelText("이메일") as HTMLInputElement;
  const password = screen.getByLabelText("비밀번호") as HTMLInputElement;

  expect(email.type).toBe("email");
  expect(email.name).toBe("email");
  expect(email.getAttribute("autocomplete")).toBe("username");
  expect(email.required).toBe(true);
  expect(password.type).toBe("password");
  expect(password.name).toBe("password");
  expect(password.getAttribute("autocomplete")).toBe("current-password");
  expect(password.required).toBe(true);
  expect(screen.getByRole("button", { name: "로그인" }).getAttribute("type")).toBe("submit");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AdminLoginPage", () => {
  it("renders the sign-in form for an anonymous visitor", async () => {
    mockAuth.mockResolvedValue(null);

    render(await renderPage({ callbackUrl: "/admin" }));

    expect(screen.getByRole("heading", { name: "관리자 로그인" })).toBeTruthy();
    expectForm();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["a social session with role=user", "user"],
    ["a social session with role=admin", "admin"],
  ])("renders the form for %s instead of sending it away", async (_label, role) => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindUnique.mockResolvedValue({ role });

    render(await renderPage({ callbackUrl: "/admin" }));

    expectForm();
    // The sign-in marker is checked first, so a social session never reaches the database.
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("renders the form for a password sign-in older than 12 hours", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1" },
      adminAuthAt: Date.now() - ADMIN_SESSION_MAX_AGE_MS - 60_000,
    });
    mockFindUnique.mockResolvedValue({ role: "admin" });

    render(await renderPage());

    expectForm();
  });

  it("renders the form for a password sign-in whose role was revoked", async () => {
    mockAuth.mockResolvedValue(passwordAdmin());
    mockFindUnique.mockResolvedValue({ role: "user" });

    render(await renderPage());

    expectForm();
  });

  it("sends a password admin to /admin when there is no callback", async () => {
    mockAuth.mockResolvedValue(passwordAdmin());
    mockFindUnique.mockResolvedValue({ role: "admin" });

    expect(await redirectTarget(() => renderPage())).toBe("/admin");
  });

  it("sends a password admin to the callback page", async () => {
    mockAuth.mockResolvedValue(passwordAdmin());
    mockFindUnique.mockResolvedValue({ role: "admin" });

    expect(await redirectTarget(() => renderPage({ callbackUrl: "/admin/crawler?tab=jobs" }))).toBe(
      "/admin/crawler?tab=jobs"
    );
  });

  it.each([
    ["an external URL", "https://evil.example/admin"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash host", "/\\evil.example"],
    ["a repeated parameter", ["/admin/users", "https://evil.example"]],
    ["the admin sign-in page", "/admin-login"],
    ["the admin sign-in page with a nested callback", "/admin-login?callbackUrl=%2Fadmin"],
    ["the social sign-in page", "/login"],
    ["an API route", "/api/auth/signout"],
  ])("ignores %s as the callback and falls back to /admin", async (_label, callbackUrl) => {
    mockAuth.mockResolvedValue(passwordAdmin());
    mockFindUnique.mockResolvedValue({ role: "admin" });

    expect(await redirectTarget(() => renderPage({ callbackUrl }))).toBe("/admin");
  });

  it("surfaces a database failure instead of rendering or redirecting", async () => {
    mockAuth.mockResolvedValue(passwordAdmin());
    mockFindUnique.mockRejectedValue(new Error("db down"));

    await expect(renderPage()).rejects.toThrow("db down");
  });

  it("shows one failure message as an alert when error=1", async () => {
    mockAuth.mockResolvedValue(null);

    render(await renderPage({ callbackUrl: "/admin", error: "1" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(ERROR_TEXT);
    const email = screen.getByLabelText("이메일");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.activeElement).toBe(email);
    expectForm();
  });

  it("does not move focus into the form without error=1", async () => {
    mockAuth.mockResolvedValue(null);

    render(await renderPage({ callbackUrl: "/admin" }));

    expect(document.activeElement).toBe(document.body);
  });

  it("marks only the email input autofocus in the server HTML when error=1", async () => {
    mockAuth.mockResolvedValue(null);

    const withError = renderToStaticMarkup(await renderPage({ callbackUrl: "/admin", error: "1" }));
    const withoutError = renderToStaticMarkup(await renderPage({ callbackUrl: "/admin" }));

    const autofocused = [...withError.matchAll(/<input\b[^>]*\bautofocus=""[^>]*>/g)].map((m) => m[0]);
    expect(autofocused).toHaveLength(1);
    expect(autofocused[0]).toContain('name="email"');
    expect(withoutError).not.toMatch(/autofocus/i);
  });

  it("focuses the email input again when a failed sign-in returns the page with error=1", async () => {
    // A failed submit comes back as a client-side navigation to the same page
    // with error=1, so the form must remount for autofocus to apply again.
    mockAuth.mockResolvedValue(null);
    const { rerender } = render(await renderPage({ callbackUrl: "/admin" }));
    const submit = screen.getByRole("button", { name: "로그인" });
    submit.focus();
    expect(document.activeElement).toBe(submit);

    rerender(await renderPage({ callbackUrl: "/admin", error: "1" }));

    expect(document.activeElement).toBe(screen.getByLabelText("이메일"));
  });

  it.each([
    ["another value", "CredentialsSignin"],
    ["a repeated parameter", ["1", "1"]],
  ])("shows no message for %s", async (_label, error) => {
    mockAuth.mockResolvedValue(null);

    render(await renderPage({ error }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("이메일").getAttribute("aria-invalid")).toBeNull();
  });

  it("submits email and password with the server-side callback, not one from the form", async () => {
    mockAuth.mockResolvedValue(null);
    mockSignIn.mockResolvedValue(undefined);
    render(await renderPage({ callbackUrl: "/admin/users" }));

    const form = screen.getByRole("button", { name: "로그인" }).closest("form");
    if (!form) throw new Error("form not found");
    for (const [name, value] of [
      ["redirectTo", "https://evil.example"],
      ["callbackUrl", "//evil.example"],
    ]) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = name;
      hidden.value = value;
      form.appendChild(hidden);
    }
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "correct horse battery" } });

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockSignIn).toHaveBeenCalledWith("admin-credentials", {
      email: "admin@example.com",
      password: "correct horse battery",
      redirectTo: "/admin/users",
    });
  });

  it("does not start sign-in while rendering", async () => {
    mockAuth.mockResolvedValue(null);

    render(await renderPage({ callbackUrl: "/admin" }));

    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("asks search engines not to index the page", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });
});

describe("submitAdminLogin", () => {
  it("passes only email and password from the form, with the given callback", async () => {
    mockSignIn.mockResolvedValue(undefined);

    await submitAdminLogin(
      formData({
        email: "admin@example.com",
        password: "pw",
        redirectTo: "https://evil.example",
        callbackUrl: "//evil.example",
        redirect: "false",
      }),
      "/admin/users"
    );

    expect(mockSignIn).toHaveBeenCalledWith("admin-credentials", {
      email: "admin@example.com",
      password: "pw",
      redirectTo: "/admin/users",
    });
  });

  it("sends empty strings for missing or non-text fields", async () => {
    mockSignIn.mockResolvedValue(undefined);

    await submitAdminLogin(formData({ password: new Blob(["x"]) }), "/admin");

    expect(mockSignIn).toHaveBeenCalledWith("admin-credentials", {
      email: "",
      password: "",
      redirectTo: "/admin",
    });
  });

  it("falls back to /admin when the callback it is given is not a safe local page", async () => {
    mockSignIn.mockResolvedValue(undefined);

    await submitAdminLogin(formData({ email: "a@example.com", password: "pw" }), "https://evil.example");

    expect(mockSignIn).toHaveBeenCalledWith("admin-credentials", {
      email: "a@example.com",
      password: "pw",
      redirectTo: "/admin",
    });
  });

  it.each([
    ["a rejected sign-in (CredentialsSignin)", () => new CredentialsSignin()],
    ["any other Auth.js error", () => new AuthError("callback failed")],
  ])("returns to the form with error=1 and the same callback after %s", async (_label, makeError) => {
    mockSignIn.mockRejectedValue(makeError());

    expect(
      await redirectTarget(() =>
        submitAdminLogin(formData({ email: "a@example.com", password: "wrong" }), "/admin/crawler?tab=jobs")
      )
    ).toBe("/admin-login?callbackUrl=%2Fadmin%2Fcrawler%3Ftab%3Djobs&error=1");
  });

  it("rethrows the success redirect untouched", async () => {
    const success = new RedirectSignal("http://localhost/admin/users");
    mockSignIn.mockRejectedValue(success);

    await expect(
      submitAdminLogin(formData({ email: "admin@example.com", password: "pw" }), "/admin/users")
    ).rejects.toBe(success);
  });

  it("rethrows errors that are not Auth.js errors", async () => {
    const failure = new Error("unexpected");
    mockSignIn.mockRejectedValue(failure);

    await expect(
      submitAdminLogin(formData({ email: "admin@example.com", password: "pw" }), "/admin")
    ).rejects.toBe(failure);
  });

  it("is a plain server module, not a server action module", () => {
    // With "use server" every export becomes a client-callable endpoint, and
    // the caller could pick the callback itself.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "admin-login", "submit.ts"),
      "utf8"
    );

    // A directive is a statement on its own line; the module comment may mention it.
    expect(source).not.toMatch(/^\s*["']use server["'];?\s*$/m);
    expect(source).toMatch(/export async function submitAdminLogin/);
  });
});
