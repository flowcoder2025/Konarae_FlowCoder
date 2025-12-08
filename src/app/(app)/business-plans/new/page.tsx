"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common";

function NewBusinessPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyIdParam = searchParams.get("companyId");
  const projectIdParam = searchParams.get("projectId");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: "",
    companyId: companyIdParam || "",
    projectId: projectIdParam || "",
    newBusinessDescription: "",
    additionalNotes: "",
  });

  useEffect(() => {
    fetchCompanies();
    fetchProjects();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch (error) {
      console.error("Fetch companies error:", error);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Fetch projects error:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/business-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to create business plan");
      }

      const data = await res.json();
      router.push(`/business-plans/${data.businessPlan.id}`);
    } catch (error) {
      console.error("Create business plan error:", error);
      alert("사업계획서 생성에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <PageHeader
        title="새 사업계획서 작성"
        description="기본 정보를 입력하고 AI가 사업계획서를 생성합니다"
        listHref="/business-plans"
        listLabel="사업계획서 목록"
      />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">사업계획서 제목</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="예: 2025년 AI 기반 고객 관리 시스템 개발"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyId">기업 선택</Label>
            <Select
              value={formData.companyId}
              onValueChange={(value: string) =>
                setFormData({ ...formData, companyId: value })
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="기업을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectId">지원사업 선택 (선택사항)</Label>
            <Select
              value={formData.projectId}
              onValueChange={(value: string) =>
                setFormData({ ...formData, projectId: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="지원사업을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} ({project.organization})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newBusinessDescription">신규 사업 설명</Label>
            <Textarea
              id="newBusinessDescription"
              value={formData.newBusinessDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setFormData({
                  ...formData,
                  newBusinessDescription: e.target.value,
                })
              }
              placeholder="신규 사업의 목적, 내용, 기대 효과를 상세히 작성해주세요"
              className="min-h-[150px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalNotes">추가 참고사항 (선택사항)</Label>
            <Textarea
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setFormData({ ...formData, additionalNotes: e.target.value })
              }
              placeholder="AI가 사업계획서를 작성할 때 참고할 추가 정보를 입력하세요"
              className="min-h-[100px]"
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => router.back()}
            >
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? "생성 중..." : "사업계획서 생성"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function NewBusinessPlanPage() {
  return (
    <Suspense fallback={<div className="container mx-auto py-8 max-w-7xl"><p>로딩 중...</p></div>}>
      <NewBusinessPlanForm />
    </Suspense>
  );
}
