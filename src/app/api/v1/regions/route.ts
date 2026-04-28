import { NextResponse } from "next/server";
import { listPublicRegions } from "@/lib/projects/public-service";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

export async function GET(request: Request) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const regions = await listPublicRegions();

  return NextResponse.json(
    { regions: regions.map((item) => ({ value: item.region, count: item._count })) },
    { headers: rateLimitResult.headers }
  );
}
