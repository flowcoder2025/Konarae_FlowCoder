import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ api: "matching/quick" });

interface QuickMatchingRequest {
  companyId: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: QuickMatchingRequest = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    // Verify company access
    const membership = await prisma.companyMember.findFirst({
      where: {
        userId: session.user.id,
        companyId,
      },
      include: {
        company: {
          select: {
            businessCategory: true,
            companySize: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Company not found or access denied" },
        { status: 403 }
      );
    }

    // Get matching preferences
    const preferences = await prisma.matchingPreference.findFirst({
      where: {
        userId: session.user.id,
        companyId,
      },
    });

    // Find matching projects based on simple criteria
    const categories = preferences?.categories || [];
    const regions = preferences?.regions || ["전국"];

    // Build where clause for projects
    const projectWhere: any = {
      status: "active",
      OR: [
        { isPermanent: true },
        {
          deadline: {
            gte: new Date(),
          },
        },
      ],
    };

    // Query active projects
    const projects = await prisma.supportProject.findMany({
      where: projectWhere,
      orderBy: [
        { deadline: "asc" },
        { createdAt: "desc" },
      ],
      take: 20,
    });

    // Filter projects based on categories and regions in code
    const filteredProjects = projects.filter((project) => {
      // Category filter
      if (categories.length > 0) {
        const matchesCategory = categories.some(
          (cat) =>
            project.category?.includes(cat) ||
            project.subCategory?.includes(cat) ||
            project.name?.includes(cat)
        );
        if (!matchesCategory) return false;
      }

      // Region filter
      if (regions.length > 0 && !regions.includes("전국")) {
        const projectRegion = project.region;
        if (projectRegion && projectRegion !== "전국" && !regions.includes(projectRegion)) {
          return false;
        }
      }

      return true;
    });

    // Create matching results with simple scoring
    const matchingResults = await Promise.all(
      filteredProjects.map(async (project, index) => {
        // Check if result already exists
        const existing = await prisma.matchingResult.findUnique({
          where: {
            companyId_projectId: {
              companyId,
              projectId: project.id,
            },
          },
        });

        if (existing) {
          return existing;
        }

        // Simple scoring based on category match and recency
        const baseScore = 70;
        const categoryBonus = categories.some(
          (cat) =>
            project.category?.includes(cat) ||
            project.subCategory?.includes(cat) ||
            project.name?.includes(cat)
        )
          ? 15
          : 0;
        const recencyBonus = Math.max(0, 10 - index);

        const totalScore = Math.min(100, baseScore + categoryBonus + recencyBonus);
        const confidence =
          totalScore >= 85 ? "high" : totalScore >= 70 ? "medium" : "low";

        // Build match reasons
        const matchReasons: string[] = [];
        if (categoryBonus > 0) {
          matchReasons.push("관심 분야 일치");
        }
        if (project.deadline) {
          const daysLeft = Math.ceil(
            (project.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          if (daysLeft <= 30) {
            matchReasons.push(`마감 ${daysLeft}일 전`);
          }
        }
        if (project.isPermanent) {
          matchReasons.push("상시 모집");
        }

        return prisma.matchingResult.create({
          data: {
            userId: session.user.id,
            companyId,
            projectId: project.id,
            totalScore,
            businessSimilarityScore: baseScore,
            categoryScore: categoryBonus > 0 ? 80 : 50,
            eligibilityScore: 70,
            timelinessScore: recencyBonus * 10,
            amountScore: 50,
            confidence,
            matchReasons,
          },
        });
      })
    );

    logger.info("Quick matching completed", {
      companyId,
      userId: session.user.id,
      resultsCount: matchingResults.length,
    });

    return NextResponse.json({
      success: true,
      resultsCount: matchingResults.length,
    });
  } catch (error) {
    logger.error("Failed to run quick matching", { error });
    return NextResponse.json(
      { error: "매칭 실행에 실패했습니다" },
      { status: 500 }
    );
  }
}
