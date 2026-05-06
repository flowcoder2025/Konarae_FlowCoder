import {
  classifyAttachmentDocument,
  getParseQuality,
  dedupeAttachmentDocuments,
  buildTypedAttachmentContent,
  extractSelectionInsights,
  type AttachmentDocType,
  type ParseQuality,
  type AttachmentDocumentInput,
  type ClassifiedAttachmentDocument,
} from "@/lib/projects/attachment-intelligence";

describe("classifyAttachmentDocument", () => {
  it("classifies evaluation criteria filename", () => {
    const result = classifyAttachmentDocument({
      fileName: "붙임_평가표_선정기준.hwp",
      sourceUrl: "http://example.com/a.hwp",
    });
    expect(result.attachmentDocType).toBe<AttachmentDocType>("evaluation_criteria");
  });

  it("classifies application form filename", () => {
    const result = classifyAttachmentDocument({
      fileName: "사업계획서_신청양식.hwp",
      sourceUrl: "http://example.com/b.hwp",
    });
    expect(result.attachmentDocType).toBe<AttachmentDocType>("application_form");
  });

  it("classifies required documents filename", () => {
    const result = classifyAttachmentDocument({
      fileName: "제출서류_체크리스트.pdf",
      sourceUrl: "http://example.com/c.pdf",
    });
    expect(result.attachmentDocType).toBe<AttachmentDocType>("required_documents");
  });

  it("preserves strong filename classification when content contains evaluation rows (regression: filename wins over content)", () => {
    // 신청서.hwp → application_form by filename.
    // Even if parsed content looks like an evaluation doc, the filename type must be kept.
    // Evaluation sections should be recorded in extractedMetadata.detectedSections instead.
    const result = classifyAttachmentDocument({
      fileName: "신청서.hwp",
      sourceUrl: "http://example.com/app.hwp",
      isParsed: true,
      parsedContent: "사업화 가능성 40점\n수행 역량 30점\n기대 효과 30점\n선정기준에 의거하여 채점합니다.",
    });
    expect(result.attachmentDocType).toBe<AttachmentDocType>("application_form");
    // Content sections should still be captured in metadata
    expect(result.extractedMetadata?.detectedSections).toContain("evaluation");
  });

  it("accepts null for optional fields at runtime", () => {
    // Spec: storagePath, parsedContent, isParsed, parseError must accept null
    const input: AttachmentDocumentInput = {
      fileName: "공고문.pdf",
      sourceUrl: "http://example.com/d.pdf",
      storagePath: null,
      parsedContent: null,
      isParsed: null,
      parseError: null,
    };
    // Should not throw
    const result = classifyAttachmentDocument(input);
    expect(result).toBeDefined();
    expect(result.parseQuality).toBe<ParseQuality>("failed");
  });
});

describe("getParseQuality", () => {
  it("returns low for short text with normalized length below 100 chars (e.g. '공고')", () => {
    expect(getParseQuality("공고")).toBe<ParseQuality>("low");
  });

  it("returns failed when parseError is provided with no content", () => {
    expect(getParseQuality(undefined, "No text extracted")).toBe<ParseQuality>("failed");
  });

  it("returns high for meaningful Korean text about 사업화 가능성/수행 역량/기대 효과", () => {
    const meaningfulText =
      "사업화 가능성은 해당 기술이 시장에서 실제로 수익을 창출할 수 있는지를 평가하며, 수행 역량은 신청 기관이 프로젝트를 성공적으로 완료할 수 있는 능력을 갖추고 있는지를 검토합니다. 기대 효과 측면에서 이 사업은 지역 경제 활성화와 일자리 창출에 크게 기여할 것으로 예상됩니다. 선정 기준에 따라 사업화 역량과 기술 완성도가 핵심 평가 항목으로 반영됩니다.";
    expect(getParseQuality(meaningfulText)).toBe<ParseQuality>("high");
  });

  it("returns low for normalized content length 50–99 chars (not medium)", () => {
    // 50–99 normalized chars must be low per spec
    // Build a string that has ~70 non-punctuation/space chars
    const text = "가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아";
    const result = getParseQuality(text);
    expect(result).toBe<ParseQuality>("low");
  });
});

