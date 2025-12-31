"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionEditor } from "@/components/business-plans/section-editor";
import Link from "next/link";
import { PageHeader } from "@/components/common";
import { Loader2, Sparkles, AlertTriangle, FileDown, Plus, FileText, Image } from "lucide-react";
import { createLogger } from "@/lib/logger";
import { toast } from "sonner";
import { captureMermaidDiagrams, countMermaidInSections, type MermaidImage } from "@/lib/mermaid-to-image";

const logger = createLogger({ page: "business-plan-detail" });

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  in_progress: "작성 중",
  completed: "완료",
  submitted: "제출",
};

export default function BusinessPlanDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [businessPlan, setBusinessPlan] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [showHwpModal, setShowHwpModal] = useState(false);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [isInitializingTemplate, setIsInitializingTemplate] = useState(false);

  // 페이지 이탈 경고 (생성 중일 때)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isGenerating) {
        e.preventDefault();
        // 브라우저에 따라 커스텀 메시지가 표시되지 않을 수 있음
        return "사업계획서가 생성 중입니다. 페이지를 떠나도 서버에서 생성이 계속됩니다.";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isGenerating]);

  useEffect(() => {
    fetchBusinessPlan();
  }, [id]);

  const fetchBusinessPlan = async () => {
    try {
      const res = await fetch(`/api/business-plans/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch business plan");
      }
      const data = await res.json();
      setBusinessPlan(data.businessPlan);
    } catch (error) {
      logger.error("Fetch business plan error", { error });
      alert("사업계획서를 불러올 수 없습니다.");
      router.push("/business-plans");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAll = async () => {
    if (
      !confirm(
        "AI가 전체 사업계획서를 생성합니다. 기존 내용은 모두 삭제됩니다. 계속하시겠습니까?\n\n⚠️ 생성에 1~3분 정도 소요됩니다. 페이지를 떠나도 서버에서 생성이 계속됩니다."
      )
    ) {
      return;
    }

    setIsGenerating(true);
    setGenerationStartTime(Date.now());
    try {
      const res = await fetch(`/api/business-plans/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate business plan");
      }

      await fetchBusinessPlan();
      alert("사업계획서가 성공적으로 생성되었습니다.");
    } catch (error) {
      logger.error("Generate business plan error", { error });
      alert("사업계획서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsGenerating(false);
      setGenerationStartTime(null);
    }
  };

  const handleExport = async (format: "pdf" | "docx") => {
    setIsExporting(true);
    setExportMessage("");

    try {
      let mermaidImages: MermaidImage[] = [];

      // PDF/DOCX 내보내기 시 Mermaid 다이어그램 캡처
      if (businessPlan?.sections) {
        const mermaidCount = countMermaidInSections(businessPlan.sections);

        if (mermaidCount > 0) {
          setExportMessage(`다이어그램 캡처 중... (${mermaidCount}개)`);

          // Mermaid 다이어그램 캡처
          const captureResult = await captureMermaidDiagrams("body", {
            scale: 2,
            backgroundColor: "#ffffff",
            maxWidth: 600,
          });

          // 디버그 로깅
          console.log("[Export] Mermaid capture result:", {
            success: captureResult.success,
            imageCount: captureResult.images.length,
            errors: captureResult.errors,
          });

          if (captureResult.success && captureResult.images.length > 0) {
            mermaidImages = captureResult.images;
            setExportMessage(`다이어그램 ${mermaidImages.length}개 캡처 완료`);
            console.log("[Export] Mermaid images captured:", mermaidImages.length);
          } else {
            console.warn("[Export] Mermaid capture failed or empty:", captureResult.errors);
          }

          // 잠시 대기 후 다음 단계로
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      setExportMessage("문서 생성 중...");

      // 디버그 로깅
      console.log("[Export] Sending request with mermaidImages:", mermaidImages.length);

      const res = await fetch(`/api/business-plans/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          mermaidImages: mermaidImages.length > 0 ? mermaidImages : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to export business plan");
      }

      setExportMessage("다운로드 준비 중...");

      // Content-Disposition 헤더에서 파일명 추출 (RFC 5987 한글 지원)
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `사업계획서.${format}`;

      if (contentDisposition) {
        // filename*=UTF-8'' 형식 우선 (한글 지원)
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/i);
        if (utf8Match) {
          try {
            filename = decodeURIComponent(utf8Match[1]);
          } catch {
            // 디코딩 실패 시 ASCII 버전 사용
          }
        }

        // UTF-8 버전이 없으면 일반 filename 사용
        if (filename === `사업계획서.${format}`) {
          const basicMatch = contentDisposition.match(/filename="(.+?)"/);
          if (basicMatch) {
            filename = basicMatch[1];
          }
        }
      }

      // Blob으로 변환 후 다운로드
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("내보내기 완료", {
        description: `${filename} 다운로드됨`,
      });
    } catch (error) {
      logger.error("Export business plan error", { error });
      toast.error("내보내기에 실패했습니다.");
    } finally {
      setIsExporting(false);
      setExportMessage("");
    }
  };

  // 빈 템플릿으로 시작
  const handleInitializeTemplate = async () => {
    setIsInitializingTemplate(true);
    try {
      const res = await fetch(`/api/business-plans/${id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "template" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "템플릿 초기화 실패");
      }

      const data = await res.json();

      // 적용된 데이터 안내 메시지 생성
      const appliedItems: string[] = [];
      if (data.appliedData?.companyProfile) appliedItems.push("기업 프로필");
      if (data.appliedData?.projectInfo) appliedItems.push("지원사업 정보");
      if (data.appliedData?.executionPlan) appliedItems.push("추진 계획");
      if (data.appliedData?.budgetPlan) appliedItems.push("예산 계획");
      if (data.appliedData?.expectedOutcomes) appliedItems.push("기대 효과");

      if (appliedItems.length > 0) {
        toast.success("템플릿에 입력하신 정보가 자동 적용되었습니다", {
          description: `적용 항목: ${appliedItems.join(", ")}`,
          duration: 5000,
        });
      } else {
        toast.success("기본 템플릿이 생성되었습니다. 각 섹션을 수정해주세요.");
      }

      await fetchBusinessPlan();
    } catch (error) {
      logger.error("Initialize template error", { error });
      toast.error(error instanceof Error ? error.message : "템플릿 초기화에 실패했습니다.");
    } finally {
      setIsInitializingTemplate(false);
    }
  };

  // 새 섹션 추가
  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) {
      toast.error("섹션 제목을 입력해주세요.");
      return;
    }

    setIsAddingSection(true);
    try {
      const res = await fetch(`/api/business-plans/${id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSectionTitle.trim(),
          content: `## ${newSectionTitle.trim()}\n\n내용을 작성해주세요.`,
        }),
      });

      if (!res.ok) {
        throw new Error("섹션 추가 실패");
      }

      toast.success("새 섹션이 추가되었습니다.");
      setShowAddSectionModal(false);
      setNewSectionTitle("");
      await fetchBusinessPlan();
    } catch (error) {
      logger.error("Add section error", { error });
      toast.error("섹션 추가에 실패했습니다.");
    } finally {
      setIsAddingSection(false);
    }
  };

  // 섹션 삭제
  const handleDeleteSection = async (sectionIndex: number) => {
    if (!confirm("이 섹션을 삭제하시겠습니까?")) {
      return;
    }

    try {
      const res = await fetch(`/api/business-plans/${id}/sections/${sectionIndex}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("섹션 삭제 실패");
      }

      toast.success("섹션이 삭제되었습니다.");
      await fetchBusinessPlan();
    } catch (error) {
      logger.error("Delete section error", { error });
      toast.error("섹션 삭제에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!businessPlan) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <PageHeader
        title={businessPlan.title}
        description={businessPlan.company.name}
        listHref="/business-plans"
        listLabel="사업계획서 목록"
        actions={
          <div className="flex items-center gap-2">
            <Badge>{STATUS_LABELS[businessPlan.status] || businessPlan.status}</Badge>
            {businessPlan.project && (
              <span className="text-sm text-muted-foreground">
                {businessPlan.project.name} ({businessPlan.project.organization})
              </span>
            )}
          </div>
        }
      />

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <Button
          onClick={handleGenerateAll}
          disabled={isGenerating}
          variant="outline"
        >
          {isGenerating ? "생성 중..." : "전체 AI 생성"}
        </Button>
        <Button
          onClick={() => handleExport("pdf")}
          variant="outline"
          disabled={isExporting}
          className="min-w-[140px]"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {exportMessage || "내보내기 중..."}
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4 mr-2" />
              PDF 내보내기
            </>
          )}
        </Button>
        <Button
          onClick={() => handleExport("docx")}
          variant="outline"
          disabled={isExporting}
          className="min-w-[140px]"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {exportMessage || "내보내기 중..."}
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4 mr-2" />
              DOCX 내보내기
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowHwpModal(true)}
          variant="outline"
        >
          <FileDown className="h-4 w-4 mr-2" />
          HWP 내보내기
        </Button>
      </div>

      {/* HWP 준비중 모달 */}
      <Dialog open={showHwpModal} onOpenChange={setShowHwpModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>HWP 내보내기 준비중</DialogTitle>
            <DialogDescription>
              HWP 형식 내보내기 기능은 현재 개발 중입니다.
              <br />
              빠른 시일 내에 제공될 예정이니 조금만 기다려 주세요.
              <br />
              <br />
              당분간은 DOCX 파일로 내보낸 후 한글(HWP) 프로그램에서 열어 저장해 주세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowHwpModal(false)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 생성 중 로딩 UI */}
      {isGenerating && (
        <Card className="mb-6 border-primary/50 bg-primary/5">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <Sparkles className="h-5 w-5 text-primary absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  AI가 사업계획서를 작성하고 있습니다
                </h3>
                <p className="text-muted-foreground text-sm max-w-md">
                  지원사업 공고문, 기업 정보, 참조 사업계획서를 분석하여
                  <br />
                  맞춤형 사업계획서를 생성 중입니다.
                </p>
                <p className="text-xs text-muted-foreground">
                  예상 소요 시간: 1~3분
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  페이지를 떠나도 서버에서 생성이 계속됩니다
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      {businessPlan.sections && businessPlan.sections.length > 0 ? (
        <div className="space-y-6">
          {businessPlan.sections.map((section: any) => (
            <SectionEditor
              key={section.id}
              section={section}
              businessPlanId={id}
              onUpdate={fetchBusinessPlan}
              onDelete={() => handleDeleteSection(section.sectionIndex)}
            />
          ))}

          {/* 섹션 추가 버튼 */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => setShowAddSectionModal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              새 섹션 추가
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg">
          {isGenerating || isInitializingTemplate ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">
                {isGenerating ? "AI 생성 중..." : "템플릿 생성 중..."}
              </p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">사업계획서 작성 시작</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                AI를 사용해 자동 생성하거나, 빈 템플릿으로 직접 작성할 수 있습니다.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleInitializeTemplate}>
                  <FileText className="h-4 w-4 mr-2" />
                  빈 템플릿으로 시작
                </Button>
                <Button onClick={handleGenerateAll}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI로 자동 생성
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                빈 템플릿을 선택하면 무료로 직접 작성할 수 있습니다
              </p>
            </>
          )}
        </div>
      )}

      {/* 새 섹션 추가 모달 */}
      <Dialog open={showAddSectionModal} onOpenChange={setShowAddSectionModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>새 섹션 추가</DialogTitle>
            <DialogDescription>
              추가할 섹션의 제목을 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="new-section-title">섹션 제목</Label>
              <Input
                id="new-section-title"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                placeholder="예: 기대 효과"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isAddingSection) {
                    handleAddSection();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddSectionModal(false);
                setNewSectionTitle("");
              }}
              disabled={isAddingSection}
            >
              취소
            </Button>
            <Button onClick={handleAddSection} disabled={isAddingSection || !newSectionTitle.trim()}>
              {isAddingSection ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  추가 중...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  추가
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
