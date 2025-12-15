"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
}

interface MatchedProject {
  id: string;
  name: string;
  organization: string;
  category: string;
  matchingScore: number;
  confidence: string;
  deadline: string | null;
  isPermanent: boolean;
  hasEvaluationCriteria: boolean;
}

interface ExistingPlan {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  projectName?: string;
}

interface AttachmentFile {
  file: File;
  preview?: string;
}

function NewBusinessPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyIdParam = searchParams.get("companyId");
  const projectIdParam = searchParams.get("projectId");

  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingExistingPlans, setIsLoadingExistingPlans] = useState(false);

  // Data states
  const [companies, setCompanies] = useState<Company[]>([]);
  const [matchedProjects, setMatchedProjects] = useState<MatchedProject[]>([]);
  const [existingPlans, setExistingPlans] = useState<ExistingPlan[]>([]);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [selectedReferencePlanIds, setSelectedReferencePlanIds] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    companyId: companyIdParam || "",
    projectId: projectIdParam || "",
    newBusinessDescription: "",
    additionalNotes: "",
  });

  // Messages
  const [noMatchingMessage, setNoMatchingMessage] = useState<string | null>(null);

  // Fetch companies on mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Fetch matched projects and existing plans when company changes
  useEffect(() => {
    if (formData.companyId) {
      fetchMatchedProjects(formData.companyId);
      fetchExistingPlans(formData.companyId);
    } else {
      setMatchedProjects([]);
      setExistingPlans([]);
      setNoMatchingMessage(null);
    }
    // Reset project selection when company changes
    if (formData.companyId !== companyIdParam) {
      setFormData((prev) => ({ ...prev, projectId: "" }));
    }
  }, [formData.companyId, companyIdParam]);

  const fetchCompanies = async () => {
    setIsLoadingCompanies(true);
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch (error) {
      console.error("Fetch companies error:", error);
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  const fetchMatchedProjects = async (companyId: string) => {
    setIsLoadingProjects(true);
    setNoMatchingMessage(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/matched-projects`);
      if (res.ok) {
        const data = await res.json();
        setMatchedProjects(data.projects || []);
        if (data.projects.length === 0) {
          setNoMatchingMessage(
            "매칭된 지원사업이 없습니다. 먼저 매칭을 실행해주세요."
          );
        }
      }
    } catch (error) {
      console.error("Fetch matched projects error:", error);
      setNoMatchingMessage("지원사업을 불러오는데 실패했습니다.");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const fetchExistingPlans = async (companyId: string) => {
    setIsLoadingExistingPlans(true);
    try {
      const res = await fetch(
        `/api/business-plans?companyId=${companyId}&status=completed`
      );
      if (res.ok) {
        const data = await res.json();
        setExistingPlans(data.businessPlans || []);
      }
    } catch (error) {
      console.error("Fetch existing plans error:", error);
    } finally {
      setIsLoadingExistingPlans(false);
    }
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const newAttachments: AttachmentFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Validate file type
        if (
          file.type === "application/pdf" ||
          file.type.startsWith("image/")
        ) {
          newAttachments.push({ file });
        }
      }
      setAttachments((prev) => [...prev, ...newAttachments]);
      e.target.value = ""; // Reset input
    },
    []
  );

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleReferencePlan = (planId: string) => {
    setSelectedReferencePlanIds((prev) =>
      prev.includes(planId)
        ? prev.filter((id) => id !== planId)
        : [...prev, planId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create business plan
      const res = await fetch("/api/business-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          referenceBusinessPlanIds: selectedReferencePlanIds,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create business plan");
      }

      const data = await res.json();
      const businessPlanId = data.businessPlan.id;

      // Upload attachments if any
      if (attachments.length > 0) {
        for (const attachment of attachments) {
          const formDataUpload = new FormData();
          formDataUpload.append("file", attachment.file);

          await fetch(`/api/business-plans/${businessPlanId}/attachments`, {
            method: "POST",
            body: formDataUpload,
          });
        }
      }

      router.push(`/business-plans/${businessPlanId}`);
    } catch (error) {
      console.error("Create business plan error:", error);
      alert("사업계획서 생성에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProject = matchedProjects.find(
    (p) => p.id === formData.projectId
  );

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <PageHeader
        title="새 사업계획서 작성"
        description="기본 정보를 입력하고 AI가 사업계획서를 생성합니다"
        listHref="/business-plans"
        listLabel="사업계획서 목록"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">사업계획서 제목 *</Label>
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

            {/* Company Selection */}
            <div className="space-y-2">
              <Label htmlFor="companyId">기업 선택 *</Label>
              {isLoadingCompanies ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  기업 목록 로딩 중...
                </div>
              ) : companies.length === 0 ? (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>등록된 기업이 없습니다.</span>
                  <Link href="/companies/new" className="underline">
                    기업 등록하기
                  </Link>
                </div>
              ) : (
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
              )}
            </div>

            {/* Support Project Selection */}
            <div className="space-y-2">
              <Label htmlFor="projectId">지원사업 선택</Label>
              {!formData.companyId ? (
                <p className="text-sm text-muted-foreground">
                  먼저 기업을 선택하세요
                </p>
              ) : isLoadingProjects ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  매칭된 지원사업 로딩 중...
                </div>
              ) : noMatchingMessage ? (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>{noMatchingMessage}</span>
                  <Link href="/matching/new" className="underline">
                    매칭 실행하기
                  </Link>
                </div>
              ) : (
                <>
                  <Select
                    value={formData.projectId}
                    onValueChange={(value: string) =>
                      setFormData({ ...formData, projectId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="지원사업을 선택하세요 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      {matchedProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <div className="flex items-center gap-2">
                            <span>{project.name}</span>
                            <Badge
                              variant={
                                project.confidence === "high"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {project.matchingScore}점
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProject && (
                    <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
                      <div className="font-medium">{selectedProject.name}</div>
                      <div className="text-muted-foreground">
                        {selectedProject.organization} | {selectedProject.category}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline">
                          매칭점수: {selectedProject.matchingScore}점
                        </Badge>
                        {selectedProject.hasEvaluationCriteria && (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            평가기준 있음
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Business Description Card */}
        <Card>
          <CardHeader>
            <CardTitle>사업 설명</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newBusinessDescription">신규 사업 설명 *</Label>
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
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">추가 참고사항</Label>
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
          </CardContent>
        </Card>

        {/* Reference Materials Card */}
        <Card>
          <CardHeader>
            <CardTitle>참고 자료</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Attachments */}
            <div className="space-y-2">
              <Label>파일 첨부 (PDF, 이미지)</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>파일 선택</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <span className="text-sm text-muted-foreground">
                  PDF 또는 이미지 파일을 업로드하세요
                </span>
              </div>

              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((attachment, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{attachment.file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round(attachment.file.size / 1024)}KB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reference Existing Plans */}
            {formData.companyId && (
              <div className="space-y-2">
                <Label>기존 사업계획서 참조</Label>
                {isLoadingExistingPlans ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    기존 사업계획서 로딩 중...
                  </div>
                ) : existingPlans.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    참조할 수 있는 기존 사업계획서가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {existingPlans.map((plan) => (
                      <div
                        key={plan.id}
                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted"
                      >
                        <Checkbox
                          id={plan.id}
                          checked={selectedReferencePlanIds.includes(plan.id)}
                          onCheckedChange={() => toggleReferencePlan(plan.id)}
                        />
                        <label
                          htmlFor={plan.id}
                          className="flex-1 text-sm cursor-pointer"
                        >
                          <div className="font-medium">{plan.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {plan.projectName && `${plan.projectName} | `}
                            {new Date(plan.createdAt).toLocaleDateString("ko-KR")}
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            취소
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isSubmitting || !formData.companyId || !formData.title}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                생성 중...
              </>
            ) : (
              "사업계획서 생성"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewBusinessPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-8 max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <NewBusinessPlanForm />
    </Suspense>
  );
}
