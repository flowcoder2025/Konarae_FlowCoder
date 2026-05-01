import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProjectShareActions } from "@/components/projects/project-share-actions";
import { ProjectAnalysisConfidenceWarning } from "@/components/projects/project-analysis-confidence-warning";
import { ProjectDescriptionRenderer } from "@/components/projects/project-description-renderer";
import type { ProjectAnalysisPublicDto } from "@/lib/projects/analysis-schema";
import { getPublicProject } from "@/lib/projects/public-service";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mate.flow-coder.com";

export const dynamic = "force-dynamic";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

type ConditionItems = ProjectAnalysisPublicDto["eligibility"]["required"];

function hasItems<T>(items: readonly T[] | undefined): items is readonly T[] {
  return Array.isArray(items) && items.length > 0;
}

function ListSection({ title, items }: { title: string; items: readonly string[] | undefined }) {
  if (!hasItems(items)) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ConditionSection({ title, items }: { title: string; items: ConditionItems | undefined }) {
  if (!hasItems(items)) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${title}-${item.label}`} className="rounded-lg border border-border p-3">
            <p className="font-medium">{item.label}</p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getPublicProject(id);
  if (!project) return { title: "지원사업을 찾을 수 없습니다" };

  return {
    title: `${project.title} | FlowMate`,
    description: project.summary,
    openGraph: {
      title: project.title,
      description: project.summary,
      url: `${SITE_URL}/projects/${project.id}`,
      type: "article",
      images: ["/opengraph-image.png"],
    },
  };
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const project = await getPublicProject(id);
  if (!project) notFound();

  const pageUrl = `${SITE_URL}/projects/${project.id}`;

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <section className="mb-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge>{project.category}</Badge>
          <Badge variant="outline">{project.region}</Badge>
          <Badge variant="outline">{project.trust.analysisStatus === "analyzed" ? "AI 분석 완료" : "기본 정보"}</Badge>
        </div>
        <h1 className="mb-3 text-4xl font-bold tracking-tight">{project.title}</h1>
        <p className="mb-5 text-muted-foreground">{project.organization}</p>
        <ProjectShareActions title={project.title} description={project.summary} url={pageUrl} />
      </section>

      <div className="grid gap-6">
        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold">핵심 정보</h2>
          <dl className="grid gap-4 md:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">지원대상</dt><dd className="font-medium">{project.target}</dd></div>
            <div><dt className="text-sm text-muted-foreground">지원금액</dt><dd className="font-medium">{project.amount.summary ?? "확인 필요"}</dd></div>
            <div><dt className="text-sm text-muted-foreground">신청 마감</dt><dd className="font-medium">{project.isPermanent ? "상시모집" : project.deadline ?? "기한 미정"}</dd></div>
            <div><dt className="text-sm text-muted-foreground">신청방법</dt><dd className="font-medium">{project.applicationProcess ?? "원문 확인"}</dd></div>
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold">AI 요약</h2>
          <ProjectAnalysisConfidenceWarning confidence={project.trust.confidence} />
          <div className="space-y-4">
            <p className="text-muted-foreground">{project.analysis?.summary.plain ?? project.summary}</p>
            <ListSection title="핵심 포인트" items={project.analysis?.summary.keyPoints} />
            <ListSection
              title="지원 혜택"
              items={[
                project.analysis?.benefits.cash,
                ...(project.analysis?.benefits.nonCashBenefits ?? []),
                ...(project.analysis?.benefits.notes ?? []),
              ].filter((item): item is string => Boolean(item))}
            />
            <ListSection title="평가 포인트" items={project.analysis?.selection.likelyImportantFactors} />
          </div>
        </Card>

        {project.analysisMarkdown ? (
          <Card className="p-6">
            <h2 className="mb-4 text-xl font-semibold">공고문 분석 내용</h2>
            <ProjectDescriptionRenderer
              markdownContent={project.analysisMarkdown}
              content={project.summary}
            />
          </Card>
        ) : null}

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold">지원 조건</h2>
          {project.analysis && (
            hasItems(project.analysis.eligibility.required) ||
            hasItems(project.analysis.eligibility.preferred) ||
            hasItems(project.analysis.eligibility.excluded) ||
            hasItems(project.analysis.eligibility.ambiguous)
          ) ? (
            <div className="space-y-5">
              <ConditionSection title="필수 조건" items={project.analysis.eligibility.required} />
              <ConditionSection title="우대 조건" items={project.analysis.eligibility.preferred} />
              <ConditionSection title="제외 조건" items={project.analysis.eligibility.excluded} />
              <ConditionSection title="확인 필요" items={project.analysis.eligibility.ambiguous} />
            </div>
          ) : (
            <p className="text-muted-foreground">{project.eligibility ?? "조건 정보는 원문에서 확인하세요."}</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold">준비 팁</h2>
          {project.analysis && (
            hasItems(project.analysis.aiTips.whoShouldApply) ||
            hasItems(project.analysis.aiTips.preparationPriority) ||
            hasItems(project.analysis.aiTips.writingStrategy) ||
            hasItems(project.analysis.aiTips.commonRisks) ||
            hasItems(project.analysis.aiTips.checklist) ||
            hasItems(project.analysis.application.requiredDocuments) ||
            hasItems(project.analysis.selection.criteria) ||
            hasItems(project.analysis.selection.scoringHints)
          ) ? (
            <div className="space-y-5">
              <ListSection title="추천 대상" items={project.analysis.aiTips.whoShouldApply} />
              <ListSection title="우선 준비" items={project.analysis.aiTips.preparationPriority} />
              <ListSection title="작성 전략" items={project.analysis.aiTips.writingStrategy} />
              <ListSection title="주의할 점" items={project.analysis.aiTips.commonRisks} />
              <ListSection title="체크리스트" items={project.analysis.aiTips.checklist} />
              <ListSection title="필요 서류" items={project.analysis.application.requiredDocuments} />
              <ListSection title="평가 기준" items={project.analysis.selection.criteria} />
              <ListSection title="심사 힌트" items={project.analysis.selection.scoringHints} />
            </div>
          ) : (
            <p className="text-muted-foreground">공고문, 제출서류, 평가기준을 먼저 확인하세요.</p>
          )}
        </Card>
      </div>
    </main>
  );
}
