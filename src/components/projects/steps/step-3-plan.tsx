"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  CheckCircle2,
  PenLine,
  Sparkles,
  Building2,
  Target,
  Calendar,
  Users,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface BusinessPlanSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  completed: boolean;
  wordCount?: number;
}

interface Step3PlanProps {
  projectId: string;
  companyId: string;
  existingPlanId: string | null;
  onComplete: () => void;
}

const PLAN_SECTIONS: Omit<BusinessPlanSection, "completed" | "wordCount">[] = [
  {
    id: "company",
    title: "기업 개요",
    description: "기업 소개, 연혁, 조직도",
    icon: Building2,
  },
  {
    id: "project",
    title: "사업 개요",
    description: "사업 목적, 필요성, 추진 배경",
    icon: Target,
  },
  {
    id: "execution",
    title: "수행 계획",
    description: "추진 일정, 세부 내용, 방법론",
    icon: Calendar,
  },
  {
    id: "team",
    title: "수행 역량",
    description: "참여 인력, 전문성, 수행 실적",
    icon: Users,
  },
  {
    id: "budget",
    title: "사업 예산",
    description: "비용 산정, 자부담 계획",
    icon: FileText,
  },
];

export function Step3Plan({
  projectId,
  companyId,
  existingPlanId,
  onComplete,
}: Step3PlanProps) {
  const router = useRouter();

  // AI 초안 생성 모달 상태
  const [showAiModal, setShowAiModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiFormData, setAiFormData] = useState({
    title: "",
    newBusinessDescription: "",
  });

  // Mock data - in real implementation, fetch from API
  const sections: BusinessPlanSection[] = PLAN_SECTIONS.map((section, idx) => ({
    ...section,
    completed: idx < 2, // Mock: first 2 sections completed
    wordCount: idx < 2 ? 150 + idx * 50 : undefined,
  }));

  const completedCount = sections.filter((s) => s.completed).length;
  const progress = (completedCount / sections.length) * 100;

  // 새로 작성하기 - /business-plans/new 페이지로 이동
  const handleNewPlan = () => {
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (projectId) params.set("projectId", projectId);
    router.push(`/business-plans/new?${params.toString()}`);
  };

  // AI 초안 생성 - 모달에서 간단한 정보 입력 후 바로 생성
  const handleAiGenerate = async () => {
    if (!aiFormData.title.trim() || !aiFormData.newBusinessDescription.trim()) {
      toast.error("제목과 사업 설명을 입력해주세요");
      return;
    }

    setIsGenerating(true);
    try {
      // 1. 사업계획서 생성
      const createRes = await fetch("/api/business-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          projectId,
          title: aiFormData.title,
          newBusinessDescription: aiFormData.newBusinessDescription,
        }),
      });

      if (!createRes.ok) {
        throw new Error("사업계획서 생성 실패");
      }

      const { businessPlan } = await createRes.json();

      // 2. AI 생성 시작
      const generateRes = await fetch(
        `/api/business-plans/${businessPlan.id}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "all" }),
        }
      );

      if (!generateRes.ok) {
        // 생성 실패해도 상세 페이지로 이동 (수동 생성 가능)
        toast.error("AI 생성 시작 실패. 상세 페이지에서 다시 시도해주세요.");
      } else {
        toast.success("AI가 사업계획서를 생성하고 있습니다");
      }

      // 3. 상세 페이지로 이동
      setShowAiModal(false);
      router.push(`/business-plans/${businessPlan.id}`);
    } catch (error) {
      toast.error("사업계획서 생성에 실패했습니다");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!existingPlanId) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">사업계획서 작성</p>
              <p className="text-sm text-muted-foreground mt-1">
                블록 기반 에디터로 쉽게 사업계획서를 작성할 수 있습니다.
                기업 마스터 프로필에서 정보를 불러올 수 있어요.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <PenLine className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">새 사업계획서 작성</h3>
            <p className="text-muted-foreground mb-6">
              공고에 맞는 사업계획서 템플릿으로
              <br />
              빠르게 시작하세요
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setShowAiModal(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI 초안 생성
              </Button>
              <Button onClick={handleNewPlan}>
                <Plus className="h-4 w-4 mr-2" />
                새로 작성하기
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI 초안 생성 모달 */}
        <Dialog open={showAiModal} onOpenChange={setShowAiModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI 초안 생성
              </DialogTitle>
              <DialogDescription>
                간단한 정보를 입력하면 AI가 사업계획서 초안을 작성합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ai-title">사업계획서 제목 *</Label>
                <Input
                  id="ai-title"
                  value={aiFormData.title}
                  onChange={(e) =>
                    setAiFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="예: 2025년 AI 기반 고객 관리 시스템 개발"
                  disabled={isGenerating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-description">신규 사업 설명 *</Label>
                <Textarea
                  id="ai-description"
                  value={aiFormData.newBusinessDescription}
                  onChange={(e) =>
                    setAiFormData((prev) => ({
                      ...prev,
                      newBusinessDescription: e.target.value,
                    }))
                  }
                  placeholder="신규 사업의 목적, 내용, 기대 효과를 간략히 작성해주세요"
                  className="min-h-[120px]"
                  disabled={isGenerating}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAiModal(false)}
                disabled={isGenerating}
              >
                취소
              </Button>
              <Button
                onClick={handleAiGenerate}
                disabled={
                  isGenerating ||
                  !aiFormData.title.trim() ||
                  !aiFormData.newBusinessDescription.trim()
                }
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI로 작성하기
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">사업계획서 작성 중</p>
            <p className="text-sm text-muted-foreground">
              {completedCount}/{sections.length} 섹션 완료
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">{Math.round(progress)}%</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/business-plans/${existingPlanId}`}>
              <PenLine className="h-4 w-4 mr-2" />
              편집하기
            </Link>
          </Button>
        </div>
      </div>

      {/* Section List */}
      <div className="space-y-3">
        {sections.map((section) => {
          const SectionIcon = section.icon;

          return (
            <Card
              key={section.id}
              className={`transition-colors ${section.completed ? "border-primary/30" : ""}`}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      section.completed
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {section.completed ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <SectionIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{section.title}</span>
                      {section.completed && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-0">
                          완료
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                  {section.wordCount && (
                    <span className="text-sm text-muted-foreground shrink-0">
                      {section.wordCount}자
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          {completedCount === sections.length
            ? "모든 섹션이 완료되었습니다"
            : `${sections.length - completedCount}개 섹션을 더 작성해주세요`}
        </p>
        <Button onClick={onComplete} disabled={completedCount !== sections.length}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          다음 단계로
        </Button>
      </div>
    </div>
  );
}
