import { Card } from "@/components/ui/card";

interface ProjectAnalysisConfidenceWarningProps {
  confidence: string | null | undefined;
}

export function shouldShowAnalysisConfidenceWarning(confidence: string | null | undefined): boolean {
  return confidence === "low";
}

export function ProjectAnalysisConfidenceWarning({ confidence }: ProjectAnalysisConfidenceWarningProps) {
  if (!shouldShowAnalysisConfidenceWarning(confidence)) return null;

  return (
    <Card role="alert" className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      AI 분석 신뢰도가 낮아 원문 확인이 필요합니다.
    </Card>
  );
}
