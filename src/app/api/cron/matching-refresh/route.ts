/**
 * Matching Refresh Cron Job (PRD Phase 8)
 * GET /api/cron/matching-refresh - Refresh matching results for active companies
 *
 * This endpoint should be called by Vercel Cron to periodically
 * refresh matching results for all active companies.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeMatching } from "@/lib/matching";

export async function GET(req: NextRequest) {
  try {
    // Verify cron authorization
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Matching refresh started");

    // Get all companies with auto-matching enabled
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        businessCategory: true,
        employeeCount: true,
        annualRevenue: true,
      },
      take: 100, // Limit to prevent timeout
    });

    let matchesRefreshed = 0;
    const errors: string[] = [];

    for (const company of companies) {
      try {
        // Get company's latest matching preferences
        const preference = await prisma.matchingPreference.findFirst({
          where: { companyId: company.id },
          orderBy: { createdAt: "desc" },
        });

        if (!preference) {
          console.log(`[Cron] No preferences for company ${company.id}, skipping`);
          continue;
        }

        // Execute matching (using first company member as userId)
        const firstMember = await prisma.companyMember.findFirst({
          where: { companyId: company.id },
          select: { userId: true },
        });

        if (!firstMember) {
          console.log(`[Cron] No members for company ${company.id}, skipping`);
          continue;
        }

        const results = await executeMatching({
          companyId: company.id,
          userId: firstMember.userId,
          preferences: {
            categories: preference.categories,
            minAmount: preference.minAmount || undefined,
            maxAmount: preference.maxAmount || undefined,
            regions: preference.regions || undefined,
            excludeKeywords: preference.excludeKeywords || undefined,
          },
        });

        // Store results in database
        if (results.length > 0) {
          // Delete old results (older than 30 days)
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          await prisma.matchingResult.deleteMany({
            where: {
              companyId: company.id,
              createdAt: { lt: thirtyDaysAgo },
            },
          });

          matchesRefreshed++;
        }

        console.log(
          `[Cron] Refreshed ${results.length} matches for company ${company.id}`
        );
      } catch (error) {
        const errorMsg = `Company ${company.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(`[Cron] Matching refresh error:`, errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(
      `[Cron] Matching refresh completed: ${matchesRefreshed}/${companies.length} companies processed`
    );

    return NextResponse.json({
      success: true,
      message: "Matching refresh completed",
      companiesProcessed: companies.length,
      matchesRefreshed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Cron] Matching refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh matching results" },
      { status: 500 }
    );
  }
}
