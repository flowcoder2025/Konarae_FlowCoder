"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardCheck,
  Coins,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Building2,
  Loader2,
  ChevronLeft,
  SkipForward,
  Upload,
  X,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { GapItem, ActionItem, RequirementCategory, GapSeverity } from "@/types/diagnosis";

interface DiagnosisItem {
  id: string;
  category: "document" | "info" | "eligibility";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  resolved: boolean;
  enhanceType?: "upload" | "input" | "form";
  requiredFields?: string[];
  // 원본 데이터 참조
  gapId?: string;
  actionId?: string;
  documentType?: string;
}

// API 응답에서 UI로 카테고리 변환
function mapCategory(category: RequirementCategory): DiagnosisItem["category"] {
  switch (category) {
    case "document":
    case "certification":
      return "document";
    case "financial":
    case "history":
      return "info";
    case "eligibility":
    case "other":
    default:
      return "eligibility";
  }
}

// API 응답에서 UI로 심각도 변환
function mapSeverity(severity: GapSeverity): DiagnosisItem["severity"] {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "warning";
    case "medium":
    case "low":
    default:
      return "info";
  }
}

// Gap + Action을 DiagnosisItem으로 변환
function convertGapToItem(gap: GapItem, action?: ActionItem): DiagnosisItem {
  const category = mapCategory(gap.category);

  // 카테고리에 따른 enhanceType 결정
  let enhanceType: DiagnosisItem["enhanceType"] = "form";
  let requiredFields: string[] | undefined;

  if (category === "document" || action?.documentType) {
    enhanceType = "upload";
  } else if (category === "info") {
    enhanceType = "input";
    // 일반적인 기업 정보 필드
    requiredFields = ["value"];
  }

  return {
    id: gap.id,
    gapId: gap.id,
    actionId: action?.id,
    category,
    title: gap.requirement,
    description: `현재: ${gap.current} | 필요: ${gap.gap}`,
    severity: mapSeverity(gap.severity),
    resolved: false,
    enhanceType,
    requiredFields,
    documentType: action?.documentType,
  };
}

