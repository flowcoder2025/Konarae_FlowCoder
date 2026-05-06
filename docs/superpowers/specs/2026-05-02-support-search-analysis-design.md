# Support Search and Document Analysis Improvement Design

## Goal

Improve FlowMate's public support-project board so it can interpret announcements more accurately, surface stronger selection criteria, and reduce missed or under-analyzed projects from existing crawler sources.

This design focuses on the current source set first. It does not add new large portals in the first implementation batch. The main improvement is to classify and analyze parsed attachments by document type instead of merging every parsed document into one undifferentiated prompt input.

## Acceptance Criteria

- Current crawler sources expose source-level diagnostics for discovery, detail fetch, attachment discovery, parsing, and analysis readiness.
- Parsed attachments are classified into document types such as announcement, application form, evaluation criteria, required documents, guideline, and other.
- Project analysis prioritizes evaluation criteria and application-form documents when generating selection criteria and writing strategy.
- Duplicate projects in the same `ProjectGroup` are analyzed using attachments and complementary data from all grouped source records, while public output continues to show only the canonical project.
- Existing announcement-only projects continue to analyze and render without regressions.
- Partial failures in attachment parsing or AI structured extraction do not block the whole project analysis.

## Existing Baseline

The current flow is:

```text
Crawler
→ attachment download/upload
→ text parser
→ ProjectAttachment.parsedContent
→ analyzeProject()
→ SupportProject.descriptionMarkdown / projectAnalysis
→ public API and project detail page
```

Relevant existing files:

- `src/lib/crawler/worker.ts`: crawler orchestration and deduplication trigger.
- `src/lib/supabase-storage.ts`: parse target detection and parsing priority.
- `src/lib/crawler/project-analyzer.ts`: attachment content integration and AI analysis.
- `src/lib/projects/analysis-schema.ts`: internal and public analysis schemas.
- `src/lib/deduplication.ts`: `ProjectGroup` creation, canonical selection, and duplicate grouping.
- `prisma/schema.prisma`: `SupportProject`, `ProjectAttachment`, and `ProjectGroup` models.

## Architecture

Add a document intelligence layer between parsed attachments and project analysis:

```text
Parsed attachments
→ classifyProjectAttachments
→ collectGroupAnalysisDocuments
→ buildTypedDocumentAnalysisInput
→ analyzeSelectionCriteria
→ buildProjectAnalysis
```

The crawler and parser remain responsible for collecting and extracting text. The new layer determines what each parsed attachment means and how strongly it should influence the final analysis.

## Data Model

Extend `ProjectAttachment` with document intelligence metadata:

```prisma
model ProjectAttachment {
  // existing fields...

  attachmentDocType String? // announcement | application_form | evaluation_criteria | required_documents | guideline | other
  documentRole      String? // primary | supporting | low_signal
  parseQuality      String? // high | medium | low | failed
  extractedMetadata Json?   // headings, detectedSections, scoreItems, requiredDocs, warnings
}
```

Field responsibilities:

- `attachmentDocType`: the dominant document category. The name intentionally avoids confusion with the existing `CompanyDocument.documentType` field.
- `documentRole`: whether the document should drive analysis or only support it.
- `parseQuality`: whether the parsed text is trustworthy enough for AI analysis.
- `extractedMetadata`: lightweight structured signals extracted before final project analysis. `extractedMetadata.scoreItems` is internal evidence and maps to public `selection.scoreTable` rows only after schema validation.

No new table is required for the first batch. Group-level analysis can query existing `SupportProject` and `ProjectAttachment` rows by `groupId`.

Crawler diagnostics should be stored on `CrawlJob` as a single JSON field rather than many nullable columns:

```prisma
model CrawlJob {
  // existing fields...
  metrics Json? // listItemsFound, detailPagesFetched, attachmentsParsed, parseFailures, analysisReadyProjects
}
```

A JSON field keeps the first batch flexible while still allowing structured logs and admin diagnostics. If these metrics become user-facing filters or long-term analytics, they can be promoted to indexed columns later.

## Document Classification

Classification should be deterministic first, AI-assisted only if later needed.

