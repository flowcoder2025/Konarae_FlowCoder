/**
 * Dashboard Statistics API
 * Provides summary statistics for the user's dashboard
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's companies
    const userCompanies = await prisma.companyMember.findMany({
      where: { userId },
      select: { companyId: true },
    });

    const companyIds = userCompanies.map((cm) => cm.companyId);

    // Parallel queries for better performance
    const [
      companiesCount,
      matchingResultsCount,
      businessPlansCount,
      evaluationsCount,
      recentMatching,
      recentPlans,
      recentEvaluations,
      upcomingDeadlines,
    ] = await Promise.all([
      // Total companies user is part of
      prisma.company.count({
        where: { id: { in: companyIds } },
      }),

      // Total matching results
      prisma.matchingResult.count({
        where: { companyId: { in: companyIds } },
      }),

      // Total business plans
      prisma.businessPlan.count({
        where: {
          OR: [
            { userId },
            { companyId: { in: companyIds } },
          ],
        },
      }),

      // Total evaluations
      prisma.evaluation.count({
        where: { userId },
      }),

      // Recent 5 matching results
      prisma.matchingResult.findMany({
        where: { companyId: { in: companyIds } },
        include: {
          company: { select: { name: true } },
          project: { select: { name: true, organization: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Recent 5 business plans
      prisma.businessPlan.findMany({
        where: {
          OR: [
            { userId },
            { companyId: { in: companyIds } },
          ],
        },
        include: {
          company: { select: { name: true } },
          project: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Recent 5 evaluations
      prisma.evaluation.findMany({
        where: { userId },
        include: {
          businessPlan: {
            select: { title: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Upcoming deadlines (next 30 days)
      prisma.supportProject.findMany({
        where: {
          deadline: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          status: "active",
        },
        select: {
          id: true,
          name: true,
          organization: true,
          deadline: true,
          amountMax: true,
        },
        orderBy: { deadline: "asc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      stats: {
        companiesCount,
        matchingResultsCount,
        businessPlansCount,
        evaluationsCount,
      },
      recent: {
        matching: recentMatching.map((m) => ({
          id: m.id,
          companyName: m.company.name,
          projectTitle: m.project.name,
          projectAgency: m.project.organization,
          score: m.totalScore,
          createdAt: m.createdAt,
        })),
        plans: recentPlans.map((p) => ({
          id: p.id,
          title: p.title,
          companyName: p.company?.name,
          projectTitle: p.project?.name,
          status: p.status,
          createdAt: p.createdAt,
        })),
        evaluations: recentEvaluations.map((e) => ({
          id: e.id,
          planTitle: e.businessPlan?.title || "외부 파일",
          totalScore: e.totalScore,
          status: e.status,
          createdAt: e.createdAt,
        })),
      },
      upcomingDeadlines: upcomingDeadlines.map((p) => ({
        id: p.id,
        title: p.name,
        agency: p.organization,
        deadline: p.deadline!,
        budget: p.amountMax,
        daysLeft: Math.ceil(
          (new Date(p.deadline!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      })),
    });
  } catch (error) {
    console.error("[Dashboard Stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
