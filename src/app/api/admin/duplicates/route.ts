/**
 * Admin Duplicates API
 * GET /api/admin/duplicates - List duplicate groups
 * PATCH /api/admin/duplicates - Update group review status
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { handleAPIError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/duplicates
 * List duplicate groups with their projects
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status"); // auto, pending_review, confirmed, rejected
    const minSources = parseInt(searchParams.get("minSources") || "1");

    const where = {
      ...(status ? { reviewStatus: status } : {}),
      sourceCount: { gte: minSources },
    };

    const [groups, total] = await Promise.all([
      prisma.projectGroup.findMany({
        where,
        include: {
          canonicalProject: {
            select: {
              id: true,
              name: true,
              organization: true,
              region: true,
              deadline: true,
              category: true,
            },
          },
          projects: {
            select: {
              id: true,
              name: true,
              organization: true,
              region: true,
              isCanonical: true,
              sourceUrl: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [
          { reviewStatus: "asc" }, // pending_review first
          { sourceCount: "desc" },
          { updatedAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.projectGroup.count({ where }),
    ]);

    // 통계 조회
    const stats = await prisma.projectGroup.groupBy({
      by: ["reviewStatus"],
      _count: true,
    });

    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        normalizedName: g.normalizedName,
        projectYear: g.projectYear,
        region: g.region,
        sourceCount: g.sourceCount,
        mergeConfidence: g.mergeConfidence,
        reviewStatus: g.reviewStatus,
        canonicalProject: g.canonicalProject,
        projects: g.projects,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        total: stats.reduce((sum, s) => sum + s._count, 0),
        byStatus: Object.fromEntries(
          stats.map((s) => [s.reviewStatus, s._count])
        ),
      },
    });
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}

/**
 * PATCH /api/admin/duplicates
 * Update group review status or canonical project
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { groupId, action, newCanonicalId, reviewStatus } = body;

    if (!groupId) {
      return NextResponse.json(
        { error: "groupId is required" },
        { status: 400 }
      );
    }

    const group = await prisma.projectGroup.findUnique({
      where: { id: groupId },
      include: { projects: true },
    });

    if (!group) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      );
    }

    // Action: 리뷰 상태 변경
    if (action === "updateStatus" && reviewStatus) {
      const validStatuses = ["auto", "pending_review", "confirmed", "rejected"];
      if (!validStatuses.includes(reviewStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Valid: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      await prisma.projectGroup.update({
        where: { id: groupId },
        data: { reviewStatus },
      });

      return NextResponse.json({
        success: true,
        message: `Group status updated to ${reviewStatus}`,
      });
    }

    // Action: Canonical 프로젝트 변경
    if (action === "changeCanonical" && newCanonicalId) {
      const projectInGroup = group.projects.find(
        (p) => p.id === newCanonicalId
      );
      if (!projectInGroup) {
        return NextResponse.json(
          { error: "Project not in this group" },
          { status: 400 }
        );
      }

      // 트랜잭션으로 업데이트
      await prisma.$transaction([
        // 기존 canonical을 false로
        prisma.supportProject.updateMany({
          where: { groupId: groupId },
          data: { isCanonical: false },
        }),
        // 새 canonical을 true로
        prisma.supportProject.update({
          where: { id: newCanonicalId },
          data: { isCanonical: true },
        }),
        // 그룹 업데이트
        prisma.projectGroup.update({
          where: { id: groupId },
          data: {
            canonicalProjectId: newCanonicalId,
            reviewStatus: "confirmed",
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: `Canonical project changed to ${newCanonicalId}`,
      });
    }

    // Action: 프로젝트 분리 (그룹에서 제거)
    if (action === "separate" && body.projectId) {
      const projectToSeparate = group.projects.find(
        (p) => p.id === body.projectId
      );
      if (!projectToSeparate) {
        return NextResponse.json(
          { error: "Project not in this group" },
          { status: 400 }
        );
      }

      // Canonical은 분리할 수 없음
      if (projectToSeparate.isCanonical) {
        return NextResponse.json(
          { error: "Cannot separate canonical project. Change canonical first." },
          { status: 400 }
        );
      }

      // 새 그룹 생성 및 프로젝트 이동
      const project = await prisma.supportProject.findUnique({
        where: { id: body.projectId },
      });

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      await prisma.$transaction([
        // 새 그룹 생성
        prisma.projectGroup.create({
          data: {
            normalizedName: project.normalizedName || project.name,
            projectYear: project.projectYear,
            region: project.region,
            canonicalProjectId: project.id,
            mergeConfidence: 1.0,
            reviewStatus: "confirmed",
            sourceCount: 1,
          },
        }),
        // 원래 그룹 소스 카운트 감소
        prisma.projectGroup.update({
          where: { id: groupId },
          data: { sourceCount: { decrement: 1 } },
        }),
      ]);

      // 새로 생성된 그룹 ID 조회
      const newGroup = await prisma.projectGroup.findFirst({
        where: {
          canonicalProjectId: project.id,
        },
        orderBy: { createdAt: "desc" },
      });

      // 프로젝트 업데이트
      await prisma.supportProject.update({
        where: { id: body.projectId },
        data: {
          groupId: newGroup?.id,
          isCanonical: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Project ${body.projectId} separated to new group`,
        newGroupId: newGroup?.id,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Valid actions: updateStatus, changeCanonical, separate" },
      { status: 400 }
    );
  } catch (error) {
    return handleAPIError(error, req.url);
  }
}
