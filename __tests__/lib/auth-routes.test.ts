import fs from "node:fs";
import path from "node:path";
import * as authRoutes from "@/lib/auth-routes";
import {
  ADMIN_LOGIN_PATH,
  PUBLIC_FILES,
  buildAdminLoginUrl,
  buildLoginUrl,
  resolveAuthRoute,
  sanitizeCallbackUrl,
} from "@/lib/auth-routes";

function decide(path: string, isLoggedIn = false) {
  const url = new URL(path, "https://mate.flow-coder.com");
  return resolveAuthRoute({
    pathname: url.pathname,
    search: url.search,
    isLoggedIn,
  });
}

describe("resolveAuthRoute", () => {
  it("lets an anonymous visitor reach the sign-in page", () => {
    expect(decide("/login")).toEqual({ action: "allow" });
    expect(decide("/login?callbackUrl=%2Fadmin")).toEqual({ action: "allow" });
    expect(decide("/login?error=OAuthAccountNotLinked")).toEqual({ action: "allow" });
  });

  it("sends an anonymous /admin request to the admin sign-in with a relative callback", () => {
    expect(decide("/admin")).toEqual({
      action: "redirect",
      location: "/admin-login?callbackUrl=%2Fadmin",
    });
  });

  it("keeps the path and query of the admin page in the admin sign-in callback", () => {
    expect(decide("/admin/crawler?tab=jobs")).toEqual({
      action: "redirect",
      location: "/admin-login?callbackUrl=%2Fadmin%2Fcrawler%3Ftab%3Djobs",
    });
    expect(decide("/admin/crawler?tab=jobs&page=2")).toEqual({
      action: "redirect",
      location: "/admin-login?callbackUrl=%2Fadmin%2Fcrawler%3Ftab%3Djobs%26page%3D2",
    });
    expect(decide("/admin/users")).toEqual({
      action: "redirect",
      location: "/admin-login?callbackUrl=%2Fadmin%2Fusers",
    });
  });

  it("keeps sending other anonymous protected pages to the social sign-in", () => {
    expect(decide("/reports/2026?x=1")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Freports%2F2026%3Fx%3D1",
    });
  });

  it("lets anyone reach the admin sign-in page, with or without a session", () => {
    expect(decide("/admin-login")).toEqual({ action: "allow" });
    expect(decide("/admin-login?callbackUrl=%2Fadmin")).toEqual({ action: "allow" });
    expect(decide("/admin-login?callbackUrl=%2Fadmin&error=1")).toEqual({ action: "allow" });
    // A social session must see the form too; sending it away would loop via /admin.
    expect(decide("/admin-login", true)).toEqual({ action: "allow" });
    expect(decide("/admin-login?callbackUrl=%2Fadmin", true)).toEqual({ action: "allow" });
  });

  it("sends /admin-login sub-paths to the admin sign-in page itself", () => {
    const expected = { action: "redirect", location: "/admin-login" };
    expect(decide("/admin-login/x")).toEqual(expected);
    expect(decide("/admin-login/x", true)).toEqual(expected);
    expect(decide("/admin-login/")).toEqual(expected);
  });

  it("does not treat look-alike prefixes as admin routes", () => {
    expect(decide("/admin-loginx")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fadmin-loginx",
    });
    expect(decide("/administrator")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fadministrator",
    });
    expect(decide("/admin-login-help", true)).toEqual({ action: "allow" });
  });

  it("allows a signed-in user through to protected pages", () => {
    expect(decide("/admin", true)).toEqual({ action: "allow" });
    expect(decide("/admin/crawler", true)).toEqual({ action: "allow" });
  });

  it.each([
    "/dashboard",
    "/home",
    "/company",
    "/companies/abc",
    "/matching",
    "/matching/results/1",
    "/business-plans",
    "/evaluations",
    "/diagnosis",
    "/my-projects",
    "/settings/notifications",
    "/pipeline",
    "/pipeline/x",
  ])("still redirects legacy route %s to /projects", (path) => {
    const expected = { action: "redirect", location: "/projects" };
    expect(decide(path, false)).toEqual(expected);
    expect(decide(path, true)).toEqual(expected);
  });

  it("does not treat a look-alike of /pipeline as the legacy route", () => {
    expect(decide("/pipelines")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fpipelines",
    });
    expect(decide("/pipelines", true)).toEqual({ action: "allow" });
  });

  it.each(["/", "/projects", "/projects/abc", "/pricing", "/terms", "/privacy", "/refund", "/robots.txt", "/sitemap.xml"])(
    "keeps public route %s open",
    (path) => {
      expect(decide(path)).toEqual({ action: "allow" });
    }
  );

  it("sends /login sub-paths to the sign-in page itself", () => {
    const expected = { action: "redirect", location: "/login" };
    expect(decide("/login/anything")).toEqual(expected);
    expect(decide("/login/anything", true)).toEqual(expected);
    expect(decide("/login/")).toEqual(expected);
  });

  it("does not treat look-alike prefixes as the sign-in page or a legacy route", () => {
    expect(decide("/loginx")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Floginx",
    });
    expect(decide("/dashboards")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fdashboards",
    });
  });

  it("produces an admin callback that survives sanitizing unchanged", () => {
    const decision = decide("/admin/crawler?tab=jobs");
    if (decision.action !== "redirect") throw new Error("expected a redirect");
    const callback = new URL(decision.location, "https://mate.flow-coder.com").searchParams.get("callbackUrl");
    expect(sanitizeCallbackUrl(callback)).toBe("/admin/crawler?tab=jobs");
  });
});

