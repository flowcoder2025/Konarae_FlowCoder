"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FeedbackItem } from "@/components/evaluations/feedback-item";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  processing: "평가 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "outline" | "secondary" | "destructive"
> = {
  processing: "secondary",
  completed: "default",
  failed: "destructive",
};

export default function EvaluationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [evaluation, setEvaluation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEvaluation();
    const interval = setInterval(() => {
      if (evaluation?.status === "processing") {
        fetchEvaluation();
      }
    }, 3000); // Poll every 3 seconds if processing

    return () => clearInterval(interval);
  }, [id, evaluation?.status]);

  const fetchEvaluation = async () => {
    try {
      const res = await fetch(`/api/evaluations/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch evaluation");
      }
      const data = await res.json();
      setEvaluation(data.evaluation);
    } catch (error) {
      console.error("Fetch evaluation error:", error);
      alert("평가를 불러올 수 없습니다.");
      router.push("/evaluations");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!evaluation) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant={STATUS_VARIANTS[evaluation.status] || "outline"}>
            {STATUS_LABELS[evaluation.status] || evaluation.status}
          </Badge>
          {evaluation.businessPlan?.project && (
            <span className="text-sm text-muted-foreground">
              {evaluation.businessPlan.project.name} (
              {evaluation.businessPlan.project.organization})
            </span>
          )}
        </div>

        {evaluation.businessPlan ? (
          <>
            <h1 className="text-3xl font-bold mb-2">
              {evaluation.businessPlan.title}
            </h1>
            <p className="text-muted-foreground">
              {evaluation.businessPlan.company.name}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-2">업로드 파일 평가</h1>
            <p className="text-muted-foreground">
              {evaluation.uploadedFileUrl || "파일명 없음"}
            </p>
          </>
        )}
      </div>

      {/* Overall Score */}
      {evaluation.status === "completed" && evaluation.totalScore !== null && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">종합 점수</h2>
            <div className="text-right">
              <div className="text-4xl font-bold text-primary">
                {evaluation.totalScore}
              </div>
              <div className="text-sm text-muted-foreground">/ 100점</div>
            </div>
          </div>
          <Progress value={evaluation.totalScore} className="h-2" />
        </Card>
      )}

      {/* Processing State */}
      {evaluation.status === "processing" && (
        <Card className="p-6 mb-6 text-center">
          <p className="text-muted-foreground mb-4">
            AI가 평가를 진행 중입니다. 잠시만 기다려주세요...
          </p>
          <Progress value={undefined} className="h-2" />
        </Card>
      )}

      {/* Failed State */}
      {evaluation.status === "failed" && (
        <Card className="p-6 mb-6">
          <p className="text-destructive">
            평가 중 오류가 발생했습니다. 다시 시도해주세요.
          </p>
        </Card>
      )}

      {/* Evaluation Criteria */}
      {evaluation.criteria && (
        <Card className="p-6 mb-6">
          <h2 className="font-semibold mb-4">평가 기준</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {evaluation.criteria}
          </p>
        </Card>
      )}

      {/* Feedbacks */}
      {evaluation.feedbacks && evaluation.feedbacks.length > 0 && (
        <div className="space-y-4 mb-6">
          <h2 className="font-semibold text-lg">항목별 평가</h2>
          {evaluation.feedbacks.map((feedback: any) => (
            <FeedbackItem key={feedback.id} feedback={feedback} />
          ))}
        </div>
      )}

      {/* Actions */}
      {evaluation.businessPlan && (
        <div className="flex gap-4">
          <Link
            href={`/business-plans/${evaluation.businessPlan.id}`}
            className="flex-1"
          >
            <Button variant="outline" className="w-full">
              사업계획서 보기
            </Button>
          </Link>
          <Button
            onClick={() => router.push("/evaluations/new")}
            className="flex-1"
          >
            새 평가 요청
          </Button>
        </div>
      )}
    </div>
  );
}
