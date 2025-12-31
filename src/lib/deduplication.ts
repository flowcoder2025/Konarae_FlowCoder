/**
 * Project Deduplication Service
 *
 * 지원사업 중복 감지 및 통합 관리
 * - 유사 프로젝트 탐색
 * - ProjectGroup 생성/업데이트
 * - Canonical 프로젝트 선정
 * - 보완 데이터 병합
 */

import { prisma } from "@/lib/prisma";
import type { SupportProject, ProjectGroup, Prisma } from "@prisma/client";
import {
  normalizeProject,
  calculateProjectSimilarity,
  isSameYearProject,
  type SimilarityResult,
} from "./project-normalize";

// 유사도 임계값
const SIMILARITY_THRESHOLDS = {
  AUTO_MERGE: 0.85, // 자동 병합 (85% 이상)
  REVIEW_REQUIRED: 0.70, // 검토 필요 (70-85%)
  SEPARATE: 0.70, // 분리 유지 (70% 미만)
} as const;

export interface DuplicateCandidate {
  project: SupportProject;
  similarity: SimilarityResult;
}

export interface DeduplicationResult {
  action: "merged" | "review" | "new" | "updated";
  groupId: string | null;
  isCanonical: boolean;
  mergeConfidence: number;
  duplicatesFound: number;
}

/**
 * 새 프로젝트와 유사한 기존 프로젝트 찾기
 * - 정규화된 이름으로 1차 필터링
 * - 같은 지역 프로젝트만 비교 (지역이 다르면 중복 아님)
 * - 상세 유사도 계산으로 2차 필터링
 */
export async function findDuplicateCandidates(
  projectName: string,
  deadline?: Date | null,
  amountMax?: bigint | null,
  excludeId?: string,
  region?: string | null
): Promise<DuplicateCandidate[]> {
  const normalized = normalizeProject(projectName);

  // AND 조건 구성
  const andConditions: Prisma.SupportProjectWhereInput[] = [];

  // 지역 필터 조건 생성
  // - 지역이 같거나
  // - 둘 중 하나가 "전국"인 경우만 비교
  // (region은 non-nullable 필드이므로 null 체크 불필요)
  if (region && region !== "전국") {
    andConditions.push({
      OR: [
        { region: region }, // 같은 지역
        { region: "전국" }, // 전국 대상 사업은 모든 지역과 비교 가능
      ],
    });
  }

  // 연도 필터 (있는 경우)
  if (normalized.projectYear) {
    andConditions.push({
      OR: [
        { projectYear: normalized.projectYear },
        { projectYear: { equals: null } }, // 연도 미기재 프로젝트도 포함
      ],
    });
  }

  // 1차 필터: 정규화된 이름이 비슷한 프로젝트 조회
  // 같은 연도 + 같은 지역 + 활성 상태 프로젝트 조회
  const candidates = await prisma.supportProject.findMany({
    where: {
      status: "active",
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    },
    select: {
      id: true,
      name: true,
      organization: true,
      normalizedName: true,
      projectYear: true,
      deadline: true,
      amountMax: true,
      isCanonical: true,
      groupId: true,
      createdAt: true,
      // 기타 필요한 필드
      externalId: true,
      category: true,
      subCategory: true,
      target: true,
      region: true,
      subRegion: true,
      amountMin: true,
      fundingSummary: true,
      amountDescription: true,
      startDate: true,
      endDate: true,
      isPermanent: true,
      summary: true,
      description: true,
      eligibility: true,
      applicationProcess: true,
      evaluationCriteria: true,
      requiredDocuments: true,
      contactInfo: true,
      websiteUrl: true,
      detailUrl: true,
      attachmentUrls: true,
      originalFileUrl: true,
      originalFileType: true,
      status: true,
      viewCount: true,
      bookmarkCount: true,
      crawledAt: true,
      sourceUrl: true,
      updatedAt: true,
      deletedAt: true,
      needsEmbedding: true,
    },
  });

  // 2차 필터: 상세 유사도 계산
  const duplicates: DuplicateCandidate[] = [];

  for (const candidate of candidates) {
    // 연도 일치 여부 확인
    if (
      !isSameYearProject(normalized.projectYear, candidate.projectYear)
    ) {
      continue;
    }

    const similarity = calculateProjectSimilarity({
      name1: projectName,
      name2: candidate.name,
      deadline1: deadline,
      deadline2: candidate.deadline,
      amount1: amountMax,
      amount2: candidate.amountMax,
    });

    // 임계값 이상인 경우만 후보로 추가
    if (similarity.totalScore >= SIMILARITY_THRESHOLDS.SEPARATE) {
      duplicates.push({
        project: candidate as SupportProject,
        similarity,
      });
    }
  }

  // 유사도 내림차순 정렬
  duplicates.sort((a, b) => b.similarity.totalScore - a.similarity.totalScore);

  return duplicates;
}

