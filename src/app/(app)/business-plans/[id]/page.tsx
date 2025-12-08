"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionEditor } from "@/components/business-plans/section-editor";
import Link from "next/link";
import { PageHeader } from "@/components/common";

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
        "AI가 전체 사업계획서를 생성합니다. 기존 내용은 모두 삭제됩니다. 계속하시겠습니까?"
      )
    ) {
      return;
    }

    setIsGenerating(true);
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
      alert("사업계획서 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
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
          <p className="text-muted-foreground mb-4">
            아직 작성된 섹션이 없습니다
          </p>
          <Button onClick={handleGenerateAll} disabled={isGenerating}>
            {isGenerating ? "생성 중..." : "AI로 사업계획서 생성하기"}
          </Button>
        </div>
      )}
    </div>
  );
}
