"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionEditor } from "@/components/business-plans/section-editor";
import Link from "next/link";
import { PageHeader } from "@/components/common";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  in_progress: "작성 중",
  completed: "완료",
  submitted: "제출",
};

export default function BusinessPlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [businessPlan, setBusinessPlan] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );

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
      console.error("Fetch business plan error:", error);
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
      console.error("Generate business plan error:", error);
      alert("사업계획서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsGenerating(false);
      setGenerationStartTime(null);
    }
  };

  const handleExport = async (format: "pdf" | "docx" | "hwp") => {
    try {
      const res = await fetch(`/api/business-plans/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });

      if (!res.ok) {
        throw new Error("Failed to export business plan");
      }

      const data = await res.json();
      alert(data.message);
    } catch (error) {
      console.error("Export business plan error:", error);
      alert("내보내기에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!businessPlan) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
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
        <Button onClick={() => handleExport("pdf")} variant="outline">
          PDF 내보내기
        </Button>
        <Button onClick={() => handleExport("docx")} variant="outline">
          DOCX 내보내기
        </Button>
        <Button onClick={() => handleExport("hwp")} variant="outline">
          HWP 내보내기
        </Button>
      </div>

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
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg">
          {isGenerating ? (
            <p className="text-muted-foreground">생성 중...</p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">
                아직 작성된 섹션이 없습니다
              </p>
              <Button onClick={handleGenerateAll}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI로 사업계획서 생성하기
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
