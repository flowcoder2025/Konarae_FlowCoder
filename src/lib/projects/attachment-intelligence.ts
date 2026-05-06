import type { ScoreTableItem } from "./analysis-schema";

export type AttachmentDocType =
  | "announcement"
  | "application_form"
  | "evaluation_criteria"
  | "required_documents"
  | "guideline"
  | "other";

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
  };
}

export interface SelectionInsights {
  criteria: string[];
  scoringHints: string[];
  likelyImportantFactors: string[];
  scoreTable?: ScoreTableItem[];
  prioritySignals?: string[];
  writingStrategy: string[];
  preparationPriority: string[];
  commonRisks: string[];
}

// ─── Filename keyword rules (checked in priority order) ──────────────────────

const FILENAME_RULES: Array<{
  patterns: RegExp[];
  docType: AttachmentDocType;
}> = [
  {
    patterns: [/평가표|선정기준|평가기준|심사기준|평가항목|채점/],
    docType: "evaluation_criteria",
  },
  {
    patterns: [/신청서|신청양식|사업계획서|제안서|신청_양식|신청양식/],
    docType: "application_form",
  },
  {
    patterns: [/제출서류|체크리스트|구비서류|첨부서류|서류목록/],
    docType: "required_documents",
  },
  {
    patterns: [/공고문|공고|모집공고|사업공고/],
    docType: "announcement",
  },
  {
    patterns: [/안내서|가이드|지침|매뉴얼|안내|guide/i],
    docType: "guideline",
  },
];

function classifyByFilename(fileName: string): AttachmentDocType {
  const normalized = fileName.toLowerCase();
  for (const rule of FILENAME_RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      return rule.docType;
    }
  }
  return "other";
}

// ─── Content-based section detection ─────────────────────────────────────────

function detectSections(text: string): string[] {
  const sections: string[] = [];
  if (/선정기준|채점|배점|\d+\s*점/.test(text)) sections.push("evaluation");
  if (/신청서|사업계획서|신청양식/.test(text)) sections.push("application");
  if (/제출서류|구비서류|체크리스트/.test(text)) sections.push("required_documents");
  return sections;
}

function docTypeFromSections(sections: string[]): AttachmentDocType | null {
  if (sections.includes("evaluation")) return "evaluation_criteria";
  if (sections.includes("application")) return "application_form";
  if (sections.includes("required_documents")) return "required_documents";
  return null;
}

// ─── Parse quality helpers ────────────────────────────────────────────────────

const PUNCTUATION_WHITESPACE = /[\s\p{P}\p{S}]/gu;

function normalizedLength(text: string): number {
  return text.replace(PUNCTUATION_WHITESPACE, "").length;
}

function mojibakeRatio(text: string): number {
  const replacements = (text.match(/�/g) ?? []).length;
  return text.length === 0 ? 0 : replacements / text.length;
}

export function getParseQuality(
  parsedContent?: string | null,
  parseError?: string | null
): ParseQuality {
  if (parseError) return "failed";
  if (!parsedContent) return "failed";

  const trimmed = parsedContent.trim();
  if (trimmed.length === 0) return "low";

  if (mojibakeRatio(trimmed) > 0.3) return "low";

  const normLen = normalizedLength(trimmed);
  if (normLen < 100) return "low";
  if (normLen < 140) return "medium";
  return "high";
}

// ─── Document role ────────────────────────────────────────────────────────────

