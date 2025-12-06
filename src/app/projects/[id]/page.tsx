import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline">{project.category}</Badge>
          {project.subCategory && (
            <Badge variant="outline">{project.subCategory}</Badge>
          )}
          <Badge
            variant={
              project.status === "active"
                ? "default"
                : project.status === "closed"
                ? "destructive"
                : "outline"
            }
          >
            {project.status === "active"
              ? "모집중"
              : project.status === "closed"
              ? "마감"
              : "준비중"}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>{project.organization}</span>
          <span>•</span>
          <span>{project.region}</span>
          <span>•</span>
          <span>조회 {project.viewCount}</span>
        </div>
      </div>

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
                  : project.amountDescription || "미정"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground mb-1">사업 기간</dt>
              <dd className="font-medium">
                {project.startDate && project.endDate
                  ? `${new Date(
                      project.startDate
                    ).toLocaleDateString()} ~ ${new Date(
                      project.endDate
                    ).toLocaleDateString()}`
                  : "미정"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground mb-1">신청 마감</dt>
              <dd className="font-medium">
                {project.isPermanent
                  ? "상시모집"
                  : project.deadline
                  ? new Date(project.deadline).toLocaleDateString()
                  : "미정"}
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
      </div>
    </div>
  );
}
