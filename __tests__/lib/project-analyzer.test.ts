/**
 * @jest-environment node
 */
import { buildProjectAnalysis, collectProjectAnalysisDocuments } from "@/lib/crawler/project-analyzer";
import type { SelectionInsights } from "@/lib/projects/attachment-intelligence";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    supportProject: {
      findUnique: jest.fn(),
    },
    projectAttachment: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
const mockSupportProject = prisma.supportProject.findUnique as jest.MockedFunction<
  typeof prisma.supportProject.findUnique
>;
const mockProjectAttachment = prisma.projectAttachment.findMany as jest.MockedFunction<
  typeof prisma.projectAttachment.findMany
>;

const project = {
  summary: "폐업소상공인 목돈 마련 지원",
  target: "중소기업",
  fundingSummary: "월 30만원, 6개월",
  amountDescription: "개인 납입액 180만원과 부산시 지원금 180만원",
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-05-10T00:00:00.000Z"),
  deadline: new Date("2026-05-10T00:00:00.000Z"),
  isPermanent: false,
  applicationProcess: "온라인 접수",
  evaluationCriteria: null,
  requiredDocuments: [],
  contactInfo: "부산경제진흥원",
};

describe("project analyzer", () => {
  it("defaults malformed AI eligibility confidence instead of rejecting the analysis", () => {
    const analysis = buildProjectAnalysis({
      project,
      markdown: "### 사업개요\n폐업소상공인 지원사업",
      eligibilityCriteria: {
        maxCompanyAge: { value: 69 } as never,
        companySize: { value: ["폐업소상공인"], confidence: "high" },
      },
      hasAttachmentContent: false,
    });

    expect(analysis.eligibility.required).toEqual([
      expect.objectContaining({ label: "maxCompanyAge", confidence: "low" }),
      expect.objectContaining({ label: "companySize", confidence: "high" }),
    ]);
    expect(analysis.quality.confidence).toBe("medium");
  });

  it("uses medium confidence when parsed attachment content is available", () => {
    const analysis = buildProjectAnalysis({
      project,
      markdown: "### 사업개요\n첨부 공고문 기반 분석",
      eligibilityCriteria: {},
      hasAttachmentContent: true,
    });

    expect(analysis.quality.confidence).toBe("medium");
  });

  it("uses generated overview markdown for the public AI summary", () => {
    const analysis = buildProjectAnalysis({
      project,
      markdown: "### 사업개요\n부산 지역 관광 및 마이스 기업의 경쟁력 강화를 위한 일자리 창출 지원사업입니다. 청년 근로자의 직무역량 향상과 기업 성장을 함께 지원합니다.\n\n### 지원내용\n- 지원금",
      eligibilityCriteria: {},
      hasAttachmentContent: true,
    });

    expect(analysis.summary.plain).toBe(
      "부산 지역 관광 및 마이스 기업의 경쟁력 강화를 위한 일자리 창출 지원사업입니다. 청년 근로자의 직무역량 향상과 기업 성장을 함께 지원합니다."
    );
  });

  it("builds useful summary key points from existing project fields", () => {
    const analysis = buildProjectAnalysis({
      project: {
        ...project,
        target: "",
        fundingSummary: null,
        amountDescription: "총 사업비의 70% 이내 지원",
        applicationProcess: "온라인 접수 후 서류 제출",
      },
      markdown: "### 사업개요\n지원사업 요약",
      eligibilityCriteria: {},
      hasAttachmentContent: false,
    });

    expect(analysis.summary.keyPoints).toEqual([
      "총 사업비의 70% 이내 지원",
      "온라인 접수 후 서류 제출",
    ]);
  });

  it("builds preparation checklist from required documents and process fields", () => {
    const analysis = buildProjectAnalysis({
      project: {
        ...project,
        requiredDocuments: ["사업계획서", "사업자등록증"],
        applicationProcess: "온라인 접수",
        evaluationCriteria: "사업성 및 수행역량 평가",
        contactInfo: "부산경제진흥원 051-000-0000",
      },
      markdown: "### 사업개요\n준비 팁 테스트",
      eligibilityCriteria: {},
      hasAttachmentContent: false,
    });

    expect(analysis.aiTips.checklist).toEqual([
      "사업계획서 준비",
      "사업자등록증 준비",
      "온라인 접수 절차 확인",
      "사업성 및 수행역량 평가 기준에 맞춰 신청서 보강",
      "부산경제진흥원 051-000-0000 문의처 확인",
    ]);
  });

  it("keeps summary key points and checklist useful when optional fields are empty", () => {
    const analysis = buildProjectAnalysis({
      project: {
        ...project,
        summary: "공고 원문 확인이 필요한 지원사업",
        target: "",
        fundingSummary: null,
        amountDescription: null,
        applicationProcess: null,
        evaluationCriteria: null,
        requiredDocuments: [],
        contactInfo: null,
      },
      markdown: "### 사업개요\n공고 원문 확인이 필요한 지원사업",
      eligibilityCriteria: {},
      hasAttachmentContent: false,
    });

    expect(analysis.summary.keyPoints).toEqual(["공고 원문 확인이 필요한 지원사업"]);
    expect(analysis.aiTips.checklist).toEqual(["공고 원문과 첨부서류의 세부 요건 확인"]);
  });

  it("merges selectionInsights.criteria into selection.criteria", () => {
    const insights: SelectionInsights = {
      criteria: ["사업화 가능성", "수행 역량"],
      scoringHints: ["배점 상위 항목: 사업화 가능성(40점)에 집중하세요."],
      likelyImportantFactors: ["사업화 가능성"],
      writingStrategy: ["정량 지표를 중심으로 서술하세요."],
      preparationPriority: ["사업화 가능성 관련 증빙 준비"],
      commonRisks: ["서류 누락"],
    };

    const analysis = buildProjectAnalysis({
      project: { ...project, evaluationCriteria: "평가위원회 심사" },
      markdown: "### 사업개요\n평가기준 테스트",
      eligibilityCriteria: {},
      hasAttachmentContent: true,
      selectionInsights: insights,
    });

    // criteria must include both project.evaluationCriteria and insights.criteria
    expect(analysis.selection.criteria).toContain("평가위원회 심사");
    expect(analysis.selection.criteria).toContain("사업화 가능성");
    expect(analysis.selection.criteria).toContain("수행 역량");
    // scoringHints and likelyImportantFactors come from insights
    expect(analysis.selection.scoringHints).toEqual(insights.scoringHints);
    expect(analysis.selection.likelyImportantFactors).toEqual(insights.likelyImportantFactors);
    // aiTips.writingStrategy and commonRisks come from insights
    expect(analysis.aiTips.writingStrategy).toEqual(insights.writingStrategy);
    expect(analysis.aiTips.commonRisks).toEqual(insights.commonRisks);
    // aiTips.preparationPriority merges project required docs + insights.preparationPriority
    expect(analysis.aiTips.preparationPriority).toEqual(
      expect.arrayContaining(insights.preparationPriority)
    );
    // quality.hasSelectionCriteria must be true since criteria is non-empty
    expect(analysis.quality.hasSelectionCriteria).toBe(true);
  });

  it("populates scoreTable and hasScoreTable=true when selectionInsights.scoreTable exists", () => {
    const insights: SelectionInsights = {
      criteria: ["사업화 가능성"],
      scoringHints: [],
      likelyImportantFactors: [],
      scoreTable: [
        { item: "사업화 가능성", points: 40, description: "사업화 가능성 40점", evidenceLabel: "평가표.hwp" },
        { item: "수행 역량", points: 30, description: "수행 역량 30점", evidenceLabel: "평가표.hwp" },
      ],
      writingStrategy: [],
      preparationPriority: [],
      commonRisks: [],
    };

    const analysis = buildProjectAnalysis({
      project: { ...project, evaluationCriteria: null },
      markdown: "### 사업개요\n점수 테이블 테스트",
      eligibilityCriteria: {},
      hasAttachmentContent: true,
      selectionInsights: insights,
    });

    expect(analysis.selection.scoreTable).toBeDefined();
    expect(analysis.selection.scoreTable![0].points).toBe(40);
    expect(analysis.quality.hasScoreTable).toBe(true);
  });

  it("sets hasScoreTable=false when no score rows are available", () => {
    const insights: SelectionInsights = {
      criteria: [],
      scoringHints: [],
      likelyImportantFactors: [],
      scoreTable: undefined,
      writingStrategy: [],
      preparationPriority: [],
      commonRisks: [],
    };

    const analysis = buildProjectAnalysis({
      project: { ...project, evaluationCriteria: null },
      markdown: "### 사업개요\n점수 없음 테스트",
      eligibilityCriteria: {},
      hasAttachmentContent: false,
      selectionInsights: insights,
    });

    expect(analysis.quality.hasScoreTable).toBe(false);
    expect(analysis.selection.scoreTable).toBeUndefined();
  });

  it("works without selectionInsights (backwards-compatible)", () => {
    const analysis = buildProjectAnalysis({
      project,
      markdown: "### 사업개요\n기존 호환성 테스트",
      eligibilityCriteria: {},
      hasAttachmentContent: false,
    });

    expect(analysis.selection.scoringHints).toEqual([]);
    expect(analysis.aiTips.writingStrategy).toEqual([]);
    expect(analysis.quality.hasScoreTable).toBe(false);
  });
});

