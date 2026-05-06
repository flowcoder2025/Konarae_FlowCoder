# Support Search Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve FlowMate's support-project analysis by classifying parsed attachments, using confirmed duplicate groups as the analysis boundary, strengthening selection criteria output, and recording current source coverage diagnostics.

**Architecture:** Keep the existing crawler, parser, deduplication, public API, and detail page flow. Add small focused utilities for attachment intelligence and crawl metrics, then wire them into `project-analyzer.ts`, `worker.ts`, Prisma schema, public DTO serialization, and the project detail page.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, PostgreSQL/Supabase, Jest, Zod, existing AI SDK/OpenAI analyzer path.

---

## Source Spec

- Design spec: `docs/superpowers/specs/2026-05-02-support-search-analysis-design.md`

## Important Execution Rules

- Do not run DB-mutating commands such as `prisma db push` without explicit user approval in the implementation session.
- If DB schema changes need local client regeneration, run `corepack pnpm db:generate`; this is local code generation, not a database mutation.
- Commit steps below are checkpoints. Execute them only if the user has explicitly authorized commits in the implementation session.
- Keep implementation scope to current sources and existing public detail/API behavior. Do not add new crawler sources.

## File Map

- Modify: `prisma/schema.prisma`
  - Add `ProjectAttachment.attachmentDocType`, `documentRole`, `parseQuality`, `extractedMetadata`.
  - Add `CrawlJob.metrics Json?`.

- Modify: `src/lib/projects/analysis-schema.ts`
  - Add optional `selection.scoreTable`, optional `selection.prioritySignals`, and public/internal `quality.hasScoreTable`.

- Modify: `src/lib/projects/public-dto.ts`
  - Preserve new `quality.hasScoreTable` in public analysis DTO.

- Create: `src/lib/projects/attachment-intelligence.ts`
  - Pure classification, parse quality, document priority, dedupe, typed input formatting, and selection insight extraction.

- Create: `__tests__/lib/projects/attachment-intelligence.test.ts`
  - Unit tests for deterministic classification, quality, dedupe, and selection insight extraction.

- Create: `src/lib/crawler/crawl-metrics.ts`
  - Pure crawl metrics builder for `CrawlJob.metrics`.

- Create: `__tests__/lib/crawler/crawl-metrics.test.ts`
  - Unit tests for diagnostics metrics.

- Modify: `src/lib/crawler/project-analyzer.ts`
  - Replace single-project attachment concatenation with group-aware document collection.
  - Keep `integrateAttachmentContent(projectId)` exported for compatibility, but implement it via typed document input.
  - Pass selection insights into `buildProjectAnalysis`.

- Modify: `__tests__/lib/project-analyzer.test.ts`
  - Add regression tests for `scoreTable`, selection hints, and group-aware fallback behavior where practical through pure exported helpers.

- Modify: `src/lib/crawler/worker.ts`
  - Persist attachment intelligence metadata when saving `ProjectAttachment` rows.
  - Return file processing stats from `processProjectFiles` and store `CrawlJob.metrics` on completion/failure.

- Modify: `src/app/projects/[id]/page.tsx`
  - Render optional score table and stronger selection criteria without changing route behavior.

- Modify: `__tests__/components/projects/project-description-renderer.test.tsx` or create `__tests__/app/projects/project-detail-selection.test.tsx` only if the page is easy to test with existing mocks. If page testing becomes brittle, cover UI behavior through serializer/schema tests and manual browser verification during implementation.

---

