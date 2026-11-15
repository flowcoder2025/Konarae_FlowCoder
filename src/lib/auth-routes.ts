/**
 * Route decisions for the auth middleware and the login page.
 * Pure functions only: this module runs on the Edge runtime and must not
 * import next-auth, Prisma, or anything Node-specific.
 */

export const LOGIN_PATH = "/login";
export const DEFAULT_AFTER_LOGIN = "/projects";

const PUBLIC_ROUTES = [
  "/",
  "/projects",
  "/pricing",
  "/terms",
  "/privacy",
  "/refund",
  "/robots.txt",
  "/sitemap.xml",
];

const LEGACY_REDIRECT_ROUTES = [
  "/dashboard",
  "/home",
  "/company",
  "/companies",
  "/matching",
  "/business-plans",
  "/evaluations",
  "/diagnosis",
  "/my-projects",
  "/settings",
];

const SANITIZE_BASE = "http://flowmate.invalid";
// Longer values risk overflowing the next-auth callback-url cookie.
const MAX_CALLBACK_LENGTH = 2000;
// Backslashes and control characters are rewritten or stripped by URL parsers,
// which can turn an apparently local path into another origin.
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Returns a same-origin path (pathname + search) that is safe to redirect to
 * after login, or the fallback when the value is missing or not a local page.
 */
export function sanitizeCallbackUrl(
  value: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN
): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (value.length > MAX_CALLBACK_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (UNSAFE_CHARS.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, SANITIZE_BASE);
  } catch {
    return fallback;
  }

  if (url.origin !== SANITIZE_BASE) return fallback;
  if (url.pathname.startsWith("//")) return fallback;
  if (matchesRoute(url.pathname, LOGIN_PATH)) return fallback;
  if (matchesRoute(url.pathname, "/api")) return fallback;

  return `${url.pathname}${url.search}`;
}

/** Login URL that returns the user to the given local path after sign-in. */
export function buildLoginUrl(callbackPath: string): string {
  return `${LOGIN_PATH}?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

export type AuthRouteDecision =
  | { action: "allow" }
  | { action: "redirect"; location: string };

export function resolveAuthRoute(input: {
  pathname: string;
  search: string;
  isLoggedIn: boolean;
}): AuthRouteDecision {
  const { pathname, search, isLoggedIn } = input;

  if (LEGACY_REDIRECT_ROUTES.some((route) => matchesRoute(pathname, route))) {
    return { action: "redirect", location: DEFAULT_AFTER_LOGIN };
  }

  // The sign-in page itself must stay reachable without a session.
  if (pathname === LOGIN_PATH) {
    return { action: "allow" };
  }

  // No pages live under /login; send them to the sign-in page itself.
  if (pathname.startsWith(`${LOGIN_PATH}/`)) {
    return { action: "redirect", location: LOGIN_PATH };
  }

  if (PUBLIC_ROUTES.some((route) => matchesRoute(pathname, route))) {
    return { action: "allow" };
  }

  if (isLoggedIn) {
    return { action: "allow" };
  }

  return { action: "redirect", location: buildLoginUrl(`${pathname}${search}`) };
}
