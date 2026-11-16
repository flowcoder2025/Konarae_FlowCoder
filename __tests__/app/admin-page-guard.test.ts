/**
 * Every page under /admin must run the admin guard before it reads data.
 * The admin layout is not enough: Next.js can render a page without its layout.
 *
 * Pages are discovered from disk, so a new admin page is covered automatically.
 *
 * @jest-environment node
 */

import fs from "node:fs";
import path from "node:path";

const mockPrismaTouches: string[] = [];

class GuardRejected extends Error {}
const guardRejected = new GuardRejected("guard rejected");

jest.mock("@/lib/admin-guard", () => ({
  requireAdminPage: jest.fn(),
}));

// Any property read on the client counts as data access.
jest.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        mockPrismaTouches.push(String(prop));
        throw new Error(`prisma.${String(prop)} was reached before the admin guard`);
      },
    }
  ),
}));

// Run cached readers directly, so a reader placed before the guard is caught.
jest.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@/lib/actions/admin-actions", () => ({}));

import { requireAdminPage } from "@/lib/admin-guard";

const requireAdminPageMock = requireAdminPage as jest.MockedFunction<typeof requireAdminPage>;

const ADMIN_DIR = path.join(process.cwd(), "src", "app", "admin");

function findPages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findPages(full);
    return /^page\.(tsx|ts|jsx|js)$/.test(entry.name) ? [full] : [];
  });
}

const pages = findPages(ADMIN_DIR)
  .map((file) => ({ file, route: path.relative(process.cwd(), file) }))
  .sort((a, b) => a.route.localeCompare(b.route));

beforeEach(() => {
  mockPrismaTouches.length = 0;
  requireAdminPageMock.mockReset();
  requireAdminPageMock.mockRejectedValue(guardRejected);
});

describe("admin pages", () => {
  it("finds the admin pages on disk", () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
  });

  it.each(pages)("$route stops at the admin guard before reading data", async ({ file }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Page = require(file).default as (props: unknown) => unknown;

    const rendered = Page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });

    // A page that skips the guard returns JSX or fails for another reason; both fail here.
    await expect(rendered).rejects.toBe(guardRejected);
    expect(requireAdminPageMock).toHaveBeenCalledTimes(1);
    expect(mockPrismaTouches).toEqual([]);
  });
});
