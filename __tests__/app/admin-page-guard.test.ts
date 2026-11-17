/**
 * Every server entry point under /admin must call the admin guard before it
 * does anything else. The admin layout is not enough: Next.js can render a
 * page without its layout.
 *
 * Entry points are discovered from disk, so a new admin page, nested layout,
 * template or parallel-route default is covered automatically. For each one the
 * default export and any metadata/viewport generator are checked.
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
}));

// Client components import these actions; the real module pulls in the crawler worker.
jest.mock("@/lib/actions/admin-actions", () => ({}));

// The admin layout's sign-out form imports next-auth (ESM only). Every export
// throws, so an entry that reads the session or signs out before the guard fails.
jest.mock("@/lib/auth", () => {
  const reached = (name: string) => () => {
    throw new Error(`${name}() was reached before the admin guard`);
  };
  return { auth: reached("auth"), signIn: reached("signIn"), signOut: reached("signOut") };
});

import { requireAdminPage } from "@/lib/admin-guard";

const requireAdminPageMock = requireAdminPage as jest.MockedFunction<typeof requireAdminPage>;

const ADMIN_DIR = path.join(process.cwd(), "src", "app", "admin");
const ENTRY_FILE = /^(page|layout|template|default)\.(tsx|ts|jsx|js)$/;
const ROUTE_FILE = /^route\.(tsx|ts|jsx|js)$/;
const GUARDED_EXPORTS = ["default", "generateMetadata", "generateViewport"] as const;

function findFiles(dir: string, pattern: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(process.cwd(), file);

const entries = findFiles(ADMIN_DIR, ENTRY_FILE)
  .map((file) => ({ file, name: relative(file) }))
  .sort((a, b) => a.name.localeCompare(b.name));

beforeEach(() => {
  mockPrismaTouches.length = 0;
  requireAdminPageMock.mockReset();
  requireAdminPageMock.mockImplementation(() => {
    const rejection = Promise.reject(guardRejected);
    // A caller that forgets `await` then fails its own test instead of crashing the run.
    rejection.catch(() => undefined);
    return rejection;
  });
});

describe("admin server entry points", () => {
  it("finds the admin pages and the admin layout on disk", () => {
    const names = entries.map((entry) => entry.name);

    expect(names.filter((name) => /page\.tsx$/.test(name)).length).toBeGreaterThanOrEqual(8);
    expect(names).toContain(path.join("src", "app", "admin", "layout.tsx"));
  });

  it("has no route handlers under /admin (admin APIs live under /api/admin)", () => {
    expect(findFiles(ADMIN_DIR, ROUTE_FILE).map(relative)).toEqual([]);
  });

  it.each(entries)("$name stops at the admin guard before doing anything else", async ({ file }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    const props = {
      children: null,
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    };

    expect(typeof mod.default).toBe("function");

    for (const exportName of GUARDED_EXPORTS) {
      const fn = mod[exportName];
      if (typeof fn !== "function") continue;

      requireAdminPageMock.mockClear();
      mockPrismaTouches.length = 0;

      const result = (fn as (...args: unknown[]) => unknown)(props, Promise.resolve({}));
      // Keeps a late rejection from crashing the run when an assertion below fails first.
      Promise.resolve(result).catch(() => undefined);

      // Called before the first await: nothing (fetch, another client, props) can run ahead of it.
      expect(requireAdminPageMock).toHaveBeenCalledTimes(1);
      // An entry that ignores the guard's answer returns JSX or fails for another reason.
      await expect(result).rejects.toBe(guardRejected);
      expect(requireAdminPageMock).toHaveBeenCalledTimes(1);
      expect(mockPrismaTouches).toEqual([]);
    }
  });
});
