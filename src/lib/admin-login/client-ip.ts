/**
 * Client IP for the admin login throttle.
 *
 * Only trusted on Vercel. Vercel overwrites `x-forwarded-for` with the client
 * IP and does not forward an incoming value (to prevent spoofing);
 * `x-real-ip` and `x-vercel-forwarded-for` carry the same IP.
 * https://vercel.com/docs/headers/request-headers
 *
 * Anywhere else these headers are client-controlled, so no IP is reported.
 * With no IP the throttle uses only its email-wide bucket (50 attempts per
 * 15 minutes); the per-IP and email+IP limits do not apply. In production
 * that is logged once per process (never with header values): `VERCEL` only
 * exists at runtime when the project exposes Vercel's system environment
 * variables.
 */

import { createLogger } from "@/lib/logger";

// An IPv6 address with a zone id fits well within this.
const MAX_IP_LENGTH = 64;

const logger = createLogger({ lib: "admin-login" });
let warnedNoIp = false;

type NoIpReason = "vercel_system_env_not_exposed" | "no_client_ip_header";

const NO_IP_MESSAGES: Record<NoIpReason, string> = {
  vercel_system_env_not_exposed:
    "Admin login IP limit disabled: VERCEL is not set, so Vercel system env is not exposed; only the email-wide limit applies",
  no_client_ip_header: "Admin login IP limit skipped: no client IP header on Vercel; only the email-wide limit applies",
};

function warnNoIpOnce(reason: NoIpReason): void {
  if (warnedNoIp || process.env.NODE_ENV !== "production") return;
  warnedNoIp = true;
  logger.warn(NO_IP_MESSAGES[reason], { reason });
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_IP_LENGTH);
}

export function getClientIp(request: Request): string | null {
  if (process.env.VERCEL !== "1") {
    warnNoIpOnce("vercel_system_env_not_exposed");
    return null;
  }

  const { headers } = request;
  const ip =
    clean(headers.get("x-real-ip")) ??
    clean(headers.get("x-vercel-forwarded-for")) ??
    clean(headers.get("x-forwarded-for")?.split(",")[0]);
  if (ip === null) warnNoIpOnce("no_client_ip_header");
  return ip;
}
