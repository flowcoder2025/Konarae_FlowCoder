import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/cache";

const DEFAULT_PUBLIC_API_LIMIT = 120;
const DEFAULT_PUBLIC_API_WINDOW_SECONDS = 60;

export interface PublicApiRateLimitOptions {
  limit?: number;
  windowSeconds?: number;
}

export interface PublicApiRateLimitResult {
  response: Response | null;
  headers: HeadersInit;
}

function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(",")[0]?.trim();
    if (firstForwardedIp) return firstForwardedIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

function buildRateLimitHeaders(limit: number, remaining: number, reset: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
  };
}

export async function enforcePublicApiRateLimit(
  request: Request,
  options: PublicApiRateLimitOptions = {}
): Promise<PublicApiRateLimitResult> {
  const limit = options.limit ?? DEFAULT_PUBLIC_API_LIMIT;
  const windowSeconds = options.windowSeconds ?? DEFAULT_PUBLIC_API_WINDOW_SECONDS;
  const identifier = getClientIdentifier(request);
  const result = await rateLimit(`public-api:${identifier}`, limit, windowSeconds);
  const headers = buildRateLimitHeaders(limit, result.remaining, result.reset);

  if (result.success) {
    return { response: null, headers };
  }

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));

  return {
    headers,
    response: NextResponse.json(
      {
        error: "Too many requests",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(retryAfter),
        },
      }
    ),
  };
}