function deriveDocumentRole(
  docType: AttachmentDocType,
  quality: ParseQuality
): DocumentRole {
  if (quality === "low" || quality === "failed") return "low_signal";
  const primaryTypes: AttachmentDocType[] = [
    "evaluation_criteria",
    "application_form",
    "required_documents",
    "announcement",
  ];
  if (primaryTypes.includes(docType)) return "primary";
  return "supporting";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function classifyAttachmentDocument(
  input: AttachmentDocumentInput
): ClassifiedAttachmentDocument {
  let attachmentDocType = classifyByFilename(input.fileName);

  let detectedSections: string[] | undefined;
  if (input.isParsed && input.parsedContent) {
    detectedSections = detectSections(input.parsedContent);
    // Content classification only wins when filename gave no signal ("other").
    // If filename already resolved to a specific type, preserve it and record
    // content sections only as metadata.
    if (attachmentDocType === "other") {
      const contentType = docTypeFromSections(detectedSections);
      if (contentType !== null) {
        attachmentDocType = contentType;
      }
    }
  }

  const parseQuality = getParseQuality(input.parsedContent, input.parseError);
  const documentRole = deriveDocumentRole(attachmentDocType, parseQuality);

  return {
    ...input,
    attachmentDocType,
    documentRole,
    parseQuality,
    extractedMetadata: detectedSections?.length
      ? { detectedSections }
      : undefined,
  };
}

export function dedupeAttachmentDocuments(
  documents: AttachmentDocumentInput[]
): AttachmentDocumentInput[] {
  const seen = new Set<string>();
  const result: AttachmentDocumentInput[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const key =
      doc.sourceUrl && doc.sourceUrl.trim().length > 0
        ? `url:${doc.sourceUrl}`
        : doc.storagePath && doc.storagePath.trim().length > 0
        ? `path:${doc.storagePath}`
        : `index:${i}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(doc);
    }
  }

  return result;
}

const DOC_TYPE_PRIORITY: Record<AttachmentDocType, number> = {
  evaluation_criteria: 0,
  application_form: 1,
  announcement: 2,
  required_documents: 3,
  guideline: 4,
  other: 5,
};

function ensureClassified(
  documents: AttachmentDocumentInput[]
): ClassifiedAttachmentDocument[] {
  return documents.map((d) =>
    "attachmentDocType" in d
      ? (d as ClassifiedAttachmentDocument)
      : classifyAttachmentDocument(d)
  );
}

export function buildTypedAttachmentContent(
  documents: AttachmentDocumentInput[]
): string | null {
  const deduped = dedupeAttachmentDocuments(documents);
  const classified = ensureClassified(deduped);

  const sorted = classified.sort(
    (a, b) =>
      DOC_TYPE_PRIORITY[a.attachmentDocType] -
      DOC_TYPE_PRIORITY[b.attachmentDocType]
  );

  const usable = sorted.filter(
    (d) =>
      d.parsedContent &&
      d.parsedContent.trim().length > 0 &&
      d.parseQuality !== "failed"
  );

  if (usable.length === 0) return null;

  const parts = usable.map(
    (d) =>
      `[${d.attachmentDocType}] ${d.fileName} (quality:${d.parseQuality}, role:${d.documentRole})\n${d.parsedContent}`
  );

  return parts.join("\n\n---\n\n");
}

// ─── Score table extraction ───────────────────────────────────────────────────

const SCORE_ROW_PATTERN = /^(.+?)\s+(\d+)\s*점/;
const SUMMARY_ROW_PATTERN = /^(합계|총점|합산|총합)\s*/;

function extractScoreTable(text: string, fileName: string): ScoreTableItem[] {
  const rows: ScoreTableItem[] = [];
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    // Skip total/summary rows
    if (SUMMARY_ROW_PATTERN.test(trimmed)) continue;
    const match = SCORE_ROW_PATTERN.exec(trimmed);
    if (!match) continue;
    const item = match[1].trim();
    const points = parseInt(match[2], 10);
    if (item.length === 0 || isNaN(points)) continue;
    rows.push({ item, points, description: `${item} ${points}점`, evidenceLabel: fileName });
  }
  return rows;
}

export function extractSelectionInsights(
  documents: AttachmentDocumentInput[]
): SelectionInsights {
  const classified = ensureClassified(documents);

  const evalDocs = classified.filter(
    (d) =>
      d.attachmentDocType === "evaluation_criteria" &&
      d.isParsed &&
      d.parsedContent &&
      d.parseQuality !== "low" &&
      d.parseQuality !== "failed"
  );

  let scoreTable: ScoreTableItem[] = [];
  const criteria: string[] = [];
  const likelyImportantFactors: string[] = [];

  for (const doc of evalDocs) {
    const rows = extractScoreTable(doc.parsedContent!, doc.fileName);
    scoreTable = scoreTable.concat(rows);
    for (const row of rows) {
      criteria.push(row.item);
      if (row.points && row.points >= 30) {
        likelyImportantFactors.push(row.item);
      }
    }
  }

  const scoringHints: string[] = [];
  if (scoreTable.length > 0) {
    const totalPoints = scoreTable.reduce((sum, r) => sum + (r.points ?? 0), 0);
    scoringHints.push(
      `배점이 확인된 ${scoreTable.length}개 항목 기준으로 작성하세요 (합계 ${totalPoints}점).`
    );
    const topItems = [...scoreTable]
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
      .slice(0, 2)
      .map((r) => `${r.item}(${r.points}점)`);
    if (topItems.length > 0) {
      scoringHints.push(`배점 상위 항목: ${topItems.join(", ")}에 집중하세요.`);
    }
  }

  const prioritySignals = likelyImportantFactors.length
    ? [`높은 배점 항목: ${likelyImportantFactors.join(", ")}`]
    : undefined;

  return {
    criteria,
    scoringHints,
    likelyImportantFactors,
    scoreTable: scoreTable.length > 0 ? scoreTable : undefined,
    prioritySignals,
    writingStrategy:
      scoreTable.length > 0
        ? ["배점 확인된 항목별로 구체적 수치와 근거를 제시하세요."]
        : ["공고 내 선정 기준을 중심으로 작성하세요."],
    preparationPriority:
      likelyImportantFactors.length > 0
        ? likelyImportantFactors.map((f) => `${f} 관련 증빙 준비`)
        : ["공고 원문의 필수 서류 목록 확인"],
    commonRisks: ["마감일 임박 제출로 인한 검토 시간 부족", "서류 누락"],
  };
}