describe("collectProjectAnalysisDocuments group routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectAttachment.mockResolvedValue([]);
  });

  it("auto/confirmed group uses all non-deleted group project ids", async () => {
    mockSupportProject.mockResolvedValue({
      id: "proj-1",
      groupId: "grp-1",
      group: {
        reviewStatus: "confirmed",
        canonicalProjectId: "proj-1",
        projects: [{ id: "proj-1" }, { id: "proj-2" }],
      },
    } as never);

    await collectProjectAnalysisDocuments("proj-1");

    expect(mockSupportProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "proj-1" },
        select: expect.objectContaining({
          group: expect.objectContaining({
            select: expect.objectContaining({
              projects: expect.objectContaining({
                where: { deletedAt: null },
              }),
            }),
          }),
        }),
      })
    );

    expect(mockProjectAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: { in: expect.arrayContaining(["proj-1", "proj-2"]) },
        }),
      })
    );
  });

  it("pending_review canonical project uses current project id only", async () => {
    mockSupportProject.mockResolvedValue({
      id: "proj-1",
      groupId: "grp-2",
      group: {
        reviewStatus: "pending_review",
        canonicalProjectId: "proj-1",
        projects: [{ id: "proj-1" }, { id: "proj-3" }],
      },
    } as never);

    await collectProjectAnalysisDocuments("proj-1");

    expect(mockProjectAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: { in: ["proj-1"] },
        }),
      })
    );
  });

  it("pending_review non-canonical project uses current project id only", async () => {
    mockSupportProject.mockResolvedValue({
      id: "proj-3",
      groupId: "grp-2",
      group: {
        reviewStatus: "pending_review",
        canonicalProjectId: "proj-1",
        projects: [{ id: "proj-1" }, { id: "proj-3" }],
      },
    } as never);

    await collectProjectAnalysisDocuments("proj-3");

    expect(mockProjectAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: { in: ["proj-3"] },
        }),
      })
    );
  });

  it("rejected non-canonical project uses current project id only", async () => {
    mockSupportProject.mockResolvedValue({
      id: "proj-4",
      groupId: "grp-3",
      group: {
        reviewStatus: "rejected",
        canonicalProjectId: "proj-1",
        projects: [{ id: "proj-1" }, { id: "proj-4" }],
      },
    } as never);

    await collectProjectAnalysisDocuments("proj-4");

    expect(mockProjectAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: { in: ["proj-4"] },
        }),
      })
    );
  });

  it("no group uses current project id only", async () => {
    mockSupportProject.mockResolvedValue({
      id: "proj-5",
      groupId: null,
      group: null,
    } as never);

    await collectProjectAnalysisDocuments("proj-5");

    expect(mockProjectAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: { in: ["proj-5"] },
        }),
      })
    );
  });
});
