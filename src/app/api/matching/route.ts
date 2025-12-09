/**
 * Matching API (PRD 4.4)
 * POST /api/matching - Execute matching for a company
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { executeMatching, storeMatchingResults } from "@/lib/matching";
import { sendMatchingResultNotification } from "@/lib/notifications";
import { z } from "zod";

const matchingSchema = z.object({
  companyId: z.string().min(1),
  saveResults: z.boolean().optional().default(true),
  preferences: z
    .object({
      categories: z.array(z.string()).optional(),
      minAmount: z.string().optional(), // BigInt as string
      maxAmount: z.string().optional(),
      regions: z.array(z.string()).optional(),
      excludeKeywords: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = matchingSchema.parse(body);

    // Check company permission (at least viewer)
    const hasPermission = await checkCompanyPermission(
      session.user.id,
      validatedData.companyId,
      "viewer"
    );

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Convert string amounts to BigInt if present
    const preferences = validatedData.preferences
      ? {
          ...validatedData.preferences,
          minAmount: validatedData.preferences.minAmount
            ? BigInt(validatedData.preferences.minAmount)
            : undefined,
          maxAmount: validatedData.preferences.maxAmount
            ? BigInt(validatedData.preferences.maxAmount)
            : undefined,
        }
      : undefined;

    // Execute matching
    const results = await executeMatching({
      companyId: validatedData.companyId,
      userId: session.user.id,
      preferences,
    });

    // Store results if requested
    let savedResultIds: Record<string, string> = {};
    if (validatedData.saveResults) {
      await storeMatchingResults(
        session.user.id,
        validatedData.companyId,
        results
      );

      // Query saved results to get their IDs
      const savedResults = await prisma.matchingResult.findMany({
        where: {
          userId: session.user.id,
          companyId: validatedData.companyId,
        },
        select: {
          id: true,
          projectId: true,
        },
      });

      // Create a map of projectId -> resultId
      savedResultIds = savedResults.reduce(
        (acc, r) => ({ ...acc, [r.projectId]: r.id }),
        {} as Record<string, string>
      );

      // Send notification if matches found
      if (results.length > 0) {
        await sendMatchingResultNotification(
          session.user.id,
          results.length
        ).catch((error) => {
          console.error("[API] Matching notification error:", error);
        });
      }
    }

    // Add result IDs to the response
    const resultsWithIds = results.map((result) => ({
      ...result,
      matchingResultId: savedResultIds[result.projectId] || null,
    }));

    return NextResponse.json({
      success: true,
      results: resultsWithIds,
      totalMatches: results.length,
      highConfidence: results.filter((r) => r.confidence === "high").length,
      mediumConfidence: results.filter((r) => r.confidence === "medium")
        .length,
      lowConfidence: results.filter((r) => r.confidence === "low").length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[API] Matching error:", error);
    return NextResponse.json(
      { error: "Failed to execute matching" },
      { status: 500 }
    );
  }
}
