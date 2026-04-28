import { NextRequest, NextResponse } from "next/server";
import { parsePublicProjectQuery } from "@/lib/projects/public-query";
import { listPublicProjects } from "@/lib/projects/public-service";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

export async function GET(request: NextRequest) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const query = parsePublicProjectQuery(request.nextUrl.searchParams);
  const result = await listPublicProjects(query);
  return NextResponse.json(result, { headers: rateLimitResult.headers });
}
