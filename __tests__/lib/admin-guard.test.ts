/**
 * @jest-environment node
 */

import { requireAdminPage } from "@/lib/admin-guard";
import { auth } from "@/lib/auth";
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
}));

jest.mock("@/lib/auth-utils", () => ({
  isAdmin: jest.fn(),
}));

const mockAuth = auth as unknown as jest.Mock;
const mockIsAdmin = isAdmin as jest.MockedFunction<typeof isAdmin>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requireAdminPage", () => {
  it.each([
    ["no session", null],
    ["a session without a user id", { user: { email: "a@example.com" } }],
  ])("sends a visitor with %s to the sign-in page", async (_label, session) => {
    mockAuth.mockResolvedValue(session);

    await expect(requireAdminPage()).rejects.toMatchObject({
      location: "/login?callbackUrl=%2Fadmin",
    });
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it("sends a signed-in non-admin to /projects", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockIsAdmin.mockResolvedValue(false);

    await expect(requireAdminPage()).rejects.toMatchObject({ location: "/projects" });
    expect(mockIsAdmin).toHaveBeenCalledWith("user-1");
  });

  it("lets an admin through", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1" } });
    mockIsAdmin.mockResolvedValue(true);

    await expect(requireAdminPage()).resolves.toBeUndefined();
  });

  it("surfaces a database failure instead of redirecting", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1" } });
    mockIsAdmin.mockRejectedValue(new Error("db down"));

    await expect(requireAdminPage()).rejects.toThrow("db down");
  });
});
