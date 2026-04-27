import { ProjectAnalysisSchema, ProjectAnalysisPublicSchema } from "@/lib/projects/analysis-schema";

describe("ProjectAnalysisSchema", () => {
  it("accepts canonical structured support analysis", () => {
    const parsed = ProjectAnalysisSchema.parse({
      summary: { plain: "초기 창업기업을 위한 사업화 자금", keyPoints: ["최대 5천만원", "온라인 접수"] },
      benefits: { cash: "최대 5천만원", subsidyRate: "70% 이내", maxAmount: 50000000, nonCashBenefits: ["멘토링"], notes: [] },
      eligibility: {
        required: [{ label: "업력", description: "창업 3년 이내", confidence: "high", evidenceIds: ["e1"], notes: [] }],
        preferred: [],
        excluded: [],
        ambiguous: [],
      },
      period: { startDate: "2026-04-01", endDate: "2026-04-30", isOpenEnded: false, status: "open" },
      application: { method: ["온라인 신청"], channels: ["K-Startup"], requiredDocuments: ["사업계획서"], contact: ["1357"] },
      selection: { criteria: ["사업성"], scoringHints: ["시장성 강조"], likelyImportantFactors: ["매출 가능성"] },
      aiTips: { whoShouldApply: ["초기 창업기업"], preparationPriority: ["증빙 준비"], writingStrategy: ["정량 지표 제시"], commonRisks: ["마감 임박"], checklist: ["서류 확인"] },
      evidence: [{ id: "e1", source: "page", label: "지원대상", text: "창업 3년 이내" }],
      quality: { confidence: "high", hasParsedAttachment: true, hasSelectionCriteria: true, missingFields: [], warnings: [] },
    });

    expect(parsed.quality.confidence).toBe("high");
  });

  it("accepts null max amount when numeric limit is unavailable", () => {
    const parsed = ProjectAnalysisSchema.parse({
      summary: { plain: "요약", keyPoints: [] },
      benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
      eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
      period: { isOpenEnded: false, status: "unknown" },
      application: { method: [], channels: [], requiredDocuments: [], contact: [] },
      selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
      aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
      evidence: [],
      quality: { confidence: "medium", hasParsedAttachment: false, hasSelectionCriteria: false, missingFields: [], warnings: [] },
    });

    expect(parsed.benefits.maxAmount).toBeNull();
  });

  it("rejects unknown period status", () => {
    expect(() =>
      ProjectAnalysisSchema.parse({
        summary: { plain: "요약", keyPoints: [] },
        benefits: { nonCashBenefits: [], notes: [] },
        eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
        period: { isOpenEnded: false, status: "soon" },
        application: { method: [], channels: [], requiredDocuments: [], contact: [] },
        selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
        aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
        evidence: [],
        quality: { confidence: "medium", hasParsedAttachment: false, hasSelectionCriteria: false, missingFields: [], warnings: [] },
      })
    ).toThrow();
  });

  it("rejects unknown confidence", () => {
    expect(() =>
      ProjectAnalysisSchema.parse({
        summary: { plain: "요약", keyPoints: [] },
        benefits: { nonCashBenefits: [], notes: [] },
        eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
        period: { isOpenEnded: false, status: "open" },
        application: { method: [], channels: [], requiredDocuments: [], contact: [] },
        selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
        aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
        evidence: [],
        quality: { confidence: "certain", hasParsedAttachment: false, hasSelectionCriteria: false, missingFields: [], warnings: [] },
      })
    ).toThrow();
  });

  it("rejects unknown evidence source", () => {
    expect(() =>
      ProjectAnalysisSchema.parse({
        summary: { plain: "요약", keyPoints: [] },
        benefits: { nonCashBenefits: [], notes: [] },
        eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
        period: { isOpenEnded: false, status: "open" },
        application: { method: [], channels: [], requiredDocuments: [], contact: [] },
        selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
        aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
        evidence: [{ id: "e1", source: "crawler", label: "출처", text: "본문" }],
        quality: { confidence: "medium", hasParsedAttachment: false, hasSelectionCriteria: false, missingFields: [], warnings: [] },
      })
    ).toThrow();
  });
});

describe("ProjectAnalysisPublicSchema", () => {
  it("does not expose internal evidence text, evidence ids, or warnings", () => {
    const publicShape = ProjectAnalysisPublicSchema.parse({
      summary: { plain: "요약", keyPoints: [] },
      benefits: { cash: "최대 5천만원", maxAmount: 50000000, nonCashBenefits: [], notes: [] },
      eligibility: {
        required: [{ label: "업력", description: "창업 3년 이내", confidence: "high", evidenceIds: ["e1"], notes: [] }],
        preferred: [],
        excluded: [],
        ambiguous: [],
      },
      period: { isOpenEnded: false, status: "open" },
      application: { method: [], channels: [], requiredDocuments: [], contact: [] },
      selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
      aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
      evidence: [{ id: "e1", source: "page", label: "내부 근거", text: "공개하면 안 되는 원문" }],
      quality: { confidence: "high", hasParsedAttachment: true, hasSelectionCriteria: true, missingFields: [], warnings: ["내부 경고"] },
    });

    expect("evidence" in publicShape).toBe(false);
    expect("evidenceIds" in publicShape.eligibility.required[0]).toBe(false);
    expect("warnings" in publicShape.quality).toBe(false);
  });
});