describe("dedupeAttachmentDocuments", () => {
  it("dedupes by sourceUrl first, not filename alone", () => {
    const docs: AttachmentDocumentInput[] = [
      { fileName: "공고문.pdf", sourceUrl: "http://example.com/file1.pdf" },
      { fileName: "공고문.pdf", sourceUrl: "http://example.com/file2.pdf" },
      { fileName: "공고문.pdf", sourceUrl: "http://example.com/file1.pdf" },
    ];
    const result = dedupeAttachmentDocuments(docs);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.sourceUrl)).toEqual(
      expect.arrayContaining([
        "http://example.com/file1.pdf",
        "http://example.com/file2.pdf",
      ])
    );
  });

  it("dedupes by storagePath when sourceUrl is absent", () => {
    const docs: AttachmentDocumentInput[] = [
      { fileName: "a.pdf", sourceUrl: "", storagePath: "bucket/path/a.pdf" },
      { fileName: "a.pdf", sourceUrl: "", storagePath: "bucket/path/a.pdf" },
      { fileName: "a.pdf", sourceUrl: "", storagePath: "bucket/path/b.pdf" },
    ];
    const result = dedupeAttachmentDocuments(docs);
    expect(result).toHaveLength(2);
  });

  it("treats each document as unique by index when neither sourceUrl nor storagePath exists", () => {
    const docs: AttachmentDocumentInput[] = [
      { fileName: "신청서.hwp", sourceUrl: "", storagePath: null },
      { fileName: "신청서.hwp", sourceUrl: "", storagePath: null },
    ];
    const result = dedupeAttachmentDocuments(docs);
    // Both should be kept since they have no shared key
    expect(result).toHaveLength(2);
  });
});

describe("buildTypedAttachmentContent", () => {
  it("returns string|null — returns null when no usable content", () => {
    const docs: AttachmentDocumentInput[] = [
      { fileName: "공고문.pdf", sourceUrl: "http://example.com/1.pdf" },
    ];
    const result = buildTypedAttachmentContent(docs);
    // No parsedContent, so no usable docs
    expect(result).toBeNull();
  });

  it("returns a string when usable content exists", () => {
    const docs: AttachmentDocumentInput[] = [
      {
        fileName: "공고문.hwp",
        sourceUrl: "http://example.com/1.hwp",
        parsedContent: "사업화 가능성은 해당 기술이 시장에서 실제로 수익을 창출할 수 있는지를 평가하며 수행 역량은 신청 기관이 프로젝트를 성공적으로 완료할 수 있는 능력을 갖추고 있는지를 검토합니다.",
        isParsed: true,
      },
    ];
    const result = buildTypedAttachmentContent(docs);
    expect(typeof result).toBe("string");
  });

  it("sorts evaluation_criteria before announcement and contains correct labels", () => {
    const docs: AttachmentDocumentInput[] = [
      {
        fileName: "공고문.hwp",
        sourceUrl: "http://example.com/1.hwp",
        parsedContent: "지원 대상은 창업 3년 이내 기업입니다. 신청 방법은 온라인 제출이며 선정은 평가위원회를 통해 이루어집니다.",
        isParsed: true,
      },
      {
        fileName: "평가표.hwp",
        sourceUrl: "http://example.com/2.hwp",
        parsedContent: "사업화 가능성 40점 수행 역량 30점 기대 효과 30점",
        isParsed: true,
      },
    ];
    const result = buildTypedAttachmentContent(docs);
    expect(typeof result).toBe("string");
    const str = result as string;
    // Must contain both labels
    expect(str).toContain("[evaluation_criteria] 평가표.hwp");
    expect(str).toContain("[announcement] 공고문.hwp");
    // evaluation_criteria must appear before announcement
    const evalIdx = str.indexOf("[evaluation_criteria] 평가표.hwp");
    const annoIdx = str.indexOf("[announcement] 공고문.hwp");
    expect(evalIdx).toBeLessThan(annoIdx);
  });
});