### Filename Signals

- `announcement`: `공고`, `모집`, `안내`
- `application_form`: `신청서`, `지원서`, `사업계획서`, `신청양식`, `양식`
- `evaluation_criteria`: `평가`, `심사`, `선정기준`, `평가기준`, `배점`, `평가표`
- `required_documents`: `제출서류`, `구비서류`, `체크리스트`, `증빙`
- `guideline`: `운영지침`, `사업안내`, `매뉴얼`, `가이드`
- `other`: parseable files without strong signals

### Parsed Text Signals

Parsed text can correct or enrich filename classification:

- If a file named as an application form contains a score table or scoring headings, preserve `attachmentDocType=application_form` and record evaluation sections in `extractedMetadata.detectedSections`.
- If normalized parsed text, after whitespace and punctuation stripping, has fewer than 100 Korean/alphanumeric characters, or more than 30% replacement/mojibake-like characters, set `parseQuality=low`.
- If parsing failed, set `parseQuality=failed` and keep the existing `parseError`.

## Group-Based Duplicate Analysis

The existing duplicate system groups equivalent projects through `ProjectGroup` and exposes only canonical records publicly. This should become the analysis boundary too.

For a project with `groupId`:

```text
ProjectGroup
→ canonical SupportProject
→ all SupportProject records in group
→ all parsed ProjectAttachment records from the group
→ deduplicate attachments by sourceUrl, then storagePath fallback
→ classify documents
→ build canonical projectAnalysis using all usable group documents
```

Example:

```text
기업마당 A 공고: has summary and detail page
콘텐츠진흥원 A 공고: has announcement HWP, application form, evaluation table
```

Public board still shows one canonical A project, but the analysis can use all grouped documents. This prevents losing evaluation criteria that only exist on one source.

Group attachment deduplication must use `sourceUrl` as the primary key and `storagePath` as the fallback key. `fileName` is only a diagnostic label because generic names such as `신청서.hwp` can appear across distinct programs.

Groups with `reviewStatus=pending_review` must be excluded from group-aware analysis until confirmed. For those groups, analysis falls back to the canonical project's own `ProjectAttachment` records only to avoid cross-contaminating similar but distinct programs.

Canonical selection can remain as implemented in `src/lib/deduplication.ts` for the first batch. The design only changes the analysis input boundary from single project attachments to grouped project attachments.

## Analysis Behavior

Current analysis combines all parsed attachment content. Replace that with typed document input.

Priority order:

1. `evaluation_criteria`
   - scoring items
   - point allocations
   - selection method
   - preference or bonus conditions
   - disqualification risks

2. `application_form`
   - application questions
   - business plan sections
   - required numeric fields
   - evidence requested by form fields

3. `announcement`
   - eligibility
   - benefit amount
   - application period
   - application channel
   - basic requirements

4. `required_documents` and `guideline`
   - required submission checklist
   - operating constraints
   - settlement or agreement requirements

The final `ProjectAnalysis` should strengthen existing `selection` and `aiTips` fields rather than redesign the entire public schema.

Recommended schema additions:

```ts
selection: {
  criteria: string[];
  scoringHints: string[];
  likelyImportantFactors: string[];
  scoreTable?: Array<{
    item: string;
    points?: number;
    description: string;
    evidenceLabel: string;
  }>;
  prioritySignals?: string[];
}

quality: {
  // existing fields...
  hasScoreTable: boolean;
}
```

`aiTips.writingStrategy`, `aiTips.preparationPriority`, `aiTips.commonRisks`, and `aiTips.checklist` should prefer evidence from evaluation criteria and application forms when those documents are available.

## Current Source Coverage Diagnostics

Before adding new sources, instrument current sources so missed projects can be diagnosed.

Capture these metrics per `CrawlJob` or structured crawler log:

```text
sourceId
crawlStartedAt
listItemsFound
detailPagesFetched
projectsCreated
projectsUpdated
attachmentLinksFound
attachmentsDownloaded
attachmentsParsed
parseFailures
analysisReadyProjects
```

Use the metrics to identify whether a source is failing at listing, detail fetch, attachment discovery, download, parsing, or analysis preparation.

