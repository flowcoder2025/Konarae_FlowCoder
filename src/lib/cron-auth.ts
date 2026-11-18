/**
 * Shared-secret checks for the cron routes (src/app/api/cron).
 *
 * A check passes only when its secret is configured: comparing a header with
 * `Bearer ${process.env.CRON_SECRET}` directly accepts the literal header
 * "Bearer undefined" in an environment where the variable is missing.
 * Node only (node:crypto); the cron routes do not run on the Edge runtime.
 */

import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** True only when `expected` is configured (non-empty) and `provided` equals it. */
export function matchesSecret(provided: string | null, expected: string | undefined): boolean {
  if (!expected || provided === null) return false;
  // Hash both sides so the comparison is constant-time for any lengths.
  return timingSafeEqual(digest(provided), digest(expected));
}

/** `Authorization: Bearer <CRON_SECRET>`, as Vercel Cron sends it. */
export function hasCronBearer(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return matchesSecret(req.headers.get("authorization"), `Bearer ${secret}`);
}

/** `x-api-key: <ADMIN_API_KEY>`, for manual runs. */
export function hasAdminApiKey(req: Request): boolean {
  return matchesSecret(req.headers.get("x-api-key"), process.env.ADMIN_API_KEY);
}

/** `x-worker-key: <WORKER_API_KEY>`, sent by the OCI worker. */
export function hasWorkerKey(req: Request): boolean {
  return matchesSecret(req.headers.get("x-worker-key"), process.env.WORKER_API_KEY);
}
