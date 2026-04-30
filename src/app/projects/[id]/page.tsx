import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProjectShareActions } from "@/components/projects/project-share-actions";
import { ProjectAnalysisConfidenceWarning } from "@/components/projects/project-analysis-confidence-warning";
import { ProjectDescriptionRenderer } from "@/components/projects/project-description-renderer";
import { getPublicProject } from "@/lib/projects/public-service";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mate.flow-coder.com";

export const dynamic = "force-dynamic";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
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
          <p className="text-muted-foreground">{project.analysis?.summary.plain ?? project.summary}</p>
        </Card>

        {project.analysisMarkdown ? (
          <Card className="p-6">
            <h2 className="mb-4 text-xl font-semibold">공고문 분석 내용</h2>
            <ProjectDescriptionRenderer
              markdownContent={project.analysisMarkdown}
              content={project.summary}
              collapsedHeight={520}
            />
          </Card>
        ) : null}

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold">지원 조건</h2>
          {project.analysis?.eligibility.required.length ? (
            <ul className="list-disc space-y-2 pl-5">
              {project.analysis.eligibility.required.map((item) => <li key={item.label}>{item.description}</li>)}
            </ul>
          ) : (
            <p className="text-muted-foreground">{project.eligibility ?? "조건 정보는 원문에서 확인하세요."}</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-semibold">준비 팁</h2>
          {project.analysis?.aiTips.checklist.length ? (
            <ul className="list-disc space-y-2 pl-5">
              {project.analysis.aiTips.checklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="text-muted-foreground">공고문, 제출서류, 평가기준을 먼저 확인하세요.</p>
          )}
        </Card>
      </div>
    </main>
  );
}