interface Step2DiagnosisProps {
  companyId: string;
  projectId: string;
  creditCost: number;
  onComplete: () => void;
  onSkip?: () => void;
  onPrevious?: () => void;
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
  onSkip,
  onPrevious,
}: Step2DiagnosisProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [diagnosisComplete, setDiagnosisComplete] = useState(false);
  const [diagnosisItems, setDiagnosisItems] = useState<DiagnosisItem[]>([]);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [fitScore, setFitScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 보강 모달 상태
  const [selectedItem, setSelectedItem] = useState<DiagnosisItem | null>(null);
  const [isEnhanceModalOpen, setIsEnhanceModalOpen] = useState(false);
  const [enhanceFormData, setEnhanceFormData] = useState<Record<string, string>>({});
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 진단 결과 조회
  const fetchDiagnosisResult = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/diagnosis/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "진단 결과를 불러올 수 없습니다");
      }

      if (data.status === "failed") {
        throw new Error(data.errorMessage || "진단에 실패했습니다");
      }

      // gaps와 actions를 DiagnosisItem으로 변환
      const gaps = (data.gaps || []) as GapItem[];
      const actions = (data.actions || []) as ActionItem[];

      const items: DiagnosisItem[] = gaps.map((gap) => {
        // 해당 gap에 연결된 action 찾기
        const action = actions.find((a) => a.gapId === gap.id);
        return convertGapToItem(gap, action);
      });

      setDiagnosisItems(items);
      setFitScore(data.fitScore);
      setDiagnosisComplete(true);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "진단 결과 조회 실패";
      setError(message);
      toast.error(message);
      return false;
    }
  }, []);

  const handleStartDiagnosis = async () => {
    setIsRunning(true);
    setError(null);

    try {
      // 1. 진단 요청
      const response = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, projectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "진단 요청에 실패했습니다");
      }

      // 2. 진단 ID 저장 및 결과 조회
      setDiagnosisId(data.diagnosisId);
      await fetchDiagnosisResult(data.diagnosisId);

      toast.success("진단이 완료되었습니다");
    } catch (err) {
      const message = err instanceof Error ? err.message : "진단 중 오류가 발생했습니다";
      setError(message);
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleItemClick = (item: DiagnosisItem) => {
    if (!item.resolved) {
      setSelectedItem(item);
      setEnhanceFormData({});
      setUploadedFile(null);
      setIsEnhanceModalOpen(true);
    }
  };

  const handleEnhanceSubmit = async () => {
    if (!selectedItem) return;

    setIsSaving(true);

    try {
      // 문서 업로드의 경우
      if (selectedItem.enhanceType === "upload" && uploadedFile) {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        formData.append("companyId", companyId);
        if (selectedItem.documentType) {
          formData.append("documentType", selectedItem.documentType);
        }

        const response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "문서 업로드에 실패했습니다");
        }

        toast.success("문서가 업로드되었습니다");
      }
      // 기업 정보 업데이트의 경우
      else if (selectedItem.enhanceType === "input" && Object.keys(enhanceFormData).length > 0) {
        const response = await fetch(`/api/companies/${companyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhanceFormData),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "정보 업데이트에 실패했습니다");
        }

        toast.success("정보가 업데이트되었습니다");
      }

      // UI에서 항목을 해결됨으로 표시
      setDiagnosisItems((prev) =>
        prev.map((item) =>
          item.id === selectedItem.id ? { ...item, resolved: true } : item
        )
      );

      setIsEnhanceModalOpen(false);
      setSelectedItem(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장에 실패했습니다";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  }, []);

  const criticalCount = diagnosisItems.filter(
    (item) => item.severity === "critical" && !item.resolved
  ).length;
  const warningCount = diagnosisItems.filter(
    (item) => item.severity === "warning" && !item.resolved
  ).length;
  const allCriticalResolved = diagnosisItems
    .filter(item => item.severity === "critical")
    .every(item => item.resolved);

  // 보강 모달 폼 렌더링
  const renderEnhanceForm = () => {
    if (!selectedItem) return null;

    switch (selectedItem.enhanceType) {
      case "upload":
        return (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
              {uploadedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{uploadedFile.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setUploadedFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    파일을 드래그하거나 클릭하여 업로드
                  </p>
                  <Input
                    type="file"
                    className="cursor-pointer"
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              지원 형식: PDF, JPG, PNG (최대 10MB)
            </p>
          </div>
        );

      case "input":
        return (
          <div className="space-y-4">
            {selectedItem.requiredFields?.map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>
                  {field === "employeeCount" ? "고용보험 가입 인원" : field}
                </Label>
                <Input
                  id={field}
                  type="number"
                  placeholder="숫자를 입력하세요"
                  value={enhanceFormData[field] || ""}
                  onChange={(e) =>
                    setEnhanceFormData(prev => ({ ...prev, [field]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        );

      case "form":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="details">상세 내용</Label>
              <Textarea
                id="details"
                placeholder="관련 정보를 입력하세요"
                value={enhanceFormData.details || ""}
                onChange={(e) =>
                  setEnhanceFormData(prev => ({ ...prev, details: e.target.value }))
                }
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isEnhanceFormValid = () => {
    if (!selectedItem) return false;

    switch (selectedItem.enhanceType) {
      case "upload":
        return uploadedFile !== null;
      case "input":
        return selectedItem.requiredFields?.every(
          field => enhanceFormData[field]?.trim()
        ) ?? false;
      case "form":
        return !!enhanceFormData.details?.trim();
      default:
        return false;
    }
  };

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

        {/* 에러 메시지 */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">진단 실패</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleStartDiagnosis}>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  다시 시도
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions - 이전 단계 & 건너뛰기 */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onPrevious} className="w-full sm:w-auto">
            <ChevronLeft className="h-4 w-4 mr-2" />
            이전 단계
          </Button>
          <Button variant="outline" onClick={onSkip} className="w-full sm:w-auto">
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
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <ClipboardCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-medium">진단 완료</p>
          <p className="text-sm text-muted-foreground">
            {diagnosisItems.length}개 항목을 확인했습니다
            {!allCriticalResolved && " · 항목을 클릭하여 보강하세요"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fitScore !== null && (
            <Badge
              variant="outline"
              className={
                fitScore >= 70
                  ? "bg-green-100 text-green-700 border-green-200"
                  : fitScore >= 50
                    ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                    : "bg-red-100 text-red-700 border-red-200"
              }
            >
              적합도 {fitScore}점
            </Badge>
          )}
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
              onClick={() => handleItemClick(item)}
              className={`
                flex items-start gap-3 p-4 rounded-lg border transition-all
                ${style.border}
                ${item.resolved ? "opacity-50" : "cursor-pointer hover:shadow-md hover:border-primary/50"}
              `}
              role={item.resolved ? undefined : "button"}
              tabIndex={item.resolved ? undefined : 0}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !item.resolved) {
                  handleItemClick(item);
                }
              }}
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
                  {item.resolved && (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-0 text-xs">
                      완료
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {!item.resolved && (
                  <p className="text-xs text-primary mt-1">클릭하여 보강하기</p>
                )}
              </div>
              {!item.resolved && item.severity === "critical" && (
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-4 border-t">
        {!allCriticalResolved && (
          <p className="text-sm text-muted-foreground text-center sm:text-right">
            필수 항목을 보완하거나 건너뛸 수 있습니다
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-2">
          <Button variant="outline" onClick={onPrevious} className="w-full sm:w-auto">
            <ChevronLeft className="h-4 w-4 mr-2" />
            이전 단계
          </Button>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {!allCriticalResolved && (
              <Button variant="outline" onClick={onSkip} className="w-full sm:w-auto">
                <SkipForward className="h-4 w-4 mr-2" />
                건너뛰기
              </Button>
            )}
            <Button onClick={onComplete} disabled={criticalCount > 0 && !onSkip} className="w-full sm:w-auto">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              다음 단계로
            </Button>
          </div>
        </div>
      </div>

      {/* Enhance Modal */}
      <Dialog open={isEnhanceModalOpen} onOpenChange={setIsEnhanceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedItem && (
                <>
                  {(() => {
                    const CategoryIcon = CATEGORY_ICONS[selectedItem.category];
                    return <CategoryIcon className="h-5 w-5 text-primary" />;
                  })()}
                  {selectedItem.title}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedItem?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {renderEnhanceForm()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsEnhanceModalOpen(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleEnhanceSubmit}
              disabled={!isEnhanceFormValid() || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  보강 완료
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
