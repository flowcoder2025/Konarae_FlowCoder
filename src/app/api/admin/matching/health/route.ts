/**
 * Admin Matching Health Check API
 * GET /api/admin/matching/health
 *
 * Monitors matching quality and detects anomalies:
 * - Duplicate (companyId, projectId) pairs
 * - Orphaned results (deleted company/project)
 * - Stale results (not refreshed recently)
 * - Score distribution anomalies
 * - Per-company refresh status
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ module: "admin-matching-health" });

export const dynamic = "force-dynamic";

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  value: number | string;
  message: string;
}

export async function GET() {
  try {
    await requireAdmin();

    const checks: HealthCheck[] = [];
    const now = new Date();

    // 1. Duplicate check (should always be 0 due to @@unique constraint)
    const duplicates = await prisma.$queryRaw<
      Array<{ company_id: string; project_id: string; cnt: bigint }>
    >`
      SELECT "companyId" as company_id, "projectId" as project_id, COUNT(*) as cnt
      FROM "MatchingResult"
      GROUP BY "companyId", "projectId"
      HAVING COUNT(*) > 1
      LIMIT 10
    `;

    checks.push({
      name: "duplicate_pairs",
      status: duplicates.length === 0 ? "pass" : "fail",
      value: duplicates.length,
      message:
        duplicates.length === 0
          ? "No duplicate (company, project) pairs"
          : `Found ${duplicates.length} duplicate pair(s) - DB constraint may be bypassed`,
    });

    // 2. Orphaned results (company or project deleted/missing)
    const orphanedByCompany = await prisma.$queryRaw<
      Array<{ cnt: bigint }>
    >`
      SELECT COUNT(*) as cnt FROM "MatchingResult" mr
      LEFT JOIN "Company" c ON mr."companyId" = c.id
      WHERE c.id IS NULL OR c."deletedAt" IS NOT NULL
    `;
    const orphanedByProject = await prisma.$queryRaw<
      Array<{ cnt: bigint }>
    >`
      SELECT COUNT(*) as cnt FROM "MatchingResult" mr
      LEFT JOIN "SupportProject" sp ON mr."projectId" = sp.id
      WHERE sp.id IS NULL OR sp."deletedAt" IS NOT NULL
    `;

    const orphanCount =
      Number(orphanedByCompany[0]?.cnt ?? 0) +
      Number(orphanedByProject[0]?.cnt ?? 0);

    checks.push({
      name: "orphaned_results",
      status: orphanCount === 0 ? "pass" : orphanCount < 10 ? "warn" : "fail",
      value: orphanCount,
      message:
        orphanCount === 0
          ? "No orphaned matching results"
          : `${orphanCount} result(s) linked to deleted company/project`,
    });

    // 3. Staleness check (last refresh per company)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const staleCompanies = await prisma.$queryRaw<
      Array<{ company_id: string; company_name: string; last_refresh: Date }>
    >`
      SELECT
        mr."companyId" as company_id,
        c.name as company_name,
        MAX(mr."updatedAt") as last_refresh
      FROM "MatchingResult" mr
      JOIN "Company" c ON mr."companyId" = c.id AND c."deletedAt" IS NULL
      GROUP BY mr."companyId", c.name
      HAVING MAX(mr."updatedAt") < ${threeDaysAgo}
      ORDER BY MAX(mr."updatedAt") ASC
      LIMIT 20
    `;

    checks.push({
      name: "stale_companies",
      status:
        staleCompanies.length === 0
          ? "pass"
          : staleCompanies.length < 5
            ? "warn"
            : "fail",
      value: staleCompanies.length,
      message:
        staleCompanies.length === 0
          ? "All companies refreshed within 3 days"
          : `${staleCompanies.length} company(ies) not refreshed in 3+ days`,
    });

    // 4. Score distribution check (detect anomalies)
    const scoreStats = await prisma.$queryRaw<
      Array<{
        avg_score: number;
        min_score: number;
        max_score: number;
        cnt: bigint;
        zero_count: bigint;
        perfect_count: bigint;
      }>
    >`
      SELECT
        ROUND(AVG("totalScore")::numeric, 2) as avg_score,
        MIN("totalScore") as min_score,
        MAX("totalScore") as max_score,
        COUNT(*) as cnt,
        COUNT(*) FILTER (WHERE "totalScore" = 0) as zero_count,
        COUNT(*) FILTER (WHERE "totalScore" >= 95) as perfect_count
      FROM "MatchingResult"
    `;

    const stats = scoreStats[0];
    const totalCount = Number(stats?.cnt ?? 0);
    const zeroCount = Number(stats?.zero_count ?? 0);
    const perfectCount = Number(stats?.perfect_count ?? 0);
    const zeroRatio = totalCount > 0 ? zeroCount / totalCount : 0;
    const perfectRatio = totalCount > 0 ? perfectCount / totalCount : 0;

    const scoreAnomaly = zeroRatio > 0.3 || perfectRatio > 0.5;

    checks.push({
      name: "score_distribution",
      status: scoreAnomaly ? "warn" : "pass",
      value: `avg=${stats?.avg_score ?? 0}, range=[${stats?.min_score ?? 0}-${stats?.max_score ?? 0}]`,
      message: scoreAnomaly
        ? `Anomaly: ${(zeroRatio * 100).toFixed(1)}% zero scores, ${(perfectRatio * 100).toFixed(1)}% perfect scores`
        : `Healthy distribution (${totalCount} results)`,
    });

    // 5. Recent activity summary
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentActivity = await prisma.$queryRaw<
      Array<{ inserted: bigint; updated: bigint }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE "createdAt" >= ${oneDayAgo} AND "isNew" = true) as inserted,
        COUNT(*) FILTER (WHERE "updatedAt" >= ${oneDayAgo} AND "createdAt" < ${oneDayAgo}) as updated
      FROM "MatchingResult"
    `;

    const inserted = Number(recentActivity[0]?.inserted ?? 0);
    const updated = Number(recentActivity[0]?.updated ?? 0);

    checks.push({
      name: "recent_activity_24h",
      status: inserted + updated > 0 ? "pass" : "warn",
      value: `new=${inserted}, updated=${updated}`,
      message:
        inserted + updated > 0
          ? `Active: ${inserted} new + ${updated} updated in last 24h`
          : "No matching activity in last 24h - check cron jobs",
    });

    // 6. Company coverage
    const companyCoverage = await prisma.$queryRaw<
      Array<{ total_companies: bigint; matched_companies: bigint }>
    >`
      SELECT
        (SELECT COUNT(*) FROM "Company" WHERE "deletedAt" IS NULL) as total_companies,
        (SELECT COUNT(DISTINCT "companyId") FROM "MatchingResult") as matched_companies
    `;

    const totalCompanies = Number(
      companyCoverage[0]?.total_companies ?? 0
    );
    const matchedCompanies = Number(
      companyCoverage[0]?.matched_companies ?? 0
    );

    checks.push({
      name: "company_coverage",
      status: "pass",
      value: `${matchedCompanies}/${totalCompanies}`,
      message: `${matchedCompanies} of ${totalCompanies} companies have matching results`,
    });

    // Overall status
    const hasFailure = checks.some((c) => c.status === "fail");
    const hasWarning = checks.some((c) => c.status === "warn");
    const overallStatus = hasFailure
      ? "unhealthy"
      : hasWarning
        ? "degraded"
        : "healthy";

    const response = {
      status: overallStatus,
      timestamp: now.toISOString(),
      checks,
      staleCompanies:
        staleCompanies.length > 0
          ? staleCompanies.map((c) => ({
              companyId: c.company_id,
              name: c.company_name,
              lastRefresh: c.last_refresh,
            }))
          : undefined,
      duplicates:
        duplicates.length > 0
          ? duplicates.map((d) => ({
              companyId: d.company_id,
              projectId: d.project_id,
              count: Number(d.cnt),
            }))
          : undefined,
    };

    logger.info("Matching health check", {
      status: overallStatus,
      checks: checks.map((c) => `${c.name}:${c.status}`).join(", "),
    });

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("관리자 권한")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.error("Matching health check error", { error });
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
