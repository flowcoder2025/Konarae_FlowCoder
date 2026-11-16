import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccessDeniedPage from "@/app/access-denied/page";
import { auth, signOut } from "@/lib/auth";
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
  signOut: jest.fn(),
}));

jest.mock("@/lib/auth-utils", () => ({
  isAdmin: jest.fn(),
}));

const mockAuth = auth as unknown as jest.Mock;
const mockSignOut = signOut as unknown as jest.Mock;
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

describe("AccessDeniedPage", () => {
  it("sends an anonymous visitor to sign in for /admin", async () => {
    mockAuth.mockResolvedValue(null);

    expect(await redirectTarget(() => AccessDeniedPage())).toBe("/login?callbackUrl=%2Fadmin");
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("sends an admin on to /admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", email: "admin@example.com" } });
    mockIsAdmin.mockResolvedValue(true);

    expect(await redirectTarget(() => AccessDeniedPage())).toBe("/admin");
  });

  it("tells a non-admin which account is signed in and links back to the listing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    mockIsAdmin.mockResolvedValue(false);

    render(await AccessDeniedPage());

    expect(screen.getByRole("heading", { name: "관리자 계정이 아닙니다" })).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: "공고 목록으로 이동" }).getAttribute("href")).toBe("/projects");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs out and returns to the /admin sign-in when the button is pressed", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    mockIsAdmin.mockResolvedValue(false);
    render(await AccessDeniedPage());

    fireEvent.click(screen.getByRole("button", { name: "로그아웃 후 다른 계정으로 로그인" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/login?callbackUrl=%2Fadmin" });
  });

  it("surfaces a database failure instead of showing the page", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockIsAdmin.mockRejectedValue(new Error("db down"));

    await expect(AccessDeniedPage()).rejects.toThrow("db down");
  });
});