/**
 * Canonical 프로젝트 선정 기준
 * 1. 정보 완성도 (설명, 자격요건 등 필드 채움 비율)
 * 2. 생성일 (먼저 크롤링된 프로젝트)
 * 3. 출처 신뢰도 (추후 확장)
 */
function calculateCanonicalScore(project: SupportProject): number {
  let score = 0;

  // 정보 완성도 점수 (최대 70점)
  if (project.description) score += 15;
  if (project.eligibility) score += 15;
  if (project.applicationProcess) score += 10;
  if (project.evaluationCriteria) score += 10;
  if (project.contactInfo) score += 5;
  if (project.websiteUrl) score += 5;
  if (project.detailUrl) score += 5;
  if (project.attachmentUrls && project.attachmentUrls.length > 0) score += 5;

  // 생성일 점수 (최대 30점) - 오래된 것이 높은 점수
  // 기준: 1년 전 = 30점, 현재 = 0점
  const ageInDays =
    (Date.now() - project.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  score += Math.min(30, ageInDays / 12); // 최대 30점

  return score;
}

/**
 * 보완 데이터 병합
 * Canonical 프로젝트에 없는 정보를 다른 출처에서 보완
 */
function mergeSupplementaryData(
  canonical: SupportProject,
  others: SupportProject[]
): Prisma.JsonObject {
  const merged: Prisma.JsonObject = {};

  for (const other of others) {
    // 설명 보완
    if (!canonical.description && other.description) {
      merged.description = other.description;
    }
    // 자격요건 보완
    if (!canonical.eligibility && other.eligibility) {
      merged.eligibility = other.eligibility;
    }
    // 신청절차 보완
    if (!canonical.applicationProcess && other.applicationProcess) {
      merged.applicationProcess = other.applicationProcess;
    }
    // 평가기준 보완
    if (!canonical.evaluationCriteria && other.evaluationCriteria) {
      merged.evaluationCriteria = other.evaluationCriteria;
    }
    // 첨부파일 URL 병합 (중복 제거)
    if (other.attachmentUrls && other.attachmentUrls.length > 0) {
      const existingUrls = new Set([
        ...(canonical.attachmentUrls || []),
        ...((merged.attachmentUrls as string[]) || []),
      ]);
      const newUrls = other.attachmentUrls.filter(
        (url) => !existingUrls.has(url)
      );
      if (newUrls.length > 0) {
        merged.attachmentUrls = [
          ...((merged.attachmentUrls as string[]) || []),
          ...newUrls,
        ];
      }
    }
    // 연락처 보완
    if (!canonical.contactInfo && other.contactInfo) {
      merged.contactInfo = other.contactInfo;
    }
    // 상세 URL 보완
    if (!canonical.detailUrl && other.detailUrl) {
      merged.detailUrl = other.detailUrl;
    }
  }

  return merged;
}

/**
 * 프로젝트 중복 처리 메인 함수
 * 새 프로젝트 저장 시 호출하여 중복 감지 및 그룹 관리
 */
export async function processProjectDeduplication(
  project: SupportProject
): Promise<DeduplicationResult> {
  const normalized = normalizeProject(project.name);

  // 1. 유사 프로젝트 탐색 (같은 지역만)
  const candidates = await findDuplicateCandidates(
    project.name,
    project.deadline,
    project.amountMax,
    project.id,
    project.region
  );

  // 2. 중복 없음 -> 새 그룹 생성
  if (candidates.length === 0) {
    // 새 프로젝트는 자신이 canonical
    const group = await prisma.projectGroup.create({
      data: {
        normalizedName: normalized.normalizedName,
        projectYear: normalized.projectYear,
        canonicalProjectId: project.id,
        mergeConfidence: 1.0,
        reviewStatus: "auto",
        sourceCount: 1,
      },
    });

    // 프로젝트 업데이트
    await prisma.supportProject.update({
      where: { id: project.id },
      data: {
        groupId: group.id,
        isCanonical: true,
        normalizedName: normalized.normalizedName,
        projectYear: normalized.projectYear,
      },
    });

    return {
      action: "new",
      groupId: group.id,
      isCanonical: true,
      mergeConfidence: 1.0,
      duplicatesFound: 0,
    };
  }

  // 3. 중복 발견 -> 기존 그룹에 추가 또는 새 그룹 생성
  const bestMatch = candidates[0];
  const similarity = bestMatch.similarity.totalScore;

  // 기존 그룹이 있는 경우
  if (bestMatch.project.groupId) {
    const existingGroup = await prisma.projectGroup.findUnique({
      where: { id: bestMatch.project.groupId },
      include: { projects: true },
    });

    if (existingGroup) {
      // 그룹에 추가
      const reviewStatus =
        similarity >= SIMILARITY_THRESHOLDS.AUTO_MERGE
          ? "auto"
          : "pending_review";

      // Canonical 재선정 필요 여부 확인
      const allProjects = [...existingGroup.projects, project];
      const scores = allProjects.map((p) => ({
        id: p.id,
        score: calculateCanonicalScore(p),
      }));
      scores.sort((a, b) => b.score - a.score);
      const newCanonicalId = scores[0].id;
      const canonicalChanged = newCanonicalId !== existingGroup.canonicalProjectId;

      // 보완 데이터 병합
      const canonicalProject = allProjects.find((p) => p.id === newCanonicalId)!;
      const otherProjects = allProjects.filter((p) => p.id !== newCanonicalId);
      const mergedData = mergeSupplementaryData(canonicalProject, otherProjects);

      // 그룹 업데이트
      await prisma.projectGroup.update({
        where: { id: existingGroup.id },
        data: {
          sourceCount: existingGroup.sourceCount + 1,
          mergeConfidence: Math.min(existingGroup.mergeConfidence, similarity),
          reviewStatus,
          ...(canonicalChanged ? { canonicalProjectId: newCanonicalId } : {}),
          ...(Object.keys(mergedData).length > 0 ? { mergedData } : {}),
        },
      });

      // 프로젝트 업데이트
      await prisma.supportProject.update({
        where: { id: project.id },
        data: {
          groupId: existingGroup.id,
          isCanonical: newCanonicalId === project.id,
          normalizedName: normalized.normalizedName,
          projectYear: normalized.projectYear,
        },
      });

      // Canonical 변경 시 기존 프로젝트도 업데이트
      if (canonicalChanged) {
        await prisma.supportProject.updateMany({
          where: {
            groupId: existingGroup.id,
            id: { not: newCanonicalId },
          },
          data: { isCanonical: false },
        });
        await prisma.supportProject.update({
          where: { id: newCanonicalId },
          data: { isCanonical: true },
        });
      }

      return {
        action: similarity >= SIMILARITY_THRESHOLDS.AUTO_MERGE ? "merged" : "review",
        groupId: existingGroup.id,
        isCanonical: newCanonicalId === project.id,
        mergeConfidence: similarity,
        duplicatesFound: candidates.length,
      };
    }
  }

  // 4. 매칭된 프로젝트가 그룹이 없는 경우 -> 기존 그룹 찾거나 새로 생성
  const reviewStatus =
    similarity >= SIMILARITY_THRESHOLDS.AUTO_MERGE
      ? "auto"
      : "pending_review";

  // 먼저 동일한 normalizedName + projectYear를 가진 기존 그룹이 있는지 확인
  const existingGroupByName = await prisma.projectGroup.findFirst({
    where: {
      normalizedName: normalized.normalizedName,
      projectYear: normalized.projectYear,
    },
    include: {
      canonicalProject: true,
      projects: true,
    },
  });

  // 기존 그룹이 있으면 해당 그룹에 추가
  if (existingGroupByName) {
    await prisma.supportProject.update({
      where: { id: project.id },
      data: {
        groupId: existingGroupByName.id,
        isCanonical: false,
        normalizedName: normalized.normalizedName,
        projectYear: normalized.projectYear,
      },
    });

    // 소스 카운트 증가
    await prisma.projectGroup.update({
      where: { id: existingGroupByName.id },
      data: {
        sourceCount: { increment: 1 },
      },
    });

    return {
      action: "merged",
      groupId: existingGroupByName.id,
      isCanonical: false,
      mergeConfidence: similarity,
      duplicatesFound: candidates.length,
    };
  }

  // Canonical 선정
  const projectsToGroup = [project, bestMatch.project];
  const scores = projectsToGroup.map((p) => ({
    id: p.id,
    score: calculateCanonicalScore(p),
  }));
  scores.sort((a, b) => b.score - a.score);
  const canonicalId = scores[0].id;

  // 보완 데이터 병합
  const canonicalProject = projectsToGroup.find((p) => p.id === canonicalId)!;
  const otherProjects = projectsToGroup.filter((p) => p.id !== canonicalId);
  const mergedData = mergeSupplementaryData(canonicalProject, otherProjects);

  // 새 그룹 생성 (race condition 대비 try-catch)
  let newGroup;
  try {
    newGroup = await prisma.projectGroup.create({
      data: {
        normalizedName: normalized.normalizedName,
        projectYear: normalized.projectYear,
        canonicalProjectId: canonicalId,
        mergeConfidence: similarity,
        reviewStatus,
        sourceCount: 2,
        ...(Object.keys(mergedData).length > 0 ? { mergedData } : {}),
      },
    });
  } catch (error: unknown) {
    // Unique constraint 에러 시 기존 그룹 사용
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      const existingGroup = await prisma.projectGroup.findFirst({
        where: {
          normalizedName: normalized.normalizedName,
          projectYear: normalized.projectYear,
        },
      });

      if (existingGroup) {
        await prisma.supportProject.update({
          where: { id: project.id },
          data: {
            groupId: existingGroup.id,
            isCanonical: false,
            normalizedName: normalized.normalizedName,
            projectYear: normalized.projectYear,
          },
        });

        await prisma.projectGroup.update({
          where: { id: existingGroup.id },
          data: { sourceCount: { increment: 1 } },
        });

        return {
          action: "merged",
          groupId: existingGroup.id,
          isCanonical: false,
          mergeConfidence: similarity,
          duplicatesFound: candidates.length,
        };
      }
    }
    throw error;
  }

  // 두 프로젝트 모두 업데이트
  await prisma.supportProject.update({
    where: { id: project.id },
    data: {
      groupId: newGroup.id,
      isCanonical: canonicalId === project.id,
      normalizedName: normalized.normalizedName,
      projectYear: normalized.projectYear,
    },
  });

  await prisma.supportProject.update({
    where: { id: bestMatch.project.id },
    data: {
      groupId: newGroup.id,
      isCanonical: canonicalId === bestMatch.project.id,
      normalizedName: normalizeProject(bestMatch.project.name).normalizedName,
      projectYear: normalizeProject(bestMatch.project.name).projectYear,
    },
  });

  return {
    action: similarity >= SIMILARITY_THRESHOLDS.AUTO_MERGE ? "merged" : "review",
    groupId: newGroup.id,
    isCanonical: canonicalId === project.id,
    mergeConfidence: similarity,
    duplicatesFound: candidates.length,
  };
}