describe("extractSelectionInsights", () => {
  it("extracts score table rows from explicit 점 entries, ignoring 합계 summary rows", () => {
    const evalDoc: AttachmentDocumentInput = {
      fileName: "평가표_선정기준.hwp",
      sourceUrl: "http://example.com/eval.hwp",
      parsedContent: `평가 항목\n사업화 가능성 40점\n수행 역량 30점\n기대 효과 30점\n합계 100점\n평가는 제출된 사업계획서와 증빙자료를 바탕으로 기술성, 사업화 가능성, 수행 역량, 기대 효과를 종합적으로 검토합니다. 각 항목은 평가위원이 신청 기업의 준비 수준과 실행 가능성을 확인하기 위한 기준입니다.`,
      isParsed: true,
    };
    const insights = extractSelectionInsights([evalDoc]);
    expect(insights.scoreTable).toBeDefined();
    // Must be exactly 3 rows — 합계 row must be excluded
    expect(insights.scoreTable).toHaveLength(3);

    const items = insights.scoreTable!.map((row) => row.item);
    expect(items).toContain("사업화 가능성");
    expect(items).toContain("수행 역량");
    expect(items).toContain("기대 효과");
    // 합계 must not appear as a scored item
    expect(items).not.toContain("합계");
  });

  it("uses fileName as evidenceLabel for score rows", () => {
    const evalDoc: AttachmentDocumentInput = {
      fileName: "평가표.hwp",
      sourceUrl: "http://example.com/eval.hwp",
      parsedContent: `사업화 가능성 40점\n수행 역량 30점\n기대 효과 30점\n평가는 제출된 사업계획서와 증빙자료를 바탕으로 기술성, 사업화 가능성, 수행 역량, 기대 효과를 종합적으로 검토합니다. 각 항목은 평가위원이 신청 기업의 준비 수준과 실행 가능성을 확인하기 위한 기준입니다.`,
      isParsed: true,
    };
    const insights = extractSelectionInsights([evalDoc]);
    expect(insights.scoreTable).toBeDefined();
    const expectedRows = [
      { item: "사업화 가능성", points: 40, description: "사업화 가능성 40점", evidenceLabel: "평가표.hwp" },
      { item: "수행 역량", points: 30, description: "수행 역량 30점", evidenceLabel: "평가표.hwp" },
      { item: "기대 효과", points: 30, description: "기대 효과 30점", evidenceLabel: "평가표.hwp" },
    ];
    expect(insights.scoreTable).toEqual(expectedRows);
  });

  it("includes a scoring hint about confirmed point-allocation items", () => {
    const evalDoc: AttachmentDocumentInput = {
      fileName: "평가표_선정기준.hwp",
      sourceUrl: "http://example.com/eval.hwp",
      parsedContent: `사업화 가능성 40점\n수행 역량 30점\n기대 효과 30점\n평가는 제출된 사업계획서와 증빙자료를 바탕으로 기술성, 사업화 가능성, 수행 역량, 기대 효과를 종합적으로 검토합니다. 각 항목은 평가위원이 신청 기업의 준비 수준과 실행 가능성을 확인하기 위한 기준입니다.`,
      isParsed: true,
    };
    const insights = extractSelectionInsights([evalDoc]);
    const hintsText = insights.scoringHints.join(" ");
    expect(hintsText.toLowerCase()).toMatch(/점|배점|score|point/i);
  });

  it("does not hallucinate score rows when no 점 pattern exists", () => {
    const doc: AttachmentDocumentInput = {
      fileName: "공고문.pdf",
      sourceUrl: "http://example.com/anno.pdf",
      parsedContent: "지원 대상은 창업 3년 이내 기업입니다.",
      isParsed: true,
    };
    const insights = extractSelectionInsights([doc]);
    expect(insights.scoreTable ?? []).toHaveLength(0);
  });

  it("ignores low-quality evaluation documents for score table extraction", () => {
    const evalDoc: AttachmentDocumentInput = {
      fileName: "평가표.hwp",
      sourceUrl: "http://example.com/low-quality-eval.hwp",
      parsedContent: "사업화 가능성 40점",
      isParsed: true,
    };

    const insights = extractSelectionInsights([evalDoc]);

    expect(insights.criteria).toEqual([]);
    expect(insights.scoreTable).toBeUndefined();
    expect(insights.prioritySignals).toBeUndefined();
  });
});