Examples:

```text
Source A: 120 list items → 118 detail pages → 35 attachments → 31 parsed
Source B: 200 list items → 40 detail pages → 0 attachments
```

The second source likely needs pagination, selector, or detail URL normalization fixes before new source expansion.

## Public UI and API Behavior

The public API should remain backward compatible.

Initial UI changes should be limited to richer content in existing analysis areas:

- More concrete `selection.criteria` and `selection.scoringHints`.
- Optional score table display when present.
- More specific writing strategy based on application form fields.
- Quality state that distinguishes announcement-only analysis from application/evaluation-document-backed analysis.

New filters such as `hasEvaluationCriteria` or `hasApplicationFormAnalysis` should be deferred until the analysis metadata is populated reliably. The public DTO may expose `quality.hasScoreTable` as a non-filtering display hint so clients can tell whether a concrete score table is available without adding query behavior yet.

## Failure Handling

Use partial-success behavior throughout the pipeline:

- Attachment download failure: keep the project and record attachment error when possible.
- Classification failure: set `attachmentDocType=other` and continue with existing analysis behavior.
- Low-quality parse: include only as supporting context or omit from high-confidence selection extraction.
- Some attachments fail: analyze with successfully parsed documents.
- AI structured extraction fails: preserve markdown/basic analysis and omit enhanced selection fields.
- Group document collection fails: fall back to the current single-project attachment set.

## Verification Plan

### Unit Tests

- Filename-based document type classification.
- Parsed-text quality detection.
- Mixed signal handling, such as application form containing evaluation sections.
- Selection schema validation for optional score table fields.
- Group attachment deduplication by URL/path/name hash.

### Integration Tests

- Announcement-only project still produces valid `projectAnalysis`.
- Announcement plus application form strengthens writing strategy.
- Announcement plus evaluation criteria strengthens `selection.criteria`, `selection.scoringHints`, and optional `scoreTable`.
- Duplicate group analysis uses attachments from non-canonical projects.
- Parse failures do not fail the entire analysis batch.

### Operational Checks

- Crawl diagnostics are emitted for each source run.
- Public `/api/v1/projects` still returns only canonical or ungrouped projects.
- Project detail page renders empty, partial, and full selection data naturally.
- Existing analyzed projects without new attachment metadata remain readable.

## Implementation Boundaries

Included in first implementation batch:

- Current source diagnostics.
- Attachment document type and quality metadata.
- Deterministic document classification.
- Group-aware document collection for analysis.
- Selection criteria extraction improvements.
- Minimal public detail display improvements for richer selection data.
- Backward compatibility for existing analysis records.

Excluded from first implementation batch:

- Adding major new crawler sources.
- Full admin workflow redesign for duplicate review.
- Semantic/vector duplicate detection.
- User-facing filters for document-backed analysis.
- Reprocessing every historical project in one uncontrolled batch.

## Rollout Strategy

1. Add schema fields and deterministic classification with tests.
2. Add crawler diagnostics and use them to prioritize current source-specific fixes.
3. Populate metadata for newly parsed attachments.
4. Run analysis on a small sample of projects with known application/evaluation documents.
5. Enable group-aware analysis input.
6. Improve project detail display for richer selection data.
7. Reprocess historical projects in bounded batches after sample verification, with a default maximum of 20 projects per run and source-scoped batches when possible.

## Risks and Mitigations

- Risk: AI extraction returns malformed optional fields.
  - Mitigation: validate and normalize AI output before writing `projectAnalysis`.

- Risk: duplicate grouping incorrectly combines similar but distinct programs.
  - Mitigation: keep current threshold behavior and use group-aware analysis only for existing groups; pending-review groups can be excluded if needed.

- Risk: low-quality parsed text pollutes selection criteria.
  - Mitigation: classify parse quality and deprioritize low-quality documents.

- Risk: public DTO changes break existing clients.
  - Mitigation: add optional fields only and keep existing fields stable.

- Risk: historical reprocessing mutates too much at once.
  - Mitigation: reprocess in small, source-scoped batches with read-only evidence checks before mutation.
