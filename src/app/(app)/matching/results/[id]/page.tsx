import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateKST } from "@/lib/utils";
import { redirect, notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { PageHeader } from "@/components/common";
import { StartDiagnosisButton } from "@/components/diagnosis/start-diagnosis-button";
import { StartProjectButton } from "@/components/matching/start-project-button";
import type { Metadata } from "next";

interface MatchResultDetailPageProps {
  params: Promise<{ id: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://konarae.com";

export async function generateMetadata({
  params,
}: MatchResultDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  const result = await prisma.matchingResult.findUnique({
    where: { id },
    select: {
      totalScore: true,
      confidence: true,
      company: {
        select: {
          name: true,
        },
      },
      project: {
        select: {
          name: true,
          category: true,
        },
      },
    },
  });

  if (!result) {
    return {
      title: "매칭 결과를 찾을 수 없습니다",
      description: "요청하신 매칭 결과를 찾을 수 없습니다.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const scorePercent = Math.round(result.totalScore * 100);
  const confidenceLabel =
    result.confidence === "high"
      ? "높음"
      : result.confidence === "medium"
      ? "중간"
      : "낮음";

  return {
    title: `${result.company.name} × ${result.project.name} 매칭 결과`,
    description: `매칭 점수 ${scorePercent}점, 신뢰도 ${confidenceLabel} - ${result.project.name} 지원사업 매칭 분석 결과`,
    keywords: [
      "매칭 결과",
      result.company.name,
      result.project.name,
      result.project.category,
    ],
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: `${result.company.name} × ${result.project.name}`,
      description: `매칭 점수 ${scorePercent}점`,
      type: "article",
      url: `${SITE_URL}/matching/results/${id}`,
    },
  };
}

export default async function MatchResultDetailPage({
  params,
}: MatchResultDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const result = await prisma.matchingResult.findUnique({
    where: {
      id,
      userId: session.user.id,
    },
    include: {
      project: true,
      company: true,
    },
  });

  if (!result) {
    notFound();
  }

  // Type-safe confidence
  const confidence = result.confidence as "high" | "medium" | "low";

  const CONFIDENCE_VARIANTS: Record<
    "high" | "medium" | "low",
    "default" | "outline"
  > = {
    high: "default",
    medium: "outline",
    low: "outline",
  };

  const CONFIDENCE_LABELS: Record<"high" | "medium" | "low", string> = {
    high: "높은 적합도",
    medium: "중간 적합도",
    low: "낮은 적합도",
  };

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
    <div className="container mx-auto py-8 max-w-7xl">
      <PageHeader
        title={result.project.name}
        description={`${result.company.name} • ${result.project.organization}`}
        listHref="/matching/results"
        listLabel="매칭 결과 목록"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={CONFIDENCE_VARIANTS[confidence]}>
              {CONFIDENCE_LABELS[confidence]}
            </Badge>
            <Badge variant="outline">{result.project.category}</Badge>
            {result.project.subCategory && (
              <Badge variant="outline">{result.project.subCategory}</Badge>
            )}
          </div>
        }
      />

      {/* Overall Score */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">종합 매칭 점수</h2>
          <div className="text-right">
            <div className="text-4xl font-bold text-primary">
              {result.totalScore}
            </div>
            <div className="text-sm text-muted-foreground">/ 100점</div>
          </div>
        </div>
        <Progress value={result.totalScore} className="h-2" />
      </Card>

      {/* Score Breakdown */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-4">세부 점수</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">사업 유사도 (50%)</span>
              <span className="font-medium">{result.businessSimilarityScore}점</span>
            </div>
            <Progress value={result.businessSimilarityScore} />
            <p className="text-xs text-muted-foreground mt-1">
              기업 프로필/문서와 지원사업의 벡터 유사도
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">업종 적합도 (25%)</span>
              <span className="font-medium">{result.categoryScore}점</span>
            </div>
            <Progress value={result.categoryScore} />
            <p className="text-xs text-muted-foreground mt-1">
              기업 업종과 지원사업 대상/자격요건 일치도
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">자격 요건 (25%)</span>
              <span className="font-medium">{result.eligibilityScore}점</span>
            </div>
            <Progress value={result.eligibilityScore} />
            <p className="text-xs text-muted-foreground mt-1">
              벤처/이노비즈/메인비즈 등 인증 요건 충족도
            </p>
          </div>
        </div>
      </Card>

      {/* Match Reasons */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-4">매칭 이유</h2>
        <div className="flex flex-wrap gap-2">
          {result.matchReasons.map((reason, idx) => (
            <Badge key={idx} variant="outline">
              {reason}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Project Details */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-4">지원사업 정보</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground mb-1">지원 대상</dt>
            <dd className="font-medium">{result.project.target}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground mb-1">지원 금액</dt>
            <dd className="font-medium">
              {result.project.amountMin && result.project.amountMax
                ? `${formatAmount(result.project.amountMin)} ~ ${formatAmount(
                    result.project.amountMax
                  )}`
                : result.project.amountDescription || "미정"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground mb-1">사업 기간</dt>
            <dd className="font-medium">
              {result.project.startDate && result.project.endDate
                ? `${formatDateKST(result.project.startDate)} ~ ${formatDateKST(result.project.endDate)}`
                : "미정"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground mb-1">신청 마감</dt>
            <dd className="font-medium">
              {result.project.isPermanent
                ? "상시모집"
                : formatDateKST(result.project.deadline)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Summary */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-4">사업 요약</h2>
        <p className="whitespace-pre-wrap">{result.project.summary}</p>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-4">
        {/* Primary Action - Start Project */}
        <StartProjectButton
          companyId={result.companyId}
          projectId={result.projectId}
          matchingResultId={result.id}
          size="lg"
          className="w-full py-6 text-lg"
        />

        {/* Secondary Actions */}
        <div className="flex gap-4">
          <Link
            href={`/projects/${result.projectId}`}
            className="flex-1 text-center py-3 px-4 border border-input rounded-md hover:bg-accent transition-colors"
          >
            지원사업 상세보기
          </Link>
          <Link
            href={`/business-plans/new?companyId=${result.companyId}&projectId=${result.projectId}`}
            className="flex-1 text-center py-3 px-4 border border-input rounded-md hover:bg-accent transition-colors"
          >
            사업계획서 바로 작성
          </Link>
        </div>
        <StartDiagnosisButton
          companyId={result.companyId}
          projectId={result.projectId}
        />
      </div>
    </div>
  );
}
