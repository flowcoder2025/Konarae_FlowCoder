import { NextRequest, NextResponse } from "next/server";
import { parsePublicProjectQuery } from "@/lib/projects/public-query";
import { listPublicProjects } from "@/lib/projects/public-service";

export async function GET(request: NextRequest) {
  const query = parsePublicProjectQuery(request.nextUrl.searchParams);
  const result = await listPublicProjects(query);
  return NextResponse.json(result);
}