describe("sanitizeCallbackUrl", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/crawler?tab=jobs&page=2", "/admin/crawler?tab=jobs&page=2"],
    ["/projects/abc", "/projects/abc"],
    ["/admin#section", "/admin"],
    ["/admin/../projects", "/projects"],
  ])("accepts local path %s", (input, expected) => {
    expect(sanitizeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    ["absolute https URL", "https://evil.example/admin"],
    ["absolute URL on the real host", "https://mate.flow-coder.com/admin"],
    ["protocol-relative URL", "//evil.example/admin"],
    ["backslash host", "/\\evil.example"],
    ["backslash later in the path", "/admin\\..\\evil"],
    ["tab that URL parsers strip", "/\t/evil.example"],
    ["newline that URL parsers strip", "/\n/evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,x"],
    ["relative path without a leading slash", "admin"],
    ["empty string", ""],
    ["dot segments that resolve to a double slash", "/.//evil.example"],
    ["the sign-in page", "/login"],
    ["the sign-in page with a nested callback", "/login?callbackUrl=%2Fadmin"],
    ["a /login sub-path", "/login/x"],
    ["an API route", "/api/auth/signout"],
    ["the API root", "/api"],
    ["the admin sign-in page", "/admin-login"],
    ["the admin sign-in page with a nested callback", "/admin-login?callbackUrl=%2Fadmin"],
    ["an /admin-login sub-path", "/admin-login/x"],
    ["the admin sign-in page reached by dot segments", "/admin/../admin-login"],
  ])("rejects %s", (_label, input) => {
    expect(sanitizeCallbackUrl(input)).toBe("/projects");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["repeated query parameter", ["/admin", "https://evil.example"]],
    ["number", 42],
    ["object", { toString: () => "/admin" }],
  ])("rejects non-string input: %s", (_label, input) => {
    expect(sanitizeCallbackUrl(input)).toBe("/projects");
  });

  it("rejects a value too long for the callback cookie", () => {
    expect(sanitizeCallbackUrl(`/admin?q=${"a".repeat(1991)}`)).toBe(`/admin?q=${"a".repeat(1991)}`);
    expect(sanitizeCallbackUrl(`/admin?q=${"a".repeat(1992)}`)).toBe("/projects");
  });

  it("returns the given fallback instead of the default", () => {
    expect(sanitizeCallbackUrl("https://evil.example", "/")).toBe("/");
    expect(sanitizeCallbackUrl("/admin-login", "/admin")).toBe("/admin");
  });

  it("does not confuse look-alike paths with the admin sign-in page", () => {
    expect(sanitizeCallbackUrl("/admin-loginx")).toBe("/admin-loginx");
  });

  it("keeps an encoded backslash inside the path, on the same origin", () => {
    expect(sanitizeCallbackUrl("/%5Cevil.example")).toBe("/%5Cevil.example");
  });
});

describe("buildLoginUrl", () => {
  it("encodes the callback path", () => {
    expect(buildLoginUrl("/admin")).toBe("/login?callbackUrl=%2Fadmin");
    expect(buildLoginUrl("/admin?a=1&b=2")).toBe("/login?callbackUrl=%2Fadmin%3Fa%3D1%26b%3D2");
  });

  it("takes no options", () => {
    expect(buildLoginUrl.length).toBe(1);
  });
});

