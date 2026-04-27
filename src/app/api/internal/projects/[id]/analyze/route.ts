import { NextResponse } from "next/server";
import { analyzeProject } from "@/lib/crawler/project-analyzer";
import { isValidInternalRequest, unauthorizedInternalResponse } from "@/lib/internal-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidInternalRequest(request)) return unauthorizedInternalResponse();

  const { id } = await params;
  const result = await analyzeProject(id);

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
