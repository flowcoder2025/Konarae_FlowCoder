import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidInternalRequest, unauthorizedInternalResponse } from "@/lib/internal-api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidInternalRequest(request)) return unauthorizedInternalResponse();

  const { id } = await params;
  const project = await prisma.supportProject.findUnique({
    where: { id },
    include: { attachments: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}
