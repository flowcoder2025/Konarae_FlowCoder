/**
 * Matching Preferences API (PRD 4.4)
 * GET /api/matching/preferences - Get user preferences
 * POST /api/matching/preferences - Save preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkCompanyPermission } from "@/lib/rebac";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "matching-preferences" });

const preferencesSchema = z.object({
  companyId: z.string().min(1),
  categories: z.array(z.string()).optional(),
  minAmount: z.string().optional(), // BigInt as string
  maxAmount: z.string().optional(),
  regions: z.array(z.string()).optional(), // 광역시·도 (17개)
  subRegions: z.array(z.string()).optional(), // 시·군·구
  excludeKeywords: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    // Check permission
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      companyId,
      "viewer"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const preferences = await prisma.matchingPreference.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
    });

    if (!preferences) {
      return NextResponse.json({
        preferences: null,
        message: "No preferences found",
      });
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    logger.error("Failed to fetch preferences", { error });
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = preferencesSchema.parse(body);

    // Check permission (at least member)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      validatedData.companyId,
      "member"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Convert string amounts to BigInt
    const minAmount = validatedData.minAmount
      ? BigInt(validatedData.minAmount)
      : null;
    const maxAmount = validatedData.maxAmount
      ? BigInt(validatedData.maxAmount)
      : null;

    // Upsert preferences
    const preferences = await prisma.matchingPreference.upsert({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId: validatedData.companyId,
        },
      },
      update: {
        categories: validatedData.categories || [],
        minAmount,
        maxAmount,
        regions: validatedData.regions || [],
        subRegions: validatedData.subRegions || [],
        excludeKeywords: validatedData.excludeKeywords || [],
      },
      create: {
        userId: session.user.id,
        companyId: validatedData.companyId,
        categories: validatedData.categories || [],
        minAmount,
        maxAmount,
        regions: validatedData.regions || [],
        subRegions: validatedData.subRegions || [],
        excludeKeywords: validatedData.excludeKeywords || [],
      },
    });

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to save preferences", { error });
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}
