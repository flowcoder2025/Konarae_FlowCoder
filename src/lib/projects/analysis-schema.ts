import { z } from "zod";

// ─── Primitive enums ──────────────────────────────────────────────────────────

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const PeriodStatusSchema = z.enum([
  "upcoming",
  "open",
  "closingSoon",
  "closed",
  "unknown",
]);
export type PeriodStatus = z.infer<typeof PeriodStatusSchema>;

export const EvidenceSourceSchema = z.enum(["page", "attachment", "ai"]);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

// ─── Score table item (selection scoring breakdown) ──────────────────────────

export const ScoreTableItemSchema = z.object({
  item: z.string(),
  points: z.number().optional(),
  description: z.string(),
  evidenceLabel: z.string(),
});
export type ScoreTableItem = z.infer<typeof ScoreTableItemSchema>;

// ─── Condition item (eligibility rows) ───────────────────────────────────────

export const ConditionItemSchema = z.object({
  label: z.string(),
  description: z.string(),
  confidence: ConfidenceSchema,
  evidenceIds: z.array(z.string()),
  notes: z.array(z.string()),
});
export type ConditionItem = z.infer<typeof ConditionItemSchema>;

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const SummarySchema = z.object({
  plain: z.string(),
  keyPoints: z.array(z.string()),
});

const BenefitsSchema = z.object({
  cash: z.string().optional(),
  subsidyRate: z.string().optional(),
  maxAmount: z.number().nullable().optional(),
  nonCashBenefits: z.array(z.string()),
  notes: z.array(z.string()),
});

const EligibilitySchema = z.object({
  required: z.array(ConditionItemSchema),
  preferred: z.array(ConditionItemSchema),
  excluded: z.array(ConditionItemSchema),
  ambiguous: z.array(ConditionItemSchema),
});

const ConditionItemPublicSchema = ConditionItemSchema.omit({ evidenceIds: true });

const EligibilityPublicSchema = z.object({
  required: z.array(ConditionItemPublicSchema),
  preferred: z.array(ConditionItemPublicSchema),
  excluded: z.array(ConditionItemPublicSchema),
  ambiguous: z.array(ConditionItemPublicSchema),
});

const PeriodSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isOpenEnded: z.boolean(),
  status: PeriodStatusSchema,
});

const ApplicationSchema = z.object({
  method: z.array(z.string()),
  channels: z.array(z.string()),
  requiredDocuments: z.array(z.string()),
  contact: z.array(z.string()),
});

const SelectionSchema = z.object({
  criteria: z.array(z.string()),
  scoringHints: z.array(z.string()),
  likelyImportantFactors: z.array(z.string()),
  scoreTable: z.array(ScoreTableItemSchema).optional(),
  prioritySignals: z.array(z.string()).optional(),
});

const AiTipsSchema = z.object({
  whoShouldApply: z.array(z.string()),
  preparationPriority: z.array(z.string()),
  writingStrategy: z.array(z.string()),
  commonRisks: z.array(z.string()),
  checklist: z.array(z.string()),
});

const EvidenceItemSchema = z.object({
  id: z.string(),
  source: EvidenceSourceSchema,
  label: z.string(),
  text: z.string(),
  attachmentName: z.string().optional(),
});

const QualitySchema = z.object({
  confidence: ConfidenceSchema,
  hasParsedAttachment: z.boolean(),
  hasSelectionCriteria: z.boolean(),
  hasScoreTable: z.boolean().default(false),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
});

// ─── Full internal schema ─────────────────────────────────────────────────────

export const ProjectAnalysisSchema = z.object({
  summary: SummarySchema,
  benefits: BenefitsSchema,
  eligibility: EligibilitySchema,
  period: PeriodSchema,
  application: ApplicationSchema,
  selection: SelectionSchema,
  aiTips: AiTipsSchema,
  evidence: z.array(EvidenceItemSchema),
  quality: QualitySchema,
});

export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;

// ─── Public DTO schema (strips internal fields) ───────────────────────────────

const QualityPublicSchema = z.object({
  confidence: ConfidenceSchema,
  hasParsedAttachment: z.boolean(),
  hasSelectionCriteria: z.boolean(),
  hasScoreTable: z.boolean().default(false),
});

export const ProjectAnalysisPublicSchema = z.object({
  summary: SummarySchema,
  benefits: BenefitsSchema,
  eligibility: EligibilityPublicSchema,
  period: PeriodSchema,
  application: ApplicationSchema,
  selection: SelectionSchema,
  aiTips: AiTipsSchema,
  quality: QualityPublicSchema,
  // evidence is intentionally omitted from public DTO
});

export type ProjectAnalysisPublicDto = z.infer<typeof ProjectAnalysisPublicSchema>;
