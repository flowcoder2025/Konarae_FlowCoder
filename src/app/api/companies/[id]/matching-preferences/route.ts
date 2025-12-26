/**
 * Matching Preferences API
 * GET/POST /api/companies/[id]/matching-preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "company-matching-preferences" });

const preferencesSchema = z.object({
  categories: z.array(z.string()).min(1, "최소 1개의 카테고리를 선택해주세요"),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  regions: z.array(z.string()).optional().default([]),
  excludeKeywords: z.array(z.string()).optional().default([]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - 매칭 선호도 조회
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await context.params;

    // Check permission
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "viewer"
    );
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get existing preferences
    const preferences = await prisma.matchingPreference.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
    });

    if (!preferences) {
      return NextResponse.json({ preferences: null });
    }

    return NextResponse.json({
      preferences: {
        categories: preferences.categories,
        minAmount: preferences.minAmount?.toString() || null,
        maxAmount: preferences.maxAmount?.toString() || null,
        regions: preferences.regions,
        excludeKeywords: preferences.excludeKeywords,
        updatedAt: preferences.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Failed to get matching preferences", { error });
    return NextResponse.json(
      { error: "Failed to get matching preferences" },
      { status: 500 }
    );
  }
}

// POST - 매칭 선호도 저장/업데이트
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await context.params;

    // Check permission (need at least member)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "member"
    );
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = preferencesSchema.parse(body);

    // Upsert preferences
    const preferences = await prisma.matchingPreference.upsert({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
      create: {
        userId: session.user.id,
        companyId,
        categories: validatedData.categories,
        minAmount: validatedData.minAmount
          ? BigInt(validatedData.minAmount)
          : null,
        maxAmount: validatedData.maxAmount
          ? BigInt(validatedData.maxAmount)
          : null,
        regions: validatedData.regions || [],
        excludeKeywords: validatedData.excludeKeywords || [],
      },
      update: {
        categories: validatedData.categories,
        minAmount: validatedData.minAmount
          ? BigInt(validatedData.minAmount)
          : null,
        maxAmount: validatedData.maxAmount
          ? BigInt(validatedData.maxAmount)
          : null,
        regions: validatedData.regions || [],
        excludeKeywords: validatedData.excludeKeywords || [],
      },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        categories: preferences.categories,
        minAmount: preferences.minAmount?.toString() || null,
        maxAmount: preferences.maxAmount?.toString() || null,
        regions: preferences.regions,
        excludeKeywords: preferences.excludeKeywords,
        updatedAt: preferences.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to save matching preferences", { error });
    return NextResponse.json(
      { error: "Failed to save matching preferences" },
      { status: 500 }
    );
  }
}

// DELETE - 매칭 선호도 삭제
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await context.params;

    // Check permission (need at least member)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "member"
    );
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.matchingPreference.delete({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete matching preferences", { error });
    return NextResponse.json(
      { error: "Failed to delete matching preferences" },
      { status: 500 }
    );
  }
}
