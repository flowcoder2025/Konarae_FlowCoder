/**
 * Admin Server Actions
 * Server-side actions for admin operations
 */

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { processCrawlJob } from "@/lib/crawler/worker";

type ActionResult = {
  success: boolean;
  message: string;
  error?: string;
};

/**
 * Start crawling job for a source
 */
export async function startCrawl(sourceId: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    // Check if source exists and is active
    const source = await prisma.crawlSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      return {
        success: false,
        message: "크롤링 소스를 찾을 수 없습니다",
        error: "SOURCE_NOT_FOUND",
      };
    }

    if (!source.isActive) {
      return {
        success: false,
        message: "비활성화된 소스입니다",
        error: "SOURCE_INACTIVE",
      };
    }

    // Create crawl job
    const job = await prisma.crawlJob.create({
      data: {
        sourceId,
        status: "pending",
      },
    });

    // Update source lastCrawled
    await prisma.crawlSource.update({
      where: { id: sourceId },
      data: { lastCrawled: new Date() },
    });

    // Process job asynchronously (don't await)
    processCrawlJob(job.id).catch((error) => {
      console.error("Background crawl job failed:", error);
    });

    revalidatePath("/admin/crawler");

    return {
      success: true,
      message: "크롤링 작업이 시작되었습니다",
    };
  } catch (error) {
    console.error("Start crawl error:", error);
    return {
      success: false,
      message: "크롤링 시작 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * Add new crawl source
 */
export async function addCrawlSource(data: {
  name: string;
  url: string;
  type: "web" | "api";
}): Promise<ActionResult> {
  try {
    await requireAdmin();

    // Validate URL
    try {
      new URL(data.url);
    } catch {
      return {
        success: false,
        message: "올바른 URL 형식이 아닙니다",
        error: "INVALID_URL",
      };
    }

    // Check duplicate
    const existing = await prisma.crawlSource.findFirst({
      where: { url: data.url },
    });

    if (existing) {
      return {
        success: false,
        message: "이미 등록된 URL입니다",
        error: "DUPLICATE_URL",
      };
    }

    // Create source
    await prisma.crawlSource.create({
      data: {
        name: data.name,
        url: data.url,
        type: data.type,
        isActive: true,
      },
    });

    revalidatePath("/admin/crawler");

    return {
      success: true,
      message: "크롤링 소스가 추가되었습니다",
    };
  } catch (error) {
    console.error("Add crawl source error:", error);
    return {
      success: false,
      message: "소스 추가 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * Delete support project (soft delete)
 */
export async function deleteProject(projectId: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    const project = await prisma.supportProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return {
        success: false,
        message: "프로젝트를 찾을 수 없습니다",
        error: "PROJECT_NOT_FOUND",
      };
    }

    // Soft delete
    await prisma.supportProject.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    revalidatePath("/admin/projects");

    return {
      success: true,
      message: "프로젝트가 삭제되었습니다",
    };
  } catch (error) {
    console.error("Delete project error:", error);
    return {
      success: false,
      message: "프로젝트 삭제 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * Update project status
 */
export async function updateProjectStatus(
  projectId: string,
  status: "draft" | "active" | "closed"
): Promise<ActionResult> {
  try {
    await requireAdmin();

    await prisma.supportProject.update({
      where: { id: projectId },
      data: { status },
    });

    revalidatePath("/admin/projects");

    return {
      success: true,
      message: "프로젝트 상태가 변경되었습니다",
    };
  } catch (error) {
    console.error("Update project status error:", error);
    return {
      success: false,
      message: "상태 변경 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * Update user role
 */
export async function updateUserRole(
  userId: string,
  role: "user" | "admin"
): Promise<ActionResult> {
  try {
    await requireAdmin();

    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    revalidatePath("/admin/users");

    return {
      success: true,
      message: "사용자 권한이 변경되었습니다",
    };
  } catch (error) {
    console.error("Update user role error:", error);
    return {
      success: false,
      message: "권한 변경 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * Toggle crawl source active status
 */
export async function toggleSourceActive(
  sourceId: string
): Promise<ActionResult> {
  try {
    await requireAdmin();

    const source = await prisma.crawlSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      return {
        success: false,
        message: "크롤링 소스를 찾을 수 없습니다",
        error: "SOURCE_NOT_FOUND",
      };
    }

    await prisma.crawlSource.update({
      where: { id: sourceId },
      data: { isActive: !source.isActive },
    });

    revalidatePath("/admin/crawler");

    return {
      success: true,
      message: source.isActive ? "소스가 비활성화되었습니다" : "소스가 활성화되었습니다",
    };
  } catch (error) {
    console.error("Toggle source active error:", error);
    return {
      success: false,
      message: "상태 변경 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}
