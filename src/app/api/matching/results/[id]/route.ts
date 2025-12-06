/**
 * Matching Result Detail API (PRD 4.4)
 * GET /api/matching/results/:id - Get result details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const result = await prisma.matchingResult.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        project: true,
        company: true,
      },
    });

    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[API] Get matching result error:", error);
    return NextResponse.json(
      { error: "Failed to fetch matching result" },
      { status: 500 }
    );
  }
}
