"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileCheck,
  Coins,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  Calculator,
  FileSpreadsheet,
  ChevronLeft,
  SkipForward,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type {
  VerificationItem,
  VerificationResult,
  VerificationCategory,
  VerificationStatus,
  CATEGORY_LABELS as CategoryLabelsType,
} from "@/types/verification";

interface Step4VerifyProps {
  userProjectId: string;
  creditCost: number;
  onComplete: () => void;
  onSkip?: () => void;
  onPrevious?: () => void;
}

const CATEGORY_ICONS: Record<VerificationCategory, React.ElementType> = {
  format: FileText,
  content: FileCheck,
  attachment: FileSpreadsheet,
  calculation: Calculator,
  compliance: ShieldCheck,
};

const CATEGORY_LABELS: Record<VerificationCategory, string> = {
  format: "형식",
  content: "내용",
  attachment: "첨부",
  calculation: "계산",
  compliance: "규정",
};

const STATUS_STYLES: Record<
  VerificationStatus,
  {
    icon: React.ElementType;
    bg: string;
    text: string;
    label: string;
  }
> = {
  pass: {
    icon: CheckCircle2,
    bg: "bg-green-100",
    text: "text-green-700",
    label: "통과",
  },
  fail: {
    icon: XCircle,
    bg: "bg-red-100",
    text: "text-red-700",
    label: "실패",
  },
  warning: {
    icon: AlertCircle,
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    label: "주의",
  },
};

export function Step4Verify({
  userProjectId,
  creditCost,
  onComplete,
  onSkip,
  onPrevious,
}: Step4VerifyProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>([]);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 기존 검증 결과 조회
  const fetchLatestVerification = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/verification?userProjectId=${userProjectId}&limit=1`
      );

      if (!response.ok) {
        throw new Error("검증 결과 조회에 실패했습니다");
      }

      const data = await response.json();

      if (data.verifications && data.verifications.length > 0) {
        const latest = data.verifications[0];
        if (latest.status === "completed" && latest.result) {
          setVerificationId(latest.id);
          setVerificationItems(latest.result.items || []);
          setVerificationComplete(true);
        }
      }
    } catch (err) {
      // 기존 결과가 없을 수 있으므로 에러는 무시
      console.log("No previous verification found");
    } finally {
      setIsLoading(false);
    }
  }, [userProjectId]);

  useEffect(() => {
    fetchLatestVerification();
  }, [fetchLatestVerification]);

  const handleStartVerification = async () => {
    setIsRunning(true);
    setError(null);

    try {
      // 검증 요청
      const response = await fetch("/api/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProjectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "검증 요청에 실패했습니다");
      }

      setVerificationId(data.verificationId);

      // 결과 조회
      await fetchVerificationResult(data.verificationId);

      toast.success("검증이 완료되었습니다");
    } catch (err) {
      const message = err instanceof Error ? err.message : "검증 중 오류가 발생했습니다";
      setError(message);
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const fetchVerificationResult = async (id: string) => {
    try {
      const response = await fetch(`/api/verification/${id}`);

      if (!response.ok) {
        throw new Error("검증 결과 조회에 실패했습니다");
      }

      const data = await response.json();

      if (data.status === "completed" && data.result) {
        setVerificationItems(data.result.items || []);
        setVerificationComplete(true);
      } else if (data.status === "failed") {
        throw new Error(data.errorMessage || "검증에 실패했습니다");
      } else {
        // 아직 처리 중이면 폴링
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return fetchVerificationResult(id);
      }
    } catch (err) {
      throw err;
    }
  };

  const passCount = verificationItems.filter((item) => item.status === "pass").length;
  const failCount = verificationItems.filter((item) => item.status === "fail").length;
  const warningCount = verificationItems.filter((item) => item.status === "warning").length;

  // 로딩 중
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 검증 시작 전 화면
  if (!verificationComplete) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-3">
            <FileCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">제출 전 최종 검증</p>
              <p className="text-sm text-muted-foreground mt-1">
                AI가 문서 형식, 필수 항목, 첨부서류, 예산 계산 등을
                자동으로 점검하여 제출 전 오류를 사전에 발견합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-900">검증 오류</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleStartVerification}
              disabled={isRunning}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              다시 시도
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <FileCheck className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">검증 시작하기</h3>
            <p className="text-muted-foreground mb-6">
              제출 전 마지막 점검으로
              <br />
              실수를 방지하세요
            </p>
            <Button onClick={handleStartVerification} disabled={isRunning} size="lg">
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  검증 중...
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4 mr-2" />
                  검증 시작하기 ({creditCost}C)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Actions - 이전 단계 & 건너뛰기 */}
        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" onClick={onPrevious}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            이전 단계
          </Button>
          <Button variant="outline" onClick={onSkip}>
            <SkipForward className="h-4 w-4 mr-2" />
            이 단계 건너뛰기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center ${
            failCount > 0 ? "bg-red-100" : "bg-green-100"
          }`}
        >
          {failCount > 0 ? (
            <XCircle className="h-6 w-6 text-red-600" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-medium">
            {failCount > 0 ? "수정이 필요합니다" : "검증 통과"}
          </p>
          <p className="text-sm text-muted-foreground">
            {verificationItems.length}개 항목 검증 완료
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-700 border-0">
            {passCount}개 통과
          </Badge>
          {warningCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700 border-0">
              {warningCount}개 주의
            </Badge>
          )}
          {failCount > 0 && (
            <Badge variant="destructive">{failCount}개 실패</Badge>
          )}
        </div>
      </div>

      {/* Verification Items */}
      <div className="space-y-3">
        {verificationItems.map((item) => {
          const CategoryIcon = CATEGORY_ICONS[item.category];
          const style = STATUS_STYLES[item.status];
          const StatusIcon = style.icon;

          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-4 rounded-lg border ${
                item.status === "fail"
                  ? "border-red-200"
                  : item.status === "warning"
                    ? "border-yellow-200"
                    : "border-border"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center shrink-0`}
              >
                <StatusIcon className={`h-5 w-5 ${style.text}`} />
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
                {/* 상세 정보 및 제안 */}
                {item.details && (
                  <p className="text-sm text-muted-foreground mt-1 bg-muted/50 p-2 rounded">
                    {item.details}
                  </p>
                )}
                {item.suggestion && (
                  <p className="text-sm text-primary mt-1">
                    💡 {item.suggestion}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrevious}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            이전 단계
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div>
            {failCount > 0 ? (
              <p className="text-sm text-red-600">
                실패 항목이 있지만 건너뛸 수 있습니다
              </p>
            ) : warningCount > 0 ? (
              <p className="text-sm text-yellow-600">
                주의 항목을 확인 후 진행하세요
              </p>
            ) : (
              <p className="text-sm text-green-600">
                모든 검증을 통과했습니다
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {(failCount > 0 || warningCount > 0) && (
              <>
                <Button
                  variant="outline"
                  onClick={handleStartVerification}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  재검증 ({creditCost}C)
                </Button>
                <Button variant="outline" onClick={onSkip}>
                  <SkipForward className="h-4 w-4 mr-2" />
                  건너뛰기
                </Button>
              </>
            )}
            <Button onClick={onComplete}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              다음 단계로
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