### Task 1: Schema and Public Analysis Shape

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/projects/analysis-schema.ts`
- Modify: `src/lib/projects/public-dto.ts`
- Modify: `__tests__/lib/projects/analysis-schema.test.ts`
- Modify: `__tests__/lib/projects/public-dto.test.ts`

- [ ] **Step 1: Add failing schema tests for score table and public quality hint**

Append these tests to `__tests__/lib/projects/analysis-schema.test.ts`:

```ts
it("accepts selection score table and public score table quality hint", () => {
  const parsed = ProjectAnalysisSchema.parse({
    summary: { plain: "요약", keyPoints: [] },
    benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
    eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
    period: { isOpenEnded: false, status: "open" },
    application: { method: [], channels: [], requiredDocuments: [], contact: [] },
    selection: {
      criteria: ["사업성"],
      scoringHints: ["시장성 근거를 정량화"],
      likelyImportantFactors: ["매출 가능성"],
      scoreTable: [
        {
          item: "사업화 가능성",
          points: 40,
          description: "시장성과 실행계획을 평가",
          evidenceLabel: "평가표",
        },
      ],
      prioritySignals: ["배점 40점"],
    },
    aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
    evidence: [],
    quality: {
      confidence: "high",
      hasParsedAttachment: true,
      hasSelectionCriteria: true,
      hasScoreTable: true,
      missingFields: [],
      warnings: [],
    },
  });

  expect(parsed.selection.scoreTable?.[0].points).toBe(40);
  expect(parsed.quality.hasScoreTable).toBe(true);
});
```

Append this test to the `ProjectAnalysisPublicSchema` block in the same file:

```ts
it("exposes score table and hasScoreTable but still strips evidence", () => {
  const publicShape = ProjectAnalysisPublicSchema.parse({
    summary: { plain: "요약", keyPoints: [] },
    benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
    eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
    period: { isOpenEnded: false, status: "open" },
    application: { method: [], channels: [], requiredDocuments: [], contact: [] },
    selection: {
      criteria: ["사업성"],
      scoringHints: [],
      likelyImportantFactors: [],
      scoreTable: [{ item: "사업성", points: 30, description: "사업성 평가", evidenceLabel: "평가표" }],
      prioritySignals: ["고배점"],
    },
    aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
    evidence: [{ id: "e1", source: "attachment", label: "내부", text: "원문" }],
    quality: {
      confidence: "high",
      hasParsedAttachment: true,
      hasSelectionCriteria: true,
      hasScoreTable: true,
      missingFields: [],
      warnings: ["internal"],
    },
  });

  expect(publicShape.selection.scoreTable?.[0].item).toBe("사업성");
  expect(publicShape.selection.prioritySignals).toEqual(["고배점"]);
  expect(publicShape.quality.hasScoreTable).toBe(true);
  expect("evidence" in publicShape).toBe(false);
  expect("warnings" in publicShape.quality).toBe(false);
});
```

- [ ] **Step 2: Add failing public DTO serializer test**

Append to `__tests__/lib/projects/public-dto.test.ts`:

```ts
it("preserves public score table quality hint", () => {
  const dto = serializeProjectAnalysisPublic({
    summary: { plain: "요약", keyPoints: [] },
    benefits: { maxAmount: null, nonCashBenefits: [], notes: [] },
    eligibility: { required: [], preferred: [], excluded: [], ambiguous: [] },
    period: { isOpenEnded: false, status: "open" },
    application: { method: [], channels: [], requiredDocuments: [], contact: [] },
    selection: {
      criteria: ["사업성"],
      scoringHints: ["구체적 실행계획 제시"],
      likelyImportantFactors: [],
      scoreTable: [{ item: "사업성", points: 40, description: "시장성과 실행계획", evidenceLabel: "평가표" }],
    },
    aiTips: { whoShouldApply: [], preparationPriority: [], writingStrategy: [], commonRisks: [], checklist: [] },
    evidence: [],
    quality: {
      confidence: "high",
      hasParsedAttachment: true,
      hasSelectionCriteria: true,
      hasScoreTable: true,
      missingFields: [],
      warnings: [],
    },
  });

  expect(dto?.quality.hasScoreTable).toBe(true);
  expect(dto?.selection.scoreTable?.[0].points).toBe(40);
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
corepack pnpm test -- __tests__/lib/projects/analysis-schema.test.ts __tests__/lib/projects/public-dto.test.ts
```

Expected: FAIL because `scoreTable`, `prioritySignals`, and `hasScoreTable` are not yet in the Zod schemas/serializer.

- [ ] **Step 4: Update `analysis-schema.ts`**

Modify `src/lib/projects/analysis-schema.ts` around the selection and quality schemas:

```ts
const ScoreTableItemSchema = z.object({
  item: z.string(),
  points: z.number().optional(),
  description: z.string(),
  evidenceLabel: z.string(),
});

const SelectionSchema = z.object({
  criteria: z.array(z.string()),
  scoringHints: z.array(z.string()),
  likelyImportantFactors: z.array(z.string()),
  scoreTable: z.array(ScoreTableItemSchema).optional(),
  prioritySignals: z.array(z.string()).optional(),
});
```

Modify `QualitySchema`:

```ts
const QualitySchema = z.object({
  confidence: ConfidenceSchema,
  hasParsedAttachment: z.boolean(),
  hasSelectionCriteria: z.boolean(),
  hasScoreTable: z.boolean().default(false),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
});
```

Modify `QualityPublicSchema`:

```ts
const QualityPublicSchema = z.object({
  confidence: ConfidenceSchema,
  hasParsedAttachment: z.boolean(),
  hasSelectionCriteria: z.boolean(),
  hasScoreTable: z.boolean().default(false),
});
```

No public evidence fields should be added.

- [ ] **Step 5: Update public DTO serializer**

Modify `serializeProjectAnalysisPublic()` in `src/lib/projects/public-dto.ts`:

```ts
return ProjectAnalysisPublicSchema.parse({
  ...full.data,
  quality: {
    confidence: full.data.quality.confidence,
    hasParsedAttachment: full.data.quality.hasParsedAttachment,
    hasSelectionCriteria: full.data.quality.hasSelectionCriteria,
    hasScoreTable: full.data.quality.hasScoreTable ?? false,
  },
});
```

- [ ] **Step 6: Update existing tests that build quality without `hasScoreTable` only if needed**

Because `hasScoreTable` has a default, existing tests should continue passing. If any test fails due object equality, update expected public quality objects to include `hasScoreTable: false` only where the serializer returns it.

For example in `__tests__/lib/projects/public-dto.test.ts`, if the public defaults test fails, change the expected trust object only if `trust` is intentionally extended. Do not add `hasScoreTable` to `trust` unless the implementation explicitly chooses to expose it there; the spec only requires `analysis.quality.hasScoreTable`.

- [ ] **Step 7: Update Prisma schema fields**

Modify `ProjectAttachment` in `prisma/schema.prisma`:

```prisma
  // Document intelligence
  attachmentDocType String? // announcement | application_form | evaluation_criteria | required_documents | guideline | other
  documentRole      String? // primary | supporting | low_signal
  parseQuality      String? // high | medium | low | failed
  extractedMetadata Json?   // headings, detectedSections, scoreItems, requiredDocs, warnings
```

Place these fields after `parseError`.

Modify `CrawlJob` in `prisma/schema.prisma`:

```prisma
  metrics Json? // source diagnostics: list/detail/attachment/parse/analyze readiness counts
```

Place this after `errorMessage` or after the existing count fields. Do not create manual SQL.

- [ ] **Step 8: Regenerate Prisma client locally**

Run:

```bash
corepack pnpm db:generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 9: Run focused tests again**

Run:

```bash
corepack pnpm test -- __tests__/lib/projects/analysis-schema.test.ts __tests__/lib/projects/public-dto.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit checkpoint if authorized**

If the user explicitly authorized commits, run:

```bash
git add prisma/schema.prisma src/lib/projects/analysis-schema.ts src/lib/projects/public-dto.ts __tests__/lib/projects/analysis-schema.test.ts __tests__/lib/projects/public-dto.test.ts
git commit -m "$(cat <<'EOF'
WI-chore 지원사업 분석 스키마 확장

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Attachment Intelligence Utility

**Files:**
- Create: `src/lib/projects/attachment-intelligence.ts`
- Create: `__tests__/lib/projects/attachment-intelligence.test.ts`

- [ ] **Step 1: Write failing tests for attachment classification and quality**

Create `__tests__/lib/projects/attachment-intelligence.test.ts`:

```ts
import {
  buildTypedAttachmentContent,
  classifyAttachmentDocument,
  dedupeAttachmentDocuments,
  extractSelectionInsights,
  getParseQuality,
} from "@/lib/projects/attachment-intelligence";

describe("attachment intelligence", () => {
  it("classifies evaluation criteria from filename", () => {
    expect(classifyAttachmentDocument({ fileName: "붙임_평가표_선정기준.hwp" }).attachmentDocType).toBe("evaluation_criteria");
  });

  it("classifies application forms from filename", () => {
    expect(classifyAttachmentDocument({ fileName: "사업계획서_신청양식.hwp" }).attachmentDocType).toBe("application_form");
  });

  it("classifies required document checklists", () => {
    expect(classifyAttachmentDocument({ fileName: "제출서류_체크리스트.pdf" }).attachmentDocType).toBe("required_documents");
  });

  it("marks parse quality as low for short normalized text", () => {
    expect(getParseQuality("공고")).toBe("low");
  });

  it("marks parse quality as failed when parse error is present", () => {
    expect(getParseQuality(undefined, "No text extracted")).toBe("failed");
  });

  it("marks meaningful Korean text as high quality", () => {
    const text = "사업화 가능성 평가와 수행 역량 평가를 포함하며 시장성, 실행계획, 기대효과, 고용창출, 매출성장 가능성을 종합적으로 검토합니다.";
    expect(getParseQuality(text)).toBe("high");
  });

  it("deduplicates by sourceUrl before storagePath and never by filename alone", () => {
    const docs = dedupeAttachmentDocuments([
      { fileName: "신청서.hwp", sourceUrl: "https://a.test/file.hwp", storagePath: "p/1.hwp", parsedContent: "A" },
      { fileName: "신청서.hwp", sourceUrl: "https://a.test/file.hwp", storagePath: "p/2.hwp", parsedContent: "B" },
      { fileName: "신청서.hwp", sourceUrl: "https://b.test/file.hwp", storagePath: "p/3.hwp", parsedContent: "C" },
    ]);

    expect(docs).toHaveLength(2);
    expect(docs.map((doc) => doc.sourceUrl)).toEqual(["https://a.test/file.hwp", "https://b.test/file.hwp"]);
  });

  it("formats typed attachment content in analysis priority order", () => {
    const content = buildTypedAttachmentContent([
      { fileName: "공고문.hwp", sourceUrl: "u1", attachmentDocType: "announcement", documentRole: "primary", parseQuality: "high", parsedContent: "공고 내용" },
      { fileName: "평가표.hwp", sourceUrl: "u2", attachmentDocType: "evaluation_criteria", documentRole: "primary", parseQuality: "high", parsedContent: "평가 내용" },
    ]);

    expect(content?.indexOf("[evaluation_criteria] 평가표.hwp")).toBeLessThan(content!.indexOf("[announcement] 공고문.hwp"));
  });

  it("extracts score table and strategy hints from evaluation text", () => {
    const insights = extractSelectionInsights([
      {
        fileName: "평가표.hwp",
        sourceUrl: "u1",
        attachmentDocType: "evaluation_criteria",
        documentRole: "primary",
        parseQuality: "high",
        parsedContent: "사업화 가능성 40점\n수행 역량 30점\n기대 효과 30점",
      },
    ]);

    expect(insights.scoreTable).toEqual([
      { item: "사업화 가능성", points: 40, description: "사업화 가능성 40점", evidenceLabel: "평가표.hwp" },
      { item: "수행 역량", points: 30, description: "수행 역량 30점", evidenceLabel: "평가표.hwp" },
      { item: "기대 효과", points: 30, description: "기대 효과 30점", evidenceLabel: "평가표.hwp" },
    ]);
    expect(insights.scoringHints).toContain("배점이 확인된 항목을 사업계획서 목차와 근거 자료에서 우선 보강하세요.");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack pnpm test -- __tests__/lib/projects/attachment-intelligence.test.ts
```

Expected: FAIL because `src/lib/projects/attachment-intelligence.ts` does not exist.

- [ ] **Step 3: Implement attachment intelligence utility**

Create `src/lib/projects/attachment-intelligence.ts`:

```ts
export type AttachmentDocType = "announcement" | "application_form" | "evaluation_criteria" | "required_documents" | "guideline" | "other";
export type DocumentRole = "primary" | "supporting" | "low_signal";
export type ParseQuality = "high" | "medium" | "low" | "failed";

export interface AttachmentDocumentInput {
  fileName: string;
  sourceUrl: string;
  storagePath?: string | null;
  parsedContent?: string | null;
  isParsed?: boolean | null;
  parseError?: string | null;
}

export interface ClassifiedAttachmentDocument extends AttachmentDocumentInput {
  attachmentDocType: AttachmentDocType;
  documentRole: DocumentRole;
  parseQuality: ParseQuality;
  extractedMetadata?: {
    detectedSections?: string[];
    scoreItems?: Array<{ item: string; points?: number; description: string; evidenceLabel: string }>;
    warnings?: string[];
  };
}

export interface SelectionInsights {
  criteria: string[];
  scoringHints: string[];
  likelyImportantFactors: string[];
  scoreTable?: Array<{ item: string; points?: number; description: string; evidenceLabel: string }>;
  prioritySignals?: string[];
  writingStrategy: string[];
  preparationPriority: string[];
  commonRisks: string[];
}

const TYPE_KEYWORDS: Array<{ type: AttachmentDocType; keywords: string[] }> = [
  { type: "evaluation_criteria", keywords: ["평가표", "평가기준", "선정기준", "심사", "배점", "평가"] },
  { type: "application_form", keywords: ["신청서", "지원서", "사업계획서", "신청양식", "양식"] },
  { type: "required_documents", keywords: ["제출서류", "구비서류", "체크리스트", "증빙"] },
  { type: "announcement", keywords: ["공고", "모집", "안내"] },
  { type: "guideline", keywords: ["운영지침", "사업안내", "매뉴얼", "가이드", "지침"] },
];

const TYPE_PRIORITY: Record<AttachmentDocType, number> = {
  evaluation_criteria: 100,
  application_form: 90,
  announcement: 80,
  required_documents: 70,
  guideline: 60,
  other: 10,
};

function normalizeForCount(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, "");
}

function mojibakeRatio(text: string): number {
  if (!text) return 0;
  const suspicious = text.match(/[� ]|[혚혞혱챘챙챗]/g)?.length ?? 0;
  return suspicious / text.length;
}

export function getParseQuality(parsedContent?: string | null, parseError?: string | null): ParseQuality {
  if (parseError) return "failed";
  const text = parsedContent?.trim() ?? "";
  if (!text) return "low";
  const meaningfulLength = normalizeForCount(text).length;
  if (meaningfulLength < 100 || mojibakeRatio(text) > 0.3) return "low";
  if (meaningfulLength < 500) return "medium";
  return "high";
}

function detectTypeFromText(parsedContent?: string | null): AttachmentDocType | null {
  const text = parsedContent?.slice(0, 5000) ?? "";
  if (!text) return null;
  if (/배점|평가항목|심사항목|선정기준/.test(text)) return "evaluation_criteria";
  if (/신청인|사업계획서|작성요령|신청서/.test(text)) return "application_form";
  if (/제출서류|구비서류|증빙서류/.test(text)) return "required_documents";
  return null;
}

export function classifyAttachmentDocument(input: AttachmentDocumentInput): ClassifiedAttachmentDocument {
  const fileName = input.fileName.toLowerCase();
  const filenameType = TYPE_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => fileName.includes(keyword)))?.type;
  const textType = detectTypeFromText(input.parsedContent);
  const attachmentDocType = filenameType ?? textType ?? "other";
  const parseQuality = getParseQuality(input.parsedContent, input.parseError);
  const documentRole: DocumentRole = parseQuality === "low" || parseQuality === "failed" ? "low_signal" : attachmentDocType === "other" ? "supporting" : "primary";
  const detectedSections = textType && textType !== attachmentDocType ? [textType] : [];

  return {
    ...input,
    attachmentDocType,
    documentRole,
    parseQuality,
    extractedMetadata: detectedSections.length ? { detectedSections } : undefined,
  };
}

export function dedupeAttachmentDocuments<T extends AttachmentDocumentInput>(documents: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const document of documents) {
    const key = document.sourceUrl || document.storagePath;
    if (!key) {
      result.push(document);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }

  return result;
}

function sortByAnalysisPriority(documents: ClassifiedAttachmentDocument[]): ClassifiedAttachmentDocument[] {
  return [...documents].sort((a, b) => TYPE_PRIORITY[b.attachmentDocType] - TYPE_PRIORITY[a.attachmentDocType]);
}

export function buildTypedAttachmentContent(documents: ClassifiedAttachmentDocument[]): string | null {
  const usable = sortByAnalysisPriority(documents).filter((document) => document.parsedContent?.trim() && document.parseQuality !== "failed");
  if (usable.length === 0) return null;

  return usable
    .map((document) => `[${document.attachmentDocType}] ${document.fileName}\nquality=${document.parseQuality}; role=${document.documentRole}\n${document.parsedContent}`)
    .join("\n\n---\n\n");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractScoreRows(document: ClassifiedAttachmentDocument): Array<{ item: string; points?: number; description: string; evidenceLabel: string }> {
  const text = document.parsedContent ?? "";
  const rows: Array<{ item: string; points?: number; description: string; evidenceLabel: string }> = [];
  const pattern = /^\s*([가-힣A-Za-z0-9\s·/()]+?)\s*(\d{1,3})\s*점\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const item = match[1].replace(/[-•]/g, "").trim();
    const points = Number(match[2]);
    if (!item || Number.isNaN(points)) continue;
    rows.push({ item, points, description: `${item} ${points}점`, evidenceLabel: document.fileName });
  }

  return rows.slice(0, 10);
}

export function extractSelectionInsights(documents: ClassifiedAttachmentDocument[]): SelectionInsights {
  const evaluationDocs = documents.filter((document) => document.attachmentDocType === "evaluation_criteria" && document.parseQuality !== "failed");
  const applicationDocs = documents.filter((document) => document.attachmentDocType === "application_form" && document.parseQuality !== "failed");
  const scoreTable = evaluationDocs.flatMap(extractScoreRows).slice(0, 12);
  const criteria = unique([
    ...scoreTable.map((row) => row.item),
    ...evaluationDocs.flatMap((document) => {
      const text = document.parsedContent ?? "";
      return ["사업화 가능성", "수행 역량", "기대 효과", "시장성", "실행계획"].filter((keyword) => text.includes(keyword));
    }),
  ]).slice(0, 8);

  const scoringHints = scoreTable.length
    ? ["배점이 확인된 항목을 사업계획서 목차와 근거 자료에서 우선 보강하세요."]
    : criteria.length
      ? ["선정 기준에 직접 언급된 항목을 신청서 답변의 핵심 구조로 사용하세요."]
      : [];

  const writingStrategy = applicationDocs.length || evaluationDocs.length
    ? ["신청서 항목과 평가 기준의 표현을 맞추고, 정량 지표와 증빙자료를 같은 순서로 배치하세요."]
    : [];

  return {
    criteria,
    scoringHints,
    likelyImportantFactors: criteria.slice(0, 5),
    scoreTable: scoreTable.length ? scoreTable : undefined,
    prioritySignals: scoreTable.map((row) => `${row.item} ${row.points}점`).slice(0, 8),
    writingStrategy,
    preparationPriority: applicationDocs.length ? ["신청서와 사업계획서 양식의 항목별 요구사항을 먼저 채우세요."] : [],
    commonRisks: evaluationDocs.length ? ["고배점 항목의 근거가 부족하면 선정 가능성이 낮아질 수 있습니다."] : [],
  };
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm test -- __tests__/lib/projects/attachment-intelligence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint if authorized**

```bash
git add src/lib/projects/attachment-intelligence.ts __tests__/lib/projects/attachment-intelligence.test.ts
git commit -m "$(cat <<'EOF'
WI-chore 첨부 문서 분류 유틸리티 추가

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Group-Aware Document Collection and Analyzer Integration

**Files:**
- Modify: `src/lib/crawler/project-analyzer.ts`
- Modify: `__tests__/lib/project-analyzer.test.ts`

- [ ] **Step 1: Add failing tests for strengthened analysis output**

Append to `__tests__/lib/project-analyzer.test.ts`:

```ts
it("adds selection insights to project analysis when evaluation documents are available", () => {
  const analysis = buildProjectAnalysis({
    project: {
      ...project,
      evaluationCriteria: null,
    },
    markdown: "### 사업개요\n평가표 기반 분석",
    eligibilityCriteria: {},
    hasAttachmentContent: true,
    selectionInsights: {
      criteria: ["사업화 가능성"],
      scoringHints: ["배점이 확인된 항목을 우선 보강하세요."],
      likelyImportantFactors: ["사업화 가능성"],
      scoreTable: [{ item: "사업화 가능성", points: 40, description: "사업화 가능성 40점", evidenceLabel: "평가표.hwp" }],
      prioritySignals: ["사업화 가능성 40점"],
      writingStrategy: ["평가 기준 순서에 맞춰 신청서를 작성하세요."],
      preparationPriority: ["평가표 기준 확인"],
      commonRisks: ["고배점 항목 근거 부족"],
    },
  });

  expect(analysis.selection.criteria).toEqual(["사업화 가능성"]);
  expect(analysis.selection.scoreTable?.[0].points).toBe(40);
  expect(analysis.quality.hasSelectionCriteria).toBe(true);
  expect(analysis.quality.hasScoreTable).toBe(true);
  expect(analysis.aiTips.writingStrategy).toContain("평가 기준 순서에 맞춰 신청서를 작성하세요.");
});

it("keeps hasScoreTable false when no score rows are available", () => {
  const analysis = buildProjectAnalysis({
    project,
    markdown: "### 사업개요\n기본 분석",
    eligibilityCriteria: {},
    hasAttachmentContent: false,
  });

  expect(analysis.quality.hasScoreTable).toBe(false);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack pnpm test -- __tests__/lib/project-analyzer.test.ts
```

Expected: FAIL because `buildProjectAnalysis` does not accept `selectionInsights` and does not set `hasScoreTable`.

- [ ] **Step 3: Update imports in `project-analyzer.ts`**

Add imports near the top of `src/lib/crawler/project-analyzer.ts`:

```ts
import {
  buildTypedAttachmentContent,
  classifyAttachmentDocument,
  dedupeAttachmentDocuments,
  extractSelectionInsights,
  type ClassifiedAttachmentDocument,
  type SelectionInsights,
} from "@/lib/projects/attachment-intelligence";
```

- [ ] **Step 4: Add group-aware document collection helper**

Add below `integrateAttachmentContent` or replace its internals with these helpers in `src/lib/crawler/project-analyzer.ts`:

```ts
export async function collectProjectAnalysisDocuments(projectId: string): Promise<ClassifiedAttachmentDocument[]> {
  const project = await prisma.supportProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      groupId: true,
      group: {
        select: {
          reviewStatus: true,
          canonicalProjectId: true,
          projects: { select: { id: true } },
        },
      },
    },
  });

  if (!project) return [];

  const projectIds = project.group && project.group.reviewStatus !== "pending_review"
    ? project.group.projects.map((item) => item.id)
    : [project.group?.canonicalProjectId ?? project.id];

  const attachments = await prisma.projectAttachment.findMany({
    where: {
      projectId: { in: projectIds },
      isParsed: true,
      parsedContent: { not: null },
    },
    select: {
      fileName: true,
      sourceUrl: true,
      storagePath: true,
      parsedContent: true,
      isParsed: true,
      parseError: true,
      attachmentDocType: true,
      documentRole: true,
      parseQuality: true,
      extractedMetadata: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return dedupeAttachmentDocuments(attachments).map((attachment) => classifyAttachmentDocument({
    fileName: attachment.fileName,
    sourceUrl: attachment.sourceUrl,
    storagePath: attachment.storagePath,
    parsedContent: attachment.parsedContent,
    isParsed: attachment.isParsed,
    parseError: attachment.parseError,
  }));
}
```

- [ ] **Step 5: Replace `integrateAttachmentContent` internals**

Replace the current query/concat implementation with:

```ts
export async function integrateAttachmentContent(projectId: string): Promise<string | null> {
  const documents = await collectProjectAnalysisDocuments(projectId);
  return buildTypedAttachmentContent(documents);
}
```

This keeps the exported function name stable for existing callers.

- [ ] **Step 6: Extend `buildProjectAnalysis` input type**

Modify the input type of `buildProjectAnalysis` in `src/lib/crawler/project-analyzer.ts`:

```ts
  hasAttachmentContent: boolean;
  selectionInsights?: SelectionInsights;
```

- [ ] **Step 7: Merge project fields and selection insights**

Inside `buildProjectAnalysis`, before the `return`, add:

```ts
  const selectionCriteria = uniqueStrings(compactStrings([
    input.project.evaluationCriteria,
    ...(input.selectionInsights?.criteria ?? []),
  ]));
  const scoringHints = input.selectionInsights?.scoringHints ?? [];
  const likelyImportantFactors = input.selectionInsights?.likelyImportantFactors ?? [];
  const scoreTable = input.selectionInsights?.scoreTable;
  const prioritySignals = input.selectionInsights?.prioritySignals;
```

Then replace the current `selection` block with:

```ts
    selection: {
      criteria: selectionCriteria,
      scoringHints,
      likelyImportantFactors,
      ...(scoreTable?.length ? { scoreTable } : {}),
      ...(prioritySignals?.length ? { prioritySignals } : {}),
    },
```

Update `aiTips` fields:

```ts
      preparationPriority: uniqueStrings([
        ...input.project.requiredDocuments,
        ...(input.selectionInsights?.preparationPriority ?? []),
      ]),
      writingStrategy: input.selectionInsights?.writingStrategy ?? [],
      commonRisks: input.selectionInsights?.commonRisks ?? [],
```

Update quality:

```ts
      hasSelectionCriteria: selectionCriteria.length > 0,
      hasScoreTable: Boolean(scoreTable?.length),
```

- [ ] **Step 8: Wire insights in `analyzeProject`**

In `analyzeProject`, replace:

```ts
let attachmentContent: string | null = await integrateAttachmentContent(projectId);

const hasAttachmentContent = Boolean(attachmentContent?.trim());
```

With:

```ts
const analysisDocuments = await collectProjectAnalysisDocuments(projectId);
let attachmentContent: string | null = buildTypedAttachmentContent(analysisDocuments);
const selectionInsights = extractSelectionInsights(analysisDocuments);

const hasAttachmentContent = Boolean(attachmentContent?.trim());
```

Then pass `selectionInsights` into `buildProjectAnalysis`:

```ts
const projectAnalysis = ProjectAnalysisSchema.parse(buildProjectAnalysis({
  project,
  markdown,
  eligibilityCriteria,
  hasAttachmentContent,
  selectionInsights,
}));
```

After the update, clear the large array:

```ts
attachmentContent = null;
```

Do not keep a second long-lived copy of parsed attachment text.

- [ ] **Step 9: Run focused tests**

Run:

```bash
corepack pnpm test -- __tests__/lib/project-analyzer.test.ts __tests__/lib/projects/attachment-intelligence.test.ts __tests__/lib/projects/analysis-schema.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit checkpoint if authorized**

```bash
git add src/lib/crawler/project-analyzer.ts __tests__/lib/project-analyzer.test.ts
git commit -m "$(cat <<'EOF'
WI-chore 중복 그룹 기반 분석 입력 적용

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Persist Attachment Metadata and Crawl Diagnostics

**Files:**
- Create: `src/lib/crawler/crawl-metrics.ts`
- Create: `__tests__/lib/crawler/crawl-metrics.test.ts`
- Modify: `src/lib/crawler/worker.ts`

- [ ] **Step 1: Write failing tests for crawl metrics**

Create `__tests__/lib/crawler/crawl-metrics.test.ts`:

```ts
import { buildCrawlJobMetrics } from "@/lib/crawler/crawl-metrics";

describe("crawl metrics", () => {
  it("summarizes source coverage diagnostics", () => {
    expect(buildCrawlJobMetrics({
      listItemsFound: 10,
      detailPagesFetched: 8,
      projectsCreated: 3,
      projectsUpdated: 5,
      attachments: [
        { shouldParse: true, isParsed: true, parseError: null },
        { shouldParse: true, isParsed: false, parseError: "No text extracted" },
        { shouldParse: false, isParsed: false, parseError: null },
      ],
    })).toEqual({
      listItemsFound: 10,
      detailPagesFetched: 8,
      projectsCreated: 3,
      projectsUpdated: 5,
      attachmentLinksFound: 3,
      attachmentsDownloaded: 2,
      attachmentsParsed: 1,
      parseFailures: 1,
      analysisReadyProjects: 1,
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack pnpm test -- __tests__/lib/crawler/crawl-metrics.test.ts
```

Expected: FAIL because `crawl-metrics.ts` does not exist.

- [ ] **Step 3: Implement crawl metrics utility**

Create `src/lib/crawler/crawl-metrics.ts`:

```ts
export interface CrawlMetricAttachment {
  shouldParse: boolean;
  isParsed: boolean;
  parseError?: string | null;
}

export interface BuildCrawlJobMetricsInput {
  listItemsFound: number;
  detailPagesFetched: number;
  projectsCreated: number;
  projectsUpdated: number;
  attachments: CrawlMetricAttachment[];
}

export interface CrawlJobMetrics {
  listItemsFound: number;
  detailPagesFetched: number;
  projectsCreated: number;
  projectsUpdated: number;
  attachmentLinksFound: number;
  attachmentsDownloaded: number;
  attachmentsParsed: number;
  parseFailures: number;
  analysisReadyProjects: number;
}

export function buildCrawlJobMetrics(input: BuildCrawlJobMetricsInput): CrawlJobMetrics {
  const parseable = input.attachments.filter((attachment) => attachment.shouldParse);
  const parsed = parseable.filter((attachment) => attachment.isParsed);

  return {
    listItemsFound: input.listItemsFound,
    detailPagesFetched: input.detailPagesFetched,
    projectsCreated: input.projectsCreated,
    projectsUpdated: input.projectsUpdated,
    attachmentLinksFound: input.attachments.length,
    attachmentsDownloaded: parseable.length,
    attachmentsParsed: parsed.length,
    parseFailures: parseable.filter((attachment) => !attachment.isParsed || Boolean(attachment.parseError)).length,
    analysisReadyProjects: parsed.length > 0 ? 1 : 0,
  };
}
```

- [ ] **Step 4: Run metrics test**

Run:

```bash
corepack pnpm test -- __tests__/lib/crawler/crawl-metrics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update `SavedAttachment` in worker**

In `src/lib/crawler/worker.ts`, add imports:

```ts
import { buildCrawlJobMetrics, type CrawlMetricAttachment } from "@/lib/crawler/crawl-metrics";
import { classifyAttachmentDocument } from "@/lib/projects/attachment-intelligence";
```

Extend `SavedAttachment`:

```ts
interface SavedAttachment {
  fileName: string;
  fileType: FileType;
  fileSize: number;
  storagePath: string;
  sourceUrl: string;
  shouldParse: boolean;
  isParsed: boolean;
  parsedContent?: string;
  parseError?: string;
  attachmentDocType?: string;
  documentRole?: string;
  parseQuality?: string;
  extractedMetadata?: Record<string, unknown>;
}
```

- [ ] **Step 6: Add a helper to classify saved attachments**

Add near the `SavedAttachment` interface:

```ts
function withAttachmentIntelligence(attachment: SavedAttachment): SavedAttachment {
  const classified = classifyAttachmentDocument({
    fileName: attachment.fileName,
    sourceUrl: attachment.sourceUrl,
    storagePath: attachment.storagePath || null,
    parsedContent: attachment.parsedContent,
    isParsed: attachment.isParsed,
    parseError: attachment.parseError,
  });

  return {
    ...attachment,
    attachmentDocType: classified.attachmentDocType,
    documentRole: classified.documentRole,
    parseQuality: classified.parseQuality,
    extractedMetadata: classified.extractedMetadata,
  };
}
```

- [ ] **Step 7: Apply the helper before each attachment push**

For every `attachments.push({ ... })` inside `processProjectFiles`, wrap the object:

```ts
attachments.push(withAttachmentIntelligence({
  fileName: finalFileName,
  fileType: detectedType as FileType,
  fileSize: fileBuffer.length,
  storagePath: uploadResult.storagePath,
  sourceUrl: url,
  shouldParse: true,
  isParsed,
  parsedContent,
  parseError,
}));
```

Do the same for failure and URL-only branches. Use the local variable names already present in each branch (`urlFileName`, `finalFileName`, `detectedType`, `finalFileType`). Do not change download or parsing behavior.

- [ ] **Step 8: Persist new attachment metadata fields**

In the `prisma.projectAttachment.create` call around `src/lib/crawler/worker.ts:3689`, add:

```ts
                attachmentDocType: attachment.attachmentDocType,
                documentRole: attachment.documentRole,
                parseQuality: attachment.parseQuality,
                extractedMetadata: attachment.extractedMetadata as Prisma.InputJsonValue | undefined,
```

If `Prisma` is not imported in `worker.ts`, update the existing `@prisma/client` import to include it.

- [ ] **Step 9: Return file stats from `saveProjects`**

Find the `saveProjects` return type and implementation. It currently returns `{ newCount, updatedCount, filesProcessed }`. Add `attachmentsForMetrics`:

```ts
const attachmentsForMetrics: CrawlMetricAttachment[] = [];
```

After each attachment is saved, push:

```ts
attachmentsForMetrics.push({
  shouldParse: attachment.shouldParse,
  isParsed: attachment.isParsed,
  parseError: attachment.parseError ?? null,
});
```

Return it:

```ts
return { newCount, updatedCount, filesProcessed, attachmentsForMetrics };
```

- [ ] **Step 10: Store `CrawlJob.metrics` on completion**

In `processCrawlJob`, replace:

```ts
const { newCount, updatedCount, filesProcessed } = await saveProjects(projectsToProcess);
```

With:

```ts
const { newCount, updatedCount, filesProcessed, attachmentsForMetrics } = await saveProjects(projectsToProcess);
const metrics = buildCrawlJobMetrics({
  listItemsFound: crawledProjects.length,
  detailPagesFetched: projectsToProcess.length,
  projectsCreated: newCount,
  projectsUpdated: updatedCount,
  attachments: attachmentsForMetrics,
});
```

Then add `metrics` to the completed job update:

```ts
        metrics: metrics as Prisma.InputJsonValue,
```

And include it in returned stats:

```ts
const stats = {
  projectsFound: crawledProjects.length,
  projectsNew: newCount,
  projectsUpdated: updatedCount,
  filesProcessed,
  metrics,
};
```

- [ ] **Step 11: Run focused tests and typecheck**

Run:

```bash
corepack pnpm test -- __tests__/lib/crawler/crawl-metrics.test.ts __tests__/lib/projects/attachment-intelligence.test.ts
npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 12: Commit checkpoint if authorized**

```bash
git add src/lib/crawler/crawl-metrics.ts __tests__/lib/crawler/crawl-metrics.test.ts src/lib/crawler/worker.ts
git commit -m "$(cat <<'EOF'
WI-chore 크롤링 진단 지표 저장

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Public Detail Selection Display

**Files:**
- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `__tests__/lib/projects/public-dto.test.ts`

- [ ] **Step 1: Confirm public DTO carries score table data**

If Task 1 tests pass, this is already covered by `__tests__/lib/projects/public-dto.test.ts`. Do not add a brittle server component test unless there is already an easy mock pattern for `getPublicProject`.

- [ ] **Step 2: Add local score table component in `page.tsx`**

In `src/app/projects/[id]/page.tsx`, add after `ListSection`:

```tsx
function ScoreTableSection({ scoreTable }: { scoreTable: ProjectAnalysisPublicDto["selection"]["scoreTable"] | undefined }) {
  if (!hasItems(scoreTable)) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">배점표</h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">평가항목</th>
              <th className="px-3 py-2 text-left font-medium">배점</th>
              <th className="px-3 py-2 text-left font-medium">근거</th>
            </tr>
          </thead>
          <tbody>
            {scoreTable.map((row) => (
              <tr key={`${row.evidenceLabel}-${row.item}`} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{row.item}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.points ? `${row.points}점` : "확인 필요"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render stronger selection data in support strategy card**

Inside the `지원 전략` card, add score table and priority signals before scoring hints:

```tsx
              <ListSection title="평가 기준" items={project.analysis.selection.criteria} />
              <ScoreTableSection scoreTable={project.analysis.selection.scoreTable} />
              <ListSection title="우선 반영 신호" items={project.analysis.selection.prioritySignals} />
              <ListSection title="심사 힌트" items={project.analysis.selection.scoringHints} />
```

Also update the condition that decides whether the card has data:

```tsx
            hasItems(project.analysis.selection.scoreTable) ||
            hasItems(project.analysis.selection.prioritySignals) ||
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Manual browser verification**

Start dev server:

```bash
corepack pnpm dev
```

Open an existing project detail page that already has `project.analysis`. Verify:

- The page still loads.
- Existing `평가 기준` and `심사 힌트` render as before.
- If a test project has `selection.scoreTable`, `배점표` renders with headers `평가항목`, `배점`, `근거`.
- Empty score table does not render an empty table.

If no local DB record has score table data yet, note this explicitly in the final verification story and rely on schema/serializer tests until Task 7 sample reanalysis creates one.

- [ ] **Step 6: Commit checkpoint if authorized**

```bash
git add src/app/projects/[id]/page.tsx __tests__/lib/projects/public-dto.test.ts
git commit -m "$(cat <<'EOF'
WI-chore 선정 기준 배점표 표시

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Verification and Safe Backfill Hooks

**Files:**
- Modify: `tasks/todo.md`
- No production data mutation unless explicitly approved.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
corepack pnpm test -- __tests__/lib/projects/analysis-schema.test.ts __tests__/lib/projects/public-dto.test.ts __tests__/lib/projects/attachment-intelligence.test.ts __tests__/lib/crawler/crawl-metrics.test.ts __tests__/lib/project-analyzer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full Jest suite**

Run:

```bash
corepack pnpm test
```

Expected: PASS. If unrelated existing tests fail, capture the exact failing test names and error messages before deciding whether to fix or defer.

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
corepack pnpm build
```

Expected: PASS. Existing warnings are acceptable only if they are documented as pre-existing and not caused by this change.

- [ ] **Step 5: Prepare DB rollout command, but do not run without approval**

When the user approves DB mutation, run:

```bash
set -a && source .env.local && set +a && npx prisma db push
```

Expected: Prisma applies additive nullable fields only. If Prisma proposes destructive changes, stop immediately and report the diff.

- [ ] **Step 6: Run one bounded analysis sample only after DB schema is applied**

Use an existing project known to have parsed attachments. The command should be chosen by inspecting existing scripts at implementation time. If no safe script exists, create a temporary local command only after user approval and delete it before finishing.

Success criteria for the sample:

- `SupportProject.projectAnalysis.selection.criteria` is present.
- `quality.hasParsedAttachment` is true for projects with parsed docs.
- `quality.hasScoreTable` is true only if a score table was extracted.
- Existing public project detail page still renders.

- [ ] **Step 7: Update `tasks/todo.md` Results section**

Append a concise result block to `tasks/todo.md`:

```md
---

# Support Search Analysis Improvement

Results:
- Added attachment document intelligence metadata and deterministic classification.
- Added group-aware analysis input for confirmed duplicate groups.
- Strengthened selection criteria and optional score table output.
- Added crawl diagnostics metrics for current source coverage.
- Verification: <commands run and outcomes>.
- DB rollout: <not run | ran db push with approval>.
```

Replace the angle-bracket values with actual outcomes before saving.

- [ ] **Step 8: Commit checkpoint if authorized**

```bash
git add tasks/todo.md
git commit -m "$(cat <<'EOF'
WI-chore 지원사업 분석 개선 검증 기록

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final Review Gate

**Files:**
- No planned code changes unless review finds issues.

- [ ] **Step 1: Check working tree**

Run:

```bash
git status --short
```

Expected: Only intentional files are modified.

- [ ] **Step 2: Review diff for scope creep**

Run:

```bash
git diff --stat
git diff -- prisma/schema.prisma src/lib/projects/analysis-schema.ts src/lib/projects/public-dto.ts src/lib/projects/attachment-intelligence.ts src/lib/crawler/project-analyzer.ts src/lib/crawler/worker.ts src/lib/crawler/crawl-metrics.ts src/app/projects/[id]/page.tsx
```

Expected: Changes match this plan. No new crawler source, no auth changes, no unrelated UI redesign, no manual SQL.

- [ ] **Step 3: Request code review**

Use the `superpowers:requesting-code-review` skill with this context:

```text
Implemented support-project document intelligence improvements from docs/superpowers/specs/2026-05-02-support-search-analysis-design.md and docs/superpowers/plans/2026-05-02-support-search-analysis.md.

Review focus:
- Prisma schema compatibility and nullable additive fields.
- Attachment classification correctness and test coverage.
- Group-aware analysis behavior, especially pending_review fallback.
- Public DTO compatibility.
- Crawler metrics correctness.
- Project detail rendering without empty sections.
```

Expected: No Critical or Important issues before proceeding.

- [ ] **Step 4: Fix Critical/Important review findings**

If review finds Critical or Important issues, fix them before reporting completion. Re-run the smallest relevant focused test plus `npx tsc --noEmit`.

- [ ] **Step 5: Final verification story**

Prepare a final response including:

```text
Changed:
- <short list of files/behaviors>

Verified:
- <test command>: PASS
- <typecheck/build command>: PASS
- <manual browser check or explicit not-run reason>

Not run:
- <DB push/sample reanalysis if not approved>
```

Do not claim DB rollout, production reprocessing, or browser verification if they were not actually run.

---

## Self-Review

- Spec coverage:
  - Current source diagnostics: Task 4 and Task 6.
  - Attachment document type/quality metadata: Task 1, Task 2, Task 4.
  - Selection criteria and score table strengthening: Task 1, Task 2, Task 3, Task 5.
  - Duplicate group-based analysis: Task 3.
  - Pending review fallback: Task 3 helper behavior.
  - Public compatibility: Task 1 and Task 5.
  - Verification and rollout safeguards: Task 6 and Task 7.

- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified implementation placeholders are intentionally present.
  - The only conditional instruction is the DB-mutating rollout, which requires explicit user approval by policy.

- Type consistency:
  - `attachmentDocType`, `documentRole`, `parseQuality`, `extractedMetadata`, `scoreTable`, `prioritySignals`, and `hasScoreTable` are used consistently across tasks.
  - Public DTO exposes `analysis.quality.hasScoreTable`, not `trust.hasScoreTable`.
