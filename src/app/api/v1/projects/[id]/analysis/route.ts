import { NextResponse } from "next/server";
import { getPublicProject } from "@/lib/projects/public-service";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await enforcePublicApiRateLimit(request);
  if (rateLimitResult.response) return rateLimitResult.response;

  const { id } = await params;
  const project = await getPublicProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: rateLimitResult.headers });
  }

  return NextResponse.json({ analysis: project.analysis }, { headers: rateLimitResult.headers });
}
