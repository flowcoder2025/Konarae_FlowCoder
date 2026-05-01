import { buildProjectAnalysis } from "@/lib/crawler/project-analyzer";

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
});
