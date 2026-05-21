import { render, screen } from "@testing-library/react";
import ProjectDetailPage from "@/app/projects/[id]/page";
import { getPublicProject } from "@/lib/projects/public-service";
import type { ProjectPublicDto } from "@/lib/projects/public-dto";

jest.mock("@/components/projects/project-description-renderer", () => ({
  ProjectDescriptionRenderer: () => <div />,
}));

jest.mock("@/lib/projects/public-service", () => ({
  getPublicProject: jest.fn(),
}));

const mockGetPublicProject = getPublicProject as jest.MockedFunction<typeof getPublicProject>;

function buildProject(overrides: Partial<ProjectPublicDto> = {}): ProjectPublicDto {
  return {
    id: "project-1",
    title: "평가표 포함 지원사업",
    organization: "FlowMate Test",
    category: "경영",
    subCategory: null,
    target: "중소기업",
    region: "전국",
    amount: { min: null, max: null, summary: null, description: null },
    startDate: null,
    endDate: null,
    deadline: null,
    isPermanent: false,
    summary: "요약",
    analysisMarkdown: null,
    eligibility: null,
    applicationProcess: null,
    evaluationCriteria: null,
    requiredDocuments: [],
    contactInfo: null,
    websiteUrl: null,
    sourceUrl: null,
    attachments: [],
    status: "active",
    viewCount: 0,
    crawledAt: null,
    updatedAt: "2026-05-06T00:00:00.000Z",
    trust: {
      analysisStatus: "analyzed",
      confidence: "high",
      hasParsedAttachment: true,
      hasSelectionCriteria: true,
    },
    analysis: {
      summary: { plain: "분석 요약", keyPoints: [] },
      benefits: { nonCashBenefits: [], notes: [] },
      eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
      period: { isOpenEnded: false, status: "unknown" },
      application: { method: [], channels: [], requiredDocuments: [], contact: [] },
      selection: {
        criteria: [],
        scoringHints: [],
        likelyImportantFactors: [],
        scoreTable: [
          { item: "기술성", points: 30, description: "기술 혁신성 평가", evidenceLabel: "평가표.hwp" },
          { item: "사업성", description: "사업화 가능성 평가", evidenceLabel: "평가표.hwp" },
        ],
        prioritySignals: ["기술성 고배점"],
      },
      aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
      quality: { confidence: "high", hasParsedAttachment: true, hasSelectionCriteria: true, hasScoreTable: true },
    },
    ...overrides,
  };
}

describe("ProjectDetailPage", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders selection score table and priority signals when provided", async () => {
    mockGetPublicProject.mockResolvedValue(buildProject());

    render(await ProjectDetailPage({ params: Promise.resolve({ id: "project-1" }) }));

    expect(screen.getByRole("heading", { name: "평가 배점표" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "평가 항목별 배점, 설명, 근거 정보" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "항목" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "기술성" })).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getAllByText("확인 필요").length).toBeGreaterThan(0);
    expect(screen.getByText("기술성 고배점")).toBeTruthy();
  });

  it("renders crawled freshness, original link, and attachment links", async () => {
    mockGetPublicProject.mockResolvedValue(buildProject({
      sourceUrl: "https://example.com/original",
      crawledAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
      attachments: [
        {
          id: "att-1",
          fileName: "공고문.hwp",
          fileType: "hwp",
          fileSize: 2048,
          url: "https://example.com/files/announcement.hwp",
          createdAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    }));

    render(await ProjectDetailPage({ params: Promise.resolve({ id: "project-1" }) }));

    expect(screen.getByText("수집일")).toBeTruthy();
    expect(screen.getByText(/2026.*4.*20/)).toBeTruthy();
    const originalLink = screen.getByRole("link", { name: "원문 바로가기" });
    expect(originalLink.getAttribute("href")).toBe("https://example.com/original");
    expect(originalLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByRole("heading", { name: "원문 및 첨부파일" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /공고문\.hwp/ }).getAttribute("href")).toBe("https://example.com/files/announcement.hwp");
  });

  it("falls back to website link and filters unsafe attachment URLs", async () => {
    mockGetPublicProject.mockResolvedValue(buildProject({
      sourceUrl: "javascript:alert(1)",
      websiteUrl: "https://example.com/site",
      crawledAt: null,
      updatedAt: "2026-05-06T00:00:00.000Z",
      attachments: [
        {
          id: "att-unsafe",
          fileName: "위험.url",
          fileType: "unknown",
          fileSize: 0,
          url: "javascript:alert(1)",
          createdAt: null,
        },
        {
          id: "att-safe",
          fileName: "신청서.pdf",
          fileType: "pdf",
          fileSize: null,
          url: "https://example.com/files/apply.pdf",
          createdAt: null,
        },
      ],
    }));

    render(await ProjectDetailPage({ params: Promise.resolve({ id: "project-1" }) }));

    expect(screen.getByText("갱신일")).toBeTruthy();
    const websiteLink = screen.getByRole("link", { name: "기관 페이지 보기" });
    expect(websiteLink.getAttribute("href")).toBe("https://example.com/site");
    expect(screen.queryByRole("link", { name: /위험\.url/ })).toBeNull();
    expect(screen.getByRole("link", { name: /신청서\.pdf/ }).getAttribute("href")).toBe("https://example.com/files/apply.pdf");
  });
});
