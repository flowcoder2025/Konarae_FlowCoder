import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminLayout from "@/app/admin/layout";
import LoginPage from "@/app/login/page";
import { auth, signIn } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";

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
  signIn: jest.fn(),
}));

jest.mock("@/lib/auth-utils", () => ({
  isAdmin: jest.fn(),
}));

const mockAuth = auth as unknown as jest.Mock;
const mockSignIn = signIn as unknown as jest.Mock;
const mockIsAdmin = isAdmin as jest.MockedFunction<typeof isAdmin>;

async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AdminLayout", () => {
  const renderLayout = () => AdminLayout({ children: <div>admin content</div> });

  it("sends an anonymous visitor to the sign-in page with /admin as the callback", async () => {
    mockAuth.mockResolvedValue(null);

    expect(await redirectTarget(renderLayout)).toBe("/login?callbackUrl=%2Fadmin");
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("treats a session without a user id as anonymous", async () => {
    mockAuth.mockResolvedValue({ user: { email: "a@example.com" } });

    expect(await redirectTarget(renderLayout)).toBe("/login?callbackUrl=%2Fadmin");
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("sends a signed-in non-admin to the access-denied page", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockIsAdmin.mockResolvedValue(false);

    expect(await redirectTarget(renderLayout)).toBe("/access-denied");
    expect(mockIsAdmin).toHaveBeenCalledWith("user-1");
  });

  it("renders the admin shell for an admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1" } });
    mockIsAdmin.mockResolvedValue(true);

    render(await renderLayout());

    expect(screen.getByText("admin content")).toBeTruthy();
  });

  it("surfaces a database failure instead of redirecting", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1" } });
    mockIsAdmin.mockRejectedValue(new Error("db down"));

    await expect(renderLayout()).rejects.toThrow("db down");
  });
});

describe("LoginPage", () => {
  const renderLogin = (searchParams: Record<string, string | string[] | undefined> = {}) =>
    LoginPage({ searchParams: Promise.resolve(searchParams) });

  it("renders for an anonymous visitor without redirecting", async () => {
    mockAuth.mockResolvedValue(null);

    render(await renderLogin({ callbackUrl: "/admin" }));

    expect(screen.getByRole("button", { name: /Google/ })).toBeTruthy();
  });

  it("renders when the session has no user id, so /admin and /login cannot loop", async () => {
    mockAuth.mockResolvedValue({ user: {} });

    render(await renderLogin({ callbackUrl: "/admin" }));

    expect(screen.getByRole("button", { name: /Google/ })).toBeTruthy();
  });

  it("returns a signed-in user to the callback page", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1" } });

    expect(await redirectTarget(() => renderLogin({ callbackUrl: "/admin/crawler?tab=jobs" }))).toBe(
      "/admin/crawler?tab=jobs"
    );
  });

  it("falls back to /projects when there is no callback", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    expect(await redirectTarget(() => renderLogin())).toBe("/projects");
  });

  it.each([
    ["an external URL", "https://evil.example/admin"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash host", "/\\evil.example"],
    ["a repeated parameter", ["/admin", "https://evil.example"]],
    ["the sign-in page itself", "/login"],
  ])("ignores %s as the callback", async (_label, callbackUrl) => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    expect(await redirectTarget(() => renderLogin({ callbackUrl }))).toBe("/projects");
  });

  it.each([
    ["kakao", /카카오/],
    ["google", /Google/],
  ])("starts %s sign-in with the callback page as the return target", async (provider, buttonName) => {
    mockAuth.mockResolvedValue(null);
    render(await renderLogin({ callbackUrl: "/admin/crawler?tab=jobs" }));

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockSignIn).toHaveBeenCalledWith(provider, { redirectTo: "/admin/crawler?tab=jobs" });
  });

  it.each([
    ["no callback", undefined],
    ["an external callback", "https://evil.example/admin"],
  ])("starts sign-in with /projects as the return target for %s", async (_label, callbackUrl) => {
    mockAuth.mockResolvedValue(null);
    render(await renderLogin({ callbackUrl }));

    fireEvent.click(screen.getByRole("button", { name: /Google/ }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockSignIn).toHaveBeenCalledWith("google", { redirectTo: "/projects" });
  });

  it.each([
    ["kakao", /카카오/, { prompt: "login" }],
    ["google", /Google/, { prompt: "select_account" }],
  ])("asks %s for another account after a switch-account sign-out", async (provider, buttonName, prompt) => {
    mockAuth.mockResolvedValue(null);
    render(await renderLogin({ callbackUrl: "/admin", switchAccount: "1" }));

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockSignIn).toHaveBeenCalledWith(provider, { redirectTo: "/admin" }, prompt);
  });

  it.each([
    ["0", "0"],
    ["true", "true"],
    ["a repeated flag", ["1", "1"]],
  ])("does not ask for another account when the flag is %s", async (_label, switchAccount) => {
    mockAuth.mockResolvedValue(null);
    render(await renderLogin({ callbackUrl: "/admin", switchAccount }));

    fireEvent.click(screen.getByRole("button", { name: /Google/ }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    expect(mockSignIn).toHaveBeenCalledWith("google", { redirectTo: "/admin" });
  });

  it("ignores a switch-account flag for a user who is already signed in", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    expect(
      await redirectTarget(() => renderLogin({ callbackUrl: "/admin", switchAccount: "1" }))
    ).toBe("/admin");
  });

  it("does not start sign-in while rendering", async () => {
    mockAuth.mockResolvedValue(null);

    render(await renderLogin({ callbackUrl: "/admin" }));

    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
