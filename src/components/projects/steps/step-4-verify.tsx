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
} from "lucide-react";
import { useState } from "react";

interface VerificationItem {
  id: string;
  category: "format" | "content" | "attachment" | "calculation";
  title: string;
  description: string;
  status: "pass" | "fail" | "warning";
}

interface Step4VerifyProps {
  projectId: string;
  creditCost: number;
  onComplete: () => void;
}

const CATEGORY_ICONS = {
  format: FileText,
  content: FileCheck,
  attachment: FileSpreadsheet,
  calculation: Calculator,
};

const CATEGORY_LABELS = {
  format: "형식",
  content: "내용",
  attachment: "첨부",
  calculation: "계산",
};

const STATUS_STYLES = {
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
  projectId,
  creditCost,
  onComplete,
}: Step4VerifyProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>([]);

  const handleStartVerification = async () => {
    setIsRunning(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Mock verification results
    setVerificationItems([
      {
        id: "1",
        category: "format",
        title: "문서 형식 검증",
        description: "PDF 형식, 페이지 수 제한 준수",
        status: "pass",
      },
      {
        id: "2",
        category: "content",
        title: "필수 항목 포함 여부",
        description: "모든 필수 섹션이 작성되었습니다",
        status: "pass",
      },
      {
        id: "3",
        category: "attachment",
        title: "첨부서류 검증",
        description: "사업자등록증 파일명이 규정과 다릅니다",
        status: "warning",
      },
      {
        id: "4",
        category: "calculation",
        title: "예산 계산 검증",
        description: "총액과 세부 항목 합계가 일치합니다",
        status: "pass",
      },
      {
        id: "5",
        category: "content",
        title: "분량 요건 검증",
        description: "최소 분량 요건을 충족합니다",
        status: "pass",
      },
    ]);

    setIsRunning(false);
    setVerificationComplete(true);
  };

  const passCount = verificationItems.filter((item) => item.status === "pass").length;
  const failCount = verificationItems.filter((item) => item.status === "fail").length;
  const warningCount = verificationItems.filter((item) => item.status === "warning").length;

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
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div>
          {failCount > 0 ? (
            <p className="text-sm text-red-600">
              실패 항목을 수정한 후 다시 검증해주세요
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
          {failCount > 0 && (
            <Button variant="outline" onClick={handleStartVerification}>
              <Loader2 className="h-4 w-4 mr-2" />
              재검증 ({creditCost}C)
            </Button>
          )}
          <Button onClick={onComplete} disabled={failCount > 0}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            다음 단계로
          </Button>
        </div>
      </div>
    </div>
  );
}
