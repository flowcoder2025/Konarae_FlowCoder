import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateKST } from "@/lib/utils";
import { redirect, notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectFiles } from "@/components/project/project-files";
import { PageHeader } from "@/components/common";
import { ExternalLink } from "lucide-react";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const project = await prisma.supportProject.findUnique({
    where: { id, deletedAt: null },
    include: {
      embeddings: {
        select: {
          fieldType: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          matchingResults: true,
          businessPlans: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  // Increment view count
  await prisma.supportProject.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });

  const formatAmount = (amount: bigint) => {
    const num = Number(amount);
    if (num >= 100000000) {
      return `${(num / 100000000).toFixed(1)}억원`;
    } else if (num >= 10000) {
      return `${(num / 10000).toFixed(0)}만원`;
    }
    return `${num.toLocaleString()}원`;
  };

  const statusLabel =
    project.status === "active"
      ? "모집중"
      : project.status === "closed"
      ? "마감"
      : "준비중";

  const statusVariant =
    project.status === "active"
      ? "default"
      : project.status === "closed"
      ? "destructive"
      : "outline";

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <PageHeader
        title={project.name}
        description={`${project.organization} • ${project.region} • 조회 ${project.viewCount}`}
        listHref="/projects"
        listLabel="지원사업 목록"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{project.category}</Badge>
            {project.subCategory && (
              <Badge variant="outline">{project.subCategory}</Badge>
            )}
            <Badge variant={statusVariant as "default" | "destructive" | "outline"}>
              {statusLabel}
            </Badge>
            {project.detailUrl && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={project.detailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  원본 공고
                </a>
              </Button>
            )}
          </div>
        }
      />

      {/* Main Info */}
      <div className="grid gap-6 mb-8">
        <Card className="p-6">
          <h2 className="font-semibold mb-4">기본 정보</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground mb-1">지원 대상</dt>
              <dd className="font-medium">{project.target}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground mb-1">지원 금액</dt>
              <dd className="font-medium">
                {project.amountMin && project.amountMax
                  ? `${formatAmount(project.amountMin)} ~ ${formatAmount(
                      project.amountMax
                    )}`
                  : project.fundingSummary || "미정"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground mb-1">사업 기간</dt>
              <dd className="font-medium">
                {project.startDate && project.endDate
                  ? `${formatDateKST(project.startDate)} ~ ${formatDateKST(project.endDate)}`
                  : "미정"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground mb-1">신청 마감</dt>
              <dd className="font-medium">
                {project.isPermanent
                  ? "상시모집"
                  : formatDateKST(project.deadline)}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Summary */}
        <Card className="p-6">
          <h2 className="font-semibold mb-4">사업 요약</h2>
          <p className="whitespace-pre-wrap">{project.summary}</p>
        </Card>

        {/* Description */}
        {project.description && (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">상세 내용</h2>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap">{project.description}</p>
            </div>
          </Card>
        )}

        {/* 지원 금액 상세 */}
        {(project.amountMin || project.amountMax || project.amountDescription) && (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">지원 금액 상세</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {project.amountMin && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">최소 지원 금액</dt>
                  <dd className="font-medium text-lg">{formatAmount(project.amountMin)}</dd>
                </div>
              )}
              {project.amountMax && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">최대 지원 금액</dt>
                  <dd className="font-medium text-lg">{formatAmount(project.amountMax)}</dd>
                </div>
              )}
              {project.amountDescription && (
                <div className="md:col-span-2">
                  <dt className="text-sm text-muted-foreground mb-1">상세 설명</dt>
                  <dd className="whitespace-pre-wrap text-sm">{project.amountDescription}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}

        {/* Eligibility */}
        {project.eligibility && (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">신청 자격</h2>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap">{project.eligibility}</p>
            </div>
          </Card>
        )}

        {/* Application Process */}
        {project.applicationProcess && (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">신청 절차</h2>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap">{project.applicationProcess}</p>
            </div>
          </Card>
        )}

        {/* Required Documents */}
        {project.requiredDocuments.length > 0 && (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">제출 서류</h2>
            <ul className="list-disc list-inside space-y-1">
              {project.requiredDocuments.map((doc, idx) => (
                <li key={idx}>{doc}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Contact Info */}
        {(project.contactInfo || project.websiteUrl) && (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">문의</h2>
            <div className="space-y-2">
              {project.contactInfo && (
                <p className="text-sm">{project.contactInfo}</p>
              )}
              {project.websiteUrl && (
                <a
                  href={project.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline block"
                >
                  {project.websiteUrl}
                </a>
              )}
            </div>
          </Card>
        )}

        {/* Attachments */}
        <ProjectFiles projectId={id} />
      </div>
    </div>
  );
}
