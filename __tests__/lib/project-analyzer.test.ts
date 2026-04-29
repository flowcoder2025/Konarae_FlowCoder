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
});
