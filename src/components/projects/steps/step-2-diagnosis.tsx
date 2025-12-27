"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardCheck,
  Coins,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Building2,
  Loader2,
} from "lucide-react";
import { useState } from "react";

interface DiagnosisItem {
  id: string;
  category: "document" | "info" | "eligibility";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  resolved: boolean;
}

interface Step2DiagnosisProps {
  companyId: string;
  projectId: string;
  creditCost: number;
  onComplete: () => void;
}

const CATEGORY_ICONS = {
  document: FileText,
  info: Building2,
  eligibility: ClipboardCheck,
};

const CATEGORY_LABELS = {
  document: "증빙서류",
  info: "기업정보",
  eligibility: "자격요건",
};

const SEVERITY_STYLES = {
  critical: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
    label: "필수",
  },
  warning: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    border: "border-yellow-200",
    label: "권장",
  },
  info: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-200",
    label: "참고",
  },
};

export function Step2Diagnosis({
  companyId,
  projectId,
  creditCost,
  onComplete,
}: Step2DiagnosisProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [diagnosisComplete, setDiagnosisComplete] = useState(false);
  const [diagnosisItems, setDiagnosisItems] = useState<DiagnosisItem[]>([]);

  const handleStartDiagnosis = async () => {
    setIsRunning(true);

    // Simulate API call - in real implementation, call /api/diagnosis
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock diagnosis results
    setDiagnosisItems([
      {
        id: "1",
        category: "document",
        title: "재무제표 미등록",
        description: "최근 2개년 재무제표가 필요합니다",
        severity: "critical",
        resolved: false,
      },
      {
        id: "2",
        category: "document",
        title: "사업자등록증 만료 예정",
        description: "등록된 사업자등록증이 3개월 이내 만료됩니다",
        severity: "warning",
        resolved: false,
      },
      {
        id: "3",
        category: "info",
        title: "고용보험 가입자 수 미입력",
        description: "현재 고용보험 가입 인원 정보가 필요합니다",
        severity: "critical",
        resolved: false,
      },
      {
        id: "4",
        category: "eligibility",
        title: "중소기업 확인서 권장",
        description: "중소기업 확인서가 있으면 가점을 받을 수 있습니다",
        severity: "info",
        resolved: false,
      },
    ]);

    setIsRunning(false);
    setDiagnosisComplete(true);
  };

  const criticalCount = diagnosisItems.filter(
    (item) => item.severity === "critical" && !item.resolved
  ).length;
  const warningCount = diagnosisItems.filter(
    (item) => item.severity === "warning" && !item.resolved
  ).length;

  if (!diagnosisComplete) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">AI 부족항목 진단</p>
              <p className="text-sm text-muted-foreground mt-1">
                공고 요구사항과 현재 등록된 기업 정보를 비교 분석하여
                부족한 증빙서류와 정보를 찾아드립니다.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">진단 시작하기</h3>
            <p className="text-muted-foreground mb-6">
              AI가 지원 자격과 제출 서류를 분석하여
              <br />
              누락된 항목을 찾아드립니다
            </p>
            <Button onClick={handleStartDiagnosis} disabled={isRunning} size="lg">
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  진단 중...
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4 mr-2" />
                  진단 시작하기 ({creditCost}C)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <ClipboardCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-medium">진단 완료</p>
          <p className="text-sm text-muted-foreground">
            {diagnosisItems.length}개 항목을 확인했습니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant="destructive">{criticalCount}개 필수</Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">
              {warningCount}개 권장
            </Badge>
          )}
        </div>
      </div>

      {/* Diagnosis Items */}
      <div className="space-y-3">
        {diagnosisItems.map((item) => {
          const CategoryIcon = CATEGORY_ICONS[item.category];
          const style = SEVERITY_STYLES[item.severity];

          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-4 rounded-lg border ${style.border} ${item.resolved ? "opacity-50" : ""}`}
            >
              <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center shrink-0`}>
                {item.resolved ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <CategoryIcon className={`h-5 w-5 ${style.text}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{item.title}</span>
                  <Badge variant="outline" className={`${style.bg} ${style.text} border-0 text-xs`}>
                    {style.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABELS[item.category]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              {!item.resolved && item.severity === "critical" && (
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          {criticalCount > 0
            ? "필수 항목을 보완한 후 다음 단계로 진행하세요"
            : "모든 필수 항목이 준비되었습니다"}
        </p>
        <Button onClick={onComplete} disabled={criticalCount > 0}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          다음 단계로
        </Button>
      </div>
    </div>
  );
}
