import {
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

  it("sends an anonymous /admin request to the sign-in page with a relative callback", () => {
    expect(decide("/admin")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fadmin",
    });
  });

  it("keeps the path and query of the protected page in the callback", () => {
    expect(decide("/admin/crawler?tab=jobs&page=2")).toEqual({
      action: "redirect",
      location: "/login?callbackUrl=%2Fadmin%2Fcrawler%3Ftab%3Djobs%26page%3D2",
    });
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
  ])("still redirects legacy route %s to /projects", (path) => {
    const expected = { action: "redirect", location: "/projects" };
    expect(decide(path, false)).toEqual(expected);
    expect(decide(path, true)).toEqual(expected);
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

  it("produces a callback that survives sanitizing unchanged", () => {
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

  it("returns the given fallback instead of the default", () => {
    expect(sanitizeCallbackUrl("https://evil.example", "/")).toBe("/");
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
});