describe("buildAdminLoginUrl", () => {
  it("points at the admin sign-in page", () => {
    expect(ADMIN_LOGIN_PATH).toBe("/admin-login");
  });

  it("encodes the callback path like buildLoginUrl", () => {
    expect(buildAdminLoginUrl("/admin")).toBe("/admin-login?callbackUrl=%2Fadmin");
    expect(buildAdminLoginUrl("/admin/crawler?tab=jobs&x=1")).toBe(
      "/admin-login?callbackUrl=%2Fadmin%2Fcrawler%3Ftab%3Djobs%26x%3D1"
    );
  });
});

describe("removed account-switch flow", () => {
  const SRC_DIR = path.join(process.cwd(), "src");
  const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
  const FORBIDDEN = [
    /access-denied/,
    /switchAccount/,
    /SWITCH_ACCOUNT/,
    /ADMIN_DENIED/,
    /prompt:\s*["']login["']/,
    /select_account/,
  ];

  function codeFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return codeFiles(full);
      return CODE_FILE.test(entry.name) ? [full] : [];
    });
  }

  it("has no page left at the old access-denied route", () => {
    expect(fs.existsSync(path.join(SRC_DIR, "app", "access-denied"))).toBe(false);
  });

  it("exports no denied-page path or switch-account flag", () => {
    expect(authRoutes).not.toHaveProperty("ADMIN_DENIED_PATH");
    expect(authRoutes).not.toHaveProperty("SWITCH_ACCOUNT_PARAM");
  });

  it("leaves no code in src referring to it", () => {
    const files = codeFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(100);

    const hits = files.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return FORBIDDEN.filter((pattern) => pattern.test(source)).map(
        (pattern) => `${path.relative(process.cwd(), file)}: ${pattern}`
      );
    });

    expect(hits).toEqual([]);
  });
});

describe("public files", () => {
  const PUBLIC_DIR = path.join(process.cwd(), "public");
  // Metadata routes generated from src/app (no file under public/).
  const METADATA_FILES = ["/manifest.webmanifest"];

  function publicFilesOnDisk(dir: string = PUBLIC_DIR): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      // Finder metadata and other dotfiles are not part of the site.
      if (entry.name.startsWith(".")) return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return publicFilesOnDisk(full);
      return [`/${path.relative(PUBLIC_DIR, full).split(path.sep).join("/")}`];
    });
  }

  it("lists exactly the files under public/ plus the metadata routes", () => {
    const onDisk = publicFilesOnDisk();

    expect(onDisk.length).toBeGreaterThan(0);
    expect([...PUBLIC_FILES].sort()).toEqual([...onDisk, ...METADATA_FILES].sort());
    expect(fs.existsSync(path.join(process.cwd(), "src", "app", "manifest.ts"))).toBe(true);
  });

  it("serves every public file to an anonymous visitor and to a signed-in one", () => {
    for (const file of PUBLIC_FILES) {
      expect({ file, decision: decide(file) }).toEqual({ file, decision: { action: "allow" } });
      expect({ file, decision: decide(file, true) }).toEqual({ file, decision: { action: "allow" } });
    }
  });

  it("matches the exact path only", () => {
    expect(decide("/Flow_icon.png/x")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2FFlow_icon.png%2Fx",
    });
    expect(decide("/flow_icon.png")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fflow_icon.png",
    });
    expect(decide("/fonts")).toEqual({ action: "redirect", location: "/login?callbackUrl=%2Ffonts" });
    expect(decide("/fonts/other.ttf")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Ffonts%2Fother.ttf",
    });
    expect(decide("/x/opengraph-image.png")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fx%2Fopengraph-image.png",
    });
  });

  it("does not open admin or legacy paths that end in a public file name", () => {
    expect(decide("/admin/Flow_icon.png")).toEqual({
      action: "redirect",
      location: "/admin-login?callbackUrl=%2Fadmin%2FFlow_icon.png",
    });
    expect(decide("/dashboard/opengraph-image.png")).toEqual({ action: "redirect", location: "/projects" });
    expect(decide("/dashboard/opengraph-image.png", true)).toEqual({ action: "redirect", location: "/projects" });
  });

  it("names no page, API or framework path", () => {
    for (const file of PUBLIC_FILES) {
      expect(file).toMatch(/^\/[^?#]+\.[a-z0-9]+$/);
      expect(file).not.toMatch(/^\/(api|admin|_next)(\/|$)/);
    }
  });
});
