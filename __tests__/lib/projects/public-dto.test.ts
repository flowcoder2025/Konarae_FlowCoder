import { serializeProjectAnalysisPublic, serializeProjectPublic } from "@/lib/projects/public-dto";

describe("public project DTO serializers", () => {
  const project = {
    id: "p1",
    name: "창업 지원사업",
    organization: "중소벤처기업부",
    category: "창업",
    subCategory: null,
    target: "창업기업",
    region: "전국",
    amountMin: BigInt(1000000),
    amountMax: BigInt(50000000),
    fundingSummary: "최대 5천만원",
    amountDescription: "총 사업비의 70% 이내",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-30T00:00:00.000Z"),
    deadline: new Date("2026-04-30T00:00:00.000Z"),
    isPermanent: false,
    summary: "사업화 자금 지원",
    eligibility: "창업 3년 이내",
    applicationProcess: "온라인 신청",
    evaluationCriteria: "사업성 평가",
    requiredDocuments: ["사업계획서"],
    contactInfo: "1357",
    websiteUrl: "https://example.com",
    detailUrl: "https://example.com/detail",
    status: "active",
    viewCount: 7,
    crawledAt: new Date("2026-04-20T00:00:00.000Z"),
    updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    analysisStatus: "analyzed",
    analysisConfidence: "high",
    hasParsedAttachment: true,
    hasSelectionCriteria: true,
    publicationStatus: "visible",
    projectAnalysis: null,
    eligibilityCriteria: { internal: "must not leak" },
    descriptionMarkdown: "internal markdown",
    needsAnalysis: false,
  };

  it("serializes BigInt and dates safely", () => {
    const dto = serializeProjectPublic(project);

    expect(dto.amount.max).toBe(50000000);
    expect(dto.deadline).toBe("2026-04-30T00:00:00.000Z");
  });

  it("serializes null amounts and string dates safely", () => {
    const dto = serializeProjectPublic({
      ...project,
      amountMin: null,
      amountMax: null,
      startDate: "2026-04-01T00:00:00.000Z",
    });

    expect(dto.amount.min).toBeNull();
    expect(dto.amount.max).toBeNull();
    expect(dto.startDate).toBe("2026-04-01T00:00:00.000Z");
  });

  it("returns null for invalid dates", () => {
    const dto = serializeProjectPublic({ ...project, deadline: "not-a-date" });

    expect(dto.deadline).toBeNull();
  });

  it("does not expose internal analysis fields", () => {
    const dto = serializeProjectPublic(project);

    expect("eligibilityCriteria" in dto).toBe(false);
    expect("descriptionMarkdown" in dto).toBe(false);
    expect(dto.analysisMarkdown).toBe("internal markdown");
    expect("needsAnalysis" in dto).toBe(false);
  });

  it("exposes only the public project DTO keys", () => {
    const dto = serializeProjectPublic(project);

    expect(Object.keys(dto).sort()).toEqual([
      "amount",
      "analysis",
      "analysisMarkdown",
      "applicationProcess",
      "category",
      "contactInfo",
      "crawledAt",
      "deadline",
      "eligibility",
      "endDate",
      "evaluationCriteria",
      "id",
      "isPermanent",
      "organization",
      "region",
      "requiredDocuments",
      "sourceUrl",
      "startDate",
      "status",
      "subCategory",
      "summary",
      "target",
      "title",
      "trust",
      "updatedAt",
      "viewCount",
      "websiteUrl",
    ]);
  });

  it("serializes valid analysis without internal evidence or warnings", () => {
    const dto = serializeProjectAnalysisPublic({
      summary: { plain: "요약", keyPoints: [] },
      benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
      eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
      period: { isOpenEnded: false, status: "open" },
      application: { method: [], channels: [], requiredDocuments: [], contact: [] },
      selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
      aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
      evidence: [{ id: "e1", source: "page", label: "내부 근거", text: "원문" }],
      quality: { confidence: "high", hasParsedAttachment: true, hasSelectionCriteria: false, missingFields: [], warnings: ["내부 경고"] },
    });

    expect(dto).not.toBeNull();
    expect("evidence" in dto!).toBe(false);
    expect("missingFields" in dto!.quality).toBe(false);
    expect("warnings" in dto!.quality).toBe(false);
  });

  it("prefers detailUrl before sourceUrl", () => {
    const dto = serializeProjectPublic({ ...project, detailUrl: "https://example.com/detail", sourceUrl: "https://example.com/source" });

    expect(dto.sourceUrl).toBe("https://example.com/detail");
  });

  it("falls back to sourceUrl when detailUrl is missing", () => {
    const dto = serializeProjectPublic({ ...project, detailUrl: null, sourceUrl: "https://example.com/source" });

    expect(dto.sourceUrl).toBe("https://example.com/source");
  });

  it("uses public defaults when optional project fields are missing", () => {
    const dto = serializeProjectPublic({
      ...project,
      analysisStatus: undefined,
      analysisConfidence: undefined,
      hasParsedAttachment: undefined,
      hasSelectionCriteria: undefined,
      requiredDocuments: undefined,
    });

    expect(dto.requiredDocuments).toEqual([]);
    expect(dto.trust).toEqual({
      analysisStatus: "pending",
      confidence: null,
      hasParsedAttachment: false,
      hasSelectionCriteria: false,
    });
  });

  it("normalizes required documents to strings", () => {
    const dto = serializeProjectPublic({ ...project, requiredDocuments: ["사업계획서", 1, null] });

    expect(dto.requiredDocuments).toEqual(["사업계획서"]);
  });

  it("returns null for invalid or missing analysis", () => {
    expect(serializeProjectAnalysisPublic(null)).toBeNull();
    expect(serializeProjectAnalysisPublic({ period: { status: "bad" } })).toBeNull();
  });

  it("preserves analysis.quality.hasScoreTable and selection.scoreTable in public DTO", () => {
    const dto = serializeProjectAnalysisPublic({
      summary: { plain: "요약", keyPoints: [] },
      benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
      eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
      period: { isOpenEnded: false, status: "open" },
      application: { method: [], channels: [], requiredDocuments: [], contact: [] },
      selection: {
        criteria: ["사업성"],
        scoringHints: [],
        likelyImportantFactors: [],
        scoreTable: [{ item: "기술성", points: 30, description: "기술성 평가", evidenceLabel: "p.3" }],
        prioritySignals: ["기술성 비중 최대"],
      },
      aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
      evidence: [],
      quality: { confidence: "high", hasParsedAttachment: true, hasSelectionCriteria: true, missingFields: [], warnings: [], hasScoreTable: true },
    });

    expect(dto).not.toBeNull();
    expect(dto!.quality.hasScoreTable).toBe(true);
    expect(dto!.selection.scoreTable).toHaveLength(1);
    expect(dto!.selection.scoreTable![0].item).toBe("기술성");
    expect(dto!.selection.prioritySignals).toEqual(["기술성 비중 최대"]);
  });

  it("defaults hasScoreTable to false when not in source quality", () => {
    const dto = serializeProjectAnalysisPublic({
      summary: { plain: "요약", keyPoints: [] },
      benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
      eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
      period: { isOpenEnded: false, status: "open" },
      application: { method: [], channels: [], requiredDocuments: [], contact: [] },
      selection: { criteria: [], scoringHints: [], likelyImportantFactors: [] },
      aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
      evidence: [],
      quality: { confidence: "medium", hasParsedAttachment: false, hasSelectionCriteria: false, missingFields: [], warnings: [] },
    });

    expect(dto).not.toBeNull();
    expect(dto!.quality.hasScoreTable).toBe(false);
  });
});
