import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDateKST } from "@/lib/utils";

interface EvaluationCardProps {
  evaluation: {
    id: string;
    status: string;
    totalScore: number | null;
    createdAt: Date;
    businessPlan?: {
      id: string;
      title: string;
      company: {
        id: string;
        name: string;
      };
    } | null;
    uploadedFileUrl?: string | null;
    _count?: {
      feedbacks: number;
    };
  };
}

const STATUS_VARIANTS: Record<
  string,
  "default" | "outline" | "secondary" | "destructive"
> = {
  processing: "secondary",
  completed: "default",
  failed: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  processing: "평가 중",
  completed: "완료",
  failed: "실패",
};

export function EvaluationCard({ evaluation }: EvaluationCardProps) {
  return (
    <Link href={`/evaluations/${evaluation.id}`}>
      <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            {evaluation.businessPlan ? (
              <>
                <h3 className="text-lg font-semibold mb-1">
                  {evaluation.businessPlan.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {evaluation.businessPlan.company.name}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-1">
                  업로드 파일 평가
                </h3>
                <p className="text-sm text-muted-foreground">
                  {evaluation.uploadedFileUrl || "파일명 없음"}
                </p>
              </>
            )}
          </div>
          <Badge variant={STATUS_VARIANTS[evaluation.status] || "outline"}>
            {STATUS_LABELS[evaluation.status] || evaluation.status}
          </Badge>
        </div>

        {evaluation.status === "completed" && evaluation.totalScore !== null ? (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">종합 점수</span>
              <span className="text-2xl font-bold text-primary">
                {evaluation.totalScore}
              </span>
            </div>
            <Progress value={evaluation.totalScore} className="h-2" />
          </div>
        ) : evaluation.status === "processing" ? (
          <div className="mb-3 text-sm text-muted-foreground">
            AI가 평가를 진행 중입니다...
          </div>
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            피드백: {evaluation._count?.feedbacks || 0}개
          </span>
          <span>
            {formatDateKST(evaluation.createdAt)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
