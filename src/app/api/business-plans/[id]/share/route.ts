/**
 * Business Plan Sharing API (PRD 4.5)
 * POST /api/business-plans/:id/share - Share with user
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { check, grant } from "@/lib/rebac";
import { z } from "zod";

const shareSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permission (owner or editor)
    const hasPermission = await check(
      session.user.id,
      "business_plan",
      id,
      "editor"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = shareSchema.parse(body);

    // Find user by email
    const { prisma } = await import("@/lib/prisma");
    const targetUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found with this email" },
        { status: 404 }
      );
    }

    // Grant permission
    await grant(
      "business_plan",
      id,
      validatedData.role,
      "user",
      targetUser.id
    );

    return NextResponse.json({
      success: true,
      message: `Shared with ${validatedData.email} as ${validatedData.role}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[API] Share business plan error:", error);
    return NextResponse.json(
      { error: "Failed to share business plan" },
      { status: 500 }
    );
  }
}
