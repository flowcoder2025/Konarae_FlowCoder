import { NextResponse } from "next/server";
import { listPublicCategories } from "@/lib/projects/public-service";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

export async function GET(request: Request) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const categories = await listPublicCategories();

  return NextResponse.json(
    { categories: categories.map((item) => ({ value: item.category, count: item._count })) },
    { headers: rateLimitResult.headers }
  );
}
