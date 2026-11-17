/**
 * Client IP for the admin login throttle.
 *
 * Only trusted on Vercel. Vercel overwrites `x-forwarded-for` with the client
 * IP and does not forward an incoming value (to prevent spoofing);
 * `x-real-ip` and `x-vercel-forwarded-for` carry the same IP.
 * https://vercel.com/docs/headers/request-headers
 *
 * Anywhere else these headers are client-controlled, so no IP is reported and
 * only the per-email limit applies.
 */

// An IPv6 address with a zone id fits well within this.
const MAX_IP_LENGTH = 64;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_IP_LENGTH);
}

export function getClientIp(request: Request): string | null {
  if (process.env.VERCEL !== "1") return null;

  const { headers } = request;
  return (
    clean(headers.get("x-real-ip")) ??
    clean(headers.get("x-vercel-forwarded-for")) ??
    clean(headers.get("x-forwarded-for")?.split(",")[0])
  );
}