/**
 * 기존 프로젝트들의 정규화 필드 업데이트
 * 마이그레이션용 배치 함수
 */
export async function updateNormalizedFields(batchSize: number = 100): Promise<{
  processed: number;
  remaining: number;
}> {
  // 정규화되지 않은 프로젝트 조회
  const projects = await prisma.supportProject.findMany({
    where: {
      normalizedName: null,
      deletedAt: null,
    },
    take: batchSize,
    select: {
      id: true,
      name: true,
    },
  });

  // 배치 업데이트
  for (const project of projects) {
    const normalized = normalizeProject(project.name);
    await prisma.supportProject.update({
      where: { id: project.id },
      data: {
        normalizedName: normalized.normalizedName,
        projectYear: normalized.projectYear,
      },
    });
  }

  // 남은 개수 확인
  const remaining = await prisma.supportProject.count({
    where: {
      normalizedName: null,
      deletedAt: null,
    },
  });

  return {
    processed: projects.length,
    remaining,
  };
}

/**
 * 기존 프로젝트들의 중복 그룹화
 * 마이그레이션용 배치 함수
 */
export async function groupExistingProjects(batchSize: number = 50): Promise<{
  processed: number;
  groupsCreated: number;
  projectsGrouped: number;
}> {
  // 그룹이 없는 프로젝트 조회
  const projects = await prisma.supportProject.findMany({
    where: {
      groupId: null,
      deletedAt: null,
      normalizedName: { not: null },
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  let groupsCreated = 0;
  let projectsGrouped = 0;

  for (const project of projects) {
    // 이미 그룹이 할당되었는지 다시 확인 (동시성 문제 방지)
    const currentProject = await prisma.supportProject.findUnique({
      where: { id: project.id },
      select: { groupId: true },
    });

    if (currentProject?.groupId) {
      continue;
    }

    const result = await processProjectDeduplication(project);

    if (result.action === "new") {
      groupsCreated++;
    }
    projectsGrouped++;
  }

  return {
    processed: projects.length,
    groupsCreated,
    projectsGrouped,
  };
}

export { SIMILARITY_THRESHOLDS };
