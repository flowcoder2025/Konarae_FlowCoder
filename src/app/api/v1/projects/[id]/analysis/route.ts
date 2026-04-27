import { NextResponse } from "next/server";
import { getPublicProject } from "@/lib/projects/public-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getPublicProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ analysis: project.analysis });
}
