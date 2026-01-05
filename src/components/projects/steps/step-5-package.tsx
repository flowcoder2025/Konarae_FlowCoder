"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Package,
  Download,
  CheckCircle2,
  FileText,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface BusinessPlanInfo {
  id: string;
  title: string;
  sectionsCount: number;
  status: string;
}

interface Step5PackageProps {
  projectId: string; // UserProject ID
  projectUrl: string | null;
  onComplete: () => void;
}

const SUBMISSION_CHECKLIST = [
  {
    id: "files",
    label: "제출 파일 확인",
    description: "사업계획서가 올바르게 작성되어 있습니다",
  },
  {
    id: "naming",
    label: "파일명 규칙 확인",
    description: "파일명이 공고 요구사항을 따르고 있습니다",
  },
  {
    id: "portal",
    label: "제출처 확인",
    description: "온라인 접수 시스템 또는 이메일 주소를 확인했습니다",
  },
  {
    id: "deadline",
    label: "마감 시간 확인",
    description: "접수 마감 시간을 다시 한번 확인했습니다",
  },
];

export function Step5Package({
  projectId,
  projectUrl,
  onComplete,
}: Step5PackageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [businessPlan, setBusinessPlan] = useState<BusinessPlanInfo | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch business plan info
  const fetchBusinessPlan = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get user project to find business plan ID
      const userProjectRes = await fetch(`/api/user-projects/${projectId}`);
      if (!userProjectRes.ok) {
        throw new Error("프로젝트 정보를 불러오는데 실패했습니다");
      }

      const userProject = await userProjectRes.json();

      if (!userProject.businessPlanId) {
        setError("사업계획서가 아직 작성되지 않았습니다. 3단계에서 계획서를 먼저 작성해주세요.");
        return;
      }

      // Get business plan info
      const planRes = await fetch(`/api/business-plans/${userProject.businessPlanId}`);
      if (!planRes.ok) {
        throw new Error("사업계획서를 불러오는데 실패했습니다");
      }

      const planData = await planRes.json();

      setBusinessPlan({
        id: planData.id,
        title: planData.title,
        sectionsCount: planData.sections?.length || 0,
        status: planData.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "오류가 발생했습니다";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBusinessPlan();
  }, [fetchBusinessPlan]);

  const handleDownload = async () => {
    if (!businessPlan) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/business-plans/${businessPlan.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pdf" }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "다운로드 실패");
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `${businessPlan.title}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("사업계획서가 다운로드되었습니다");
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드에 실패했습니다";
      toast.error(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCheckChange = (itemId: string, checked: boolean) => {
    const newChecked = new Set(checkedItems);
    if (checked) {
      newChecked.add(itemId);
    } else {
      newChecked.delete(itemId);
    }
    setCheckedItems(newChecked);
  };

  const handleSubmitComplete = async () => {
    setIsSubmitting(true);
    try {
      // Update user project status to submitted
      const response = await fetch(`/api/user-projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "submitted",
          step5Completed: true,
        }),
      });

      if (!response.ok) {
        throw new Error("상태 업데이트에 실패했습니다");
      }

      toast.success("제출이 완료되었습니다! 수고하셨습니다.");
      onComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : "제출 완료 처리에 실패했습니다";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const allChecked = checkedItems.size === SUBMISSION_CHECKLIST.length;
  const canSubmit = allChecked && businessPlan && businessPlan.sectionsCount > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">오류 발생</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <div className="flex items-start gap-3">
          <Package className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">패키징 & 제출 준비</p>
            <p className="text-sm text-muted-foreground mt-1">
              사업계획서를 다운로드하고, 최종 체크리스트를 확인하세요.
            </p>
          </div>
        </div>
      </div>

      {/* Business Plan Info */}
      {businessPlan && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{businessPlan.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {businessPlan.sectionsCount}개 섹션 작성됨
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-0">
                  {businessPlan.status === "completed" ? "완료" : "작성중"}
                </Badge>
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  size="sm"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      다운로드 중...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      PDF 다운로드
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submission Checklist */}
      <div className="space-y-4">
        <h4 className="font-medium">제출 전 최종 체크리스트</h4>
        <div className="space-y-3">
          {SUBMISSION_CHECKLIST.map((item) => (
            <div
              key={item.id}
              className={`
                flex items-start gap-3 p-4 rounded-lg border transition-colors
                ${checkedItems.has(item.id) ? "border-primary/50 bg-primary/5" : "border-border"}
              `}
            >
              <Checkbox
                id={item.id}
                checked={checkedItems.has(item.id)}
                onCheckedChange={(checked) =>
                  handleCheckChange(item.id, checked === true)
                }
                className="mt-0.5"
              />
              <Label htmlFor={item.id} className="flex-1 cursor-pointer">
                <span className="font-medium">{item.label}</span>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              </Label>
              {checkedItems.has(item.id) && (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit Portal Link */}
      {projectUrl && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">접수처 바로가기</p>
                  <p className="text-sm text-muted-foreground">
                    온라인 접수 시스템에서 파일을 업로드하세요
                  </p>
                </div>
              </div>
              <Button variant="outline" asChild>
                <a href={projectUrl} target="_blank" rel="noopener noreferrer">
                  접수처 열기
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Button */}
      <div className="flex justify-between items-center pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          {allChecked
            ? "모든 항목을 확인했습니다. 제출을 완료해주세요."
            : "체크리스트를 모두 확인해주세요"}
        </p>
        <Button
          onClick={handleSubmitComplete}
          disabled={!canSubmit || isSubmitting}
          className="bg-green-600 hover:bg-green-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              처리 중...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              제출 완료로 표시
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
