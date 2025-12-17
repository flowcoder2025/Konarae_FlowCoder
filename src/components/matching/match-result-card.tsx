"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDateKST } from "@/lib/utils";
import Link from "next/link";

interface MatchResultCardProps {
  result: {
    id: string;
    projectId: string;
    totalScore: number;
    businessSimilarityScore: number; // 사업 유사도 (텍스트 + 문서 벡터 통합)
    categoryScore: number; // 관심 분야 일치도
    eligibilityScore: number; // 자격 요건
    confidence: "high" | "medium" | "low";
    matchReasons: string[];
    project: {
      id: string;
      name: string;
      organization: string;
      category: string;
      subCategory?: string | null;
      summary: string;
      amountMin?: bigint | null;
      amountMax?: bigint | null;
      deadline?: Date | null;
      isPermanent?: boolean;
    };
  };
}

const CONFIDENCE_VARIANTS = {
  high: "default" as const,
  medium: "outline" as const,
  low: "outline" as const,
};

const CONFIDENCE_LABELS = {
  high: "높은 적합도",
  medium: "중간 적합도",
  low: "낮은 적합도",
};

export function MatchResultCard({ result }: MatchResultCardProps) {
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
    <Link href={`/matching/results/${result.id}`}>
      <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={CONFIDENCE_VARIANTS[result.confidence]}>
                {CONFIDENCE_LABELS[result.confidence]}
              </Badge>
              <Badge variant="outline">{result.project.category}</Badge>
              {result.project.subCategory && (
                <Badge variant="outline">{result.project.subCategory}</Badge>
              )}
            </div>
            <h3 className="font-semibold text-lg line-clamp-2 mb-1">
              {result.project.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {result.project.organization}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">
              {result.totalScore}
            </div>
            <div className="text-xs text-muted-foreground">점</div>
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {result.project.summary}
        </p>

        {/* Scores Breakdown */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">사업 유사도</span>
            <span className="font-medium">{result.businessSimilarityScore}점</span>
          </div>
          <Progress value={result.businessSimilarityScore} className="h-1" />

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">업종 적합도</span>
            <span className="font-medium">{result.categoryScore}점</span>
          </div>
          <Progress value={result.categoryScore} className="h-1" />

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">자격 요건</span>
            <span className="font-medium">{result.eligibilityScore}점</span>
          </div>
          <Progress value={result.eligibilityScore} className="h-1" />
        </div>

        {/* Match Reasons */}
        {result.matchReasons.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">매칭 이유:</p>
            <div className="flex flex-wrap gap-1">
              {result.matchReasons.slice(0, 3).map((reason, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {reason}
                </Badge>
              ))}
              {result.matchReasons.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{result.matchReasons.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-sm pt-4 border-t">
          <div>
            {result.project.amountMin && result.project.amountMax ? (
              <span className="font-medium text-primary">
                {formatAmount(result.project.amountMin)} ~{" "}
                {formatAmount(result.project.amountMax)}
              </span>
            ) : (
              <span className="text-muted-foreground">금액 미정</span>
            )}
          </div>
          <div className="text-muted-foreground text-xs">
            {result.project.isPermanent ? (
              <span>상시모집</span>
            ) : result.project.deadline ? (
              <span>
                ~{formatDateKST(result.project.deadline)}
              </span>
            ) : (
              <span>기한 미정</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
