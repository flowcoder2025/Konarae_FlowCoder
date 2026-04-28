import { createLogger } from "@/lib/logger";

const logger = createLogger({ module: "internal-api" });

let hasLoggedMissingInternalApiKey = false;

export function isValidInternalRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    if (!hasLoggedMissingInternalApiKey) {
      logger.warn("INTERNAL_API_KEY is not configured");
      hasLoggedMissingInternalApiKey = true;
    }
    return false;
  }
  return request.headers.get("X-Internal-Key") === expected;
}

export function unauthorizedInternalResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
