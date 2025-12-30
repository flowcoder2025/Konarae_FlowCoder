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
  Search,
  Info,
  CalendarClock,
} from "lucide-react";
import { useDropzone } from "@/hooks/use-dropzone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";
import {
  ExecutionPlanForm,
  BudgetPlanForm,
  ExpectedOutcomesForm,
} from "@/components/business-plans";
import type {
  ExecutionPlan,
  BudgetPlan,
  ExpectedOutcomes,
} from "@/types/business-plan";
import {
  createEmptyExecutionPlan,
  createEmptyBudgetPlan,
  createEmptyExpectedOutcomes,
} from "@/types/business-plan";

const logger = createLogger({ page: "business-plan-new" });

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
  // 자동 채움용 필드
  amountMax: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface SearchedProject {
  id: string;
  name: string;
  organization: string;
  category: string;
  deadline: string | null;
  isPermanent?: boolean;
  summary: string;
  // 자동 채움용 필드
  amountMax?: string | null;
  startDate?: string | null;
  endDate?: string | null;
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
  const userProjectIdParam = searchParams.get("userProjectId");

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

  // 구조화된 입력 상태
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan>(createEmptyExecutionPlan);
  const [budgetPlan, setBudgetPlan] = useState<BudgetPlan>(createEmptyBudgetPlan);
  const [expectedOutcomes, setExpectedOutcomes] = useState<ExpectedOutcomes>(createEmptyExpectedOutcomes);

  // Messages
  const [noMatchingMessage, setNoMatchingMessage] = useState<string | null>(null);

  // Search mode states
  const [showSearchMode, setShowSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedProject[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearchProject, setSelectedSearchProject] = useState<SearchedProject | null>(null);

  // 사업 기간 계산 함수 (fetchProjectById보다 먼저 정의)
  const calculateDuration = useCallback((startDate: string | null, endDate: string | null): string => {
    if (!startDate || !endDate) return "";
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months <= 0) return "";
    if (months <= 6) return "6개월";
    if (months <= 12) return "12개월";
    if (months <= 18) return "18개월";
    if (months <= 24) return "24개월";
    return "36개월";
  }, []);

  // 지원사업 선택 시 자동 채움 (fetchProjectById보다 먼저 정의)
  const autoFillFromProject = useCallback((project: {
    amountMax?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }) => {
    // 사업 기간 자동 채움
    const duration = calculateDuration(project.startDate || null, project.endDate || null);
    if (duration) {
      setExecutionPlan(prev => ({ ...prev, duration }));
    }

    // 정부지원금 자동 채움
    if (project.amountMax) {
      const amount = parseInt(project.amountMax);
      if (!isNaN(amount) && amount > 0) {
        setBudgetPlan(prev => ({
          ...prev,
          governmentFunding: amount,
          totalAmount: amount + prev.selfFunding,
        }));
        toast.success("지원사업 정보가 자동으로 입력되었습니다", {
          description: `사업기간: ${duration || "미정"}, 정부지원금: ${amount.toLocaleString()}원`,
        });
      }
    }
  }, [calculateDuration]);

  // Fetch a specific project by ID (for URL param case)
  const fetchProjectById = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const project = data.project;
        if (project) {
          // Convert to SearchedProject format
          const searchedProject: SearchedProject = {
            id: project.id,
            name: project.name,
            organization: project.organization || "",
            category: project.category || "",
            deadline: project.deadline,
            isPermanent: project.isPermanent,
            summary: project.summary || "",
            // 자동 채움용 필드 추가
            amountMax: project.amountMax?.toString() || null,
            startDate: project.startDate || null,
            endDate: project.endDate || null,
          };
          setSelectedSearchProject(searchedProject);
          setFormData((prev) => ({ ...prev, projectId: project.id }));
          // 자동 채움 실행
          autoFillFromProject(searchedProject);
        }
      }
    } catch (error) {
      logger.error("Fetch project by id error", { error });
    }
  }, [autoFillFromProject]);

  // Fetch companies on mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Fetch project details if projectIdParam is provided
  useEffect(() => {
    if (projectIdParam && companyIdParam) {
      fetchProjectById(projectIdParam);
    }
  }, [projectIdParam, companyIdParam, fetchProjectById]);

  // Fetch matched projects and existing plans when company changes
  useEffect(() => {
    if (formData.companyId) {
      // Only fetch matched projects if no project is already selected via URL param
      if (!selectedSearchProject) {
        fetchMatchedProjects(formData.companyId);
      }
      fetchExistingPlans(formData.companyId);
    } else {
      setMatchedProjects([]);
      setExistingPlans([]);
      setNoMatchingMessage(null);
    }
    // Reset project selection when company changes (only if not from URL param)
    if (formData.companyId !== companyIdParam && !projectIdParam) {
      setFormData((prev) => ({ ...prev, projectId: "" }));
    }
  }, [formData.companyId, companyIdParam, projectIdParam, selectedSearchProject]);

  const fetchCompanies = async () => {
    setIsLoadingCompanies(true);
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch (error) {
      logger.error("Fetch companies error", { error });
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
      logger.error("Fetch matched projects error", { error });
      setNoMatchingMessage("지원사업을 불러오는데 실패했습니다.");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const fetchExistingPlans = async (companyId: string) => {
    setIsLoadingExistingPlans(true);
    try {
      // 모든 상태의 사업계획서를 가져옴 (참조 자료로 활용 가능)
      // status 필터 제거 - draft, in_progress, completed 모두 표시
      const res = await fetch(`/api/business-plans?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setExistingPlans(data.businessPlans || []);
      }
    } catch (error) {
      logger.error("Fetch existing plans error", { error });
    } finally {
      setIsLoadingExistingPlans(false);
    }
  };

  // Search all projects (including expired/unmatched)
  const searchProjects = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/projects?search=${encodeURIComponent(searchQuery.trim())}&pageSize=20`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.projects || []);
      }
    } catch (error) {
      logger.error("Search projects error", { error });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search on Enter key
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchProjects();
    }
  };

  // Select a project from search results
  const selectSearchedProject = (project: SearchedProject) => {
    setSelectedSearchProject(project);
    setFormData((prev) => ({ ...prev, projectId: project.id }));
    setSearchResults([]);
    setSearchQuery("");
    // 자동 채움
    autoFillFromProject(project);
  };

  // Check if deadline has passed
  const isDeadlinePassed = (deadline: string | null): boolean => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  // Clear search selection and go back to recommended
  const clearSearchSelection = () => {
    setSelectedSearchProject(null);
    setFormData((prev) => ({ ...prev, projectId: "" }));
    setShowSearchMode(false);
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

  const handleFileDrop = useCallback((files: File[]) => {
    const newAttachments: AttachmentFile[] = files
      .filter(
        (file) =>
          file.type === "application/pdf" || file.type.startsWith("image/")
      )
      .map((file) => ({ file }));

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handleDropError = useCallback((errorMsg: string) => {
    toast.error(errorMsg);
  }, []);

  const { isDragging, getRootProps, getInputProps, open } = useDropzone({
    accept: ["application/pdf", "image/*", ".pdf"],
    maxSize: 20 * 1024 * 1024, // 20MB
    multiple: true,
    onDrop: handleFileDrop,
    onError: handleDropError,
  });

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
      // Create business plan with structured data
      const res = await fetch("/api/business-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          referenceBusinessPlanIds: selectedReferencePlanIds,
          // 구조화된 입력 데이터
          executionPlan,
          budgetPlan,
          expectedOutcomes,
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

      // Update UserProject to link with the new business plan
      if (userProjectIdParam) {
        try {
          await fetch(`/api/user-projects/${userProjectIdParam}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              businessPlanId: businessPlanId,
              step3Completed: true,
              currentStep: 4, // Advance to next step
            }),
          });
        } catch (error) {
          logger.error("Failed to update user project", { error });
          // Don't block the flow, just log the error
        }
      }

      router.push(`/business-plans/${businessPlanId}`);
    } catch (error) {
      logger.error("Create business plan error", { error });
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
            <div className="space-y-4">
              <Label htmlFor="projectId">지원사업 선택</Label>
              {!formData.companyId ? (
                <p className="text-sm text-muted-foreground">
                  먼저 기업을 선택하세요
                </p>
              ) : (
                <>
                  {/* Selected Search Project Display */}
                  {selectedSearchProject && (
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium">{selectedSearchProject.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {selectedSearchProject.organization} | {selectedSearchProject.category}
                          </div>
                          {selectedSearchProject.deadline && (
                            <div className="flex items-center gap-1 mt-1">
                              <CalendarClock className="h-3 w-3" />
                              <span className={`text-xs ${isDeadlinePassed(selectedSearchProject.deadline) ? "text-destructive" : "text-muted-foreground"}`}>
                                마감: {new Date(selectedSearchProject.deadline).toLocaleDateString("ko-KR")}
                                {isDeadlinePassed(selectedSearchProject.deadline) && " (마감됨)"}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearSearchSelection}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {isDeadlinePassed(selectedSearchProject.deadline) && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          마감된 사업입니다. 다음 공고를 대비한 연습용으로 활용하세요.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recommended Projects Section */}
                  {!showSearchMode && !selectedSearchProject && (
                    <div className="space-y-3">
                      {isLoadingProjects ? (
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
                      ) : matchedProjects.length > 0 ? (
                        <>
                          <Select
                            value={formData.projectId}
                            onValueChange={(value: string) => {
                              setFormData({ ...formData, projectId: value });
                              // 자동 채움
                              const project = matchedProjects.find(p => p.id === value);
                              if (project) {
                                autoFillFromProject(project);
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="추천 지원사업을 선택하세요" />
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

                          {/* Info message for recommended projects */}
                          <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg text-sm">
                            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">
                              매칭 점수 50점 이상, 접수 중인 지원사업만 표시됩니다.
                            </span>
                          </div>

                          {/* Selected Project Details */}
                          {selectedProject && (
                            <div className="p-3 bg-muted rounded-lg text-sm">
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
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <AlertCircle className="h-4 w-4" />
                          <span>추천 조건에 맞는 지원사업이 없습니다.</span>
                        </div>
                      )}

                      {/* Toggle to Search Mode */}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowSearchMode(true)}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        다른 지원사업 직접 검색
                      </Button>
                    </div>
                  )}

                  {/* Search Mode Section */}
                  {showSearchMode && !selectedSearchProject && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="지원사업명, 기관명으로 검색..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={handleSearchKeyDown}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={searchProjects}
                          disabled={isSearching || !searchQuery.trim()}
                        >
                          {isSearching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Warning for search mode */}
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <span className="text-amber-700 dark:text-amber-400">
                          마감된 사업이나 매칭되지 않은 사업도 검색됩니다.
                          다음 공고를 대비한 연습용으로 활용할 수 있습니다.
                        </span>
                      </div>

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                        <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                          {searchResults.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              className="w-full p-3 text-left hover:bg-muted border-b last:border-b-0 transition-colors"
                              onClick={() => selectSearchedProject(project)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{project.name}</div>
                                  <div className="text-sm text-muted-foreground truncate">
                                    {project.organization}
                                  </div>
                                </div>
                                {project.deadline && (
                                  <div className={`text-xs shrink-0 ${isDeadlinePassed(project.deadline) ? "text-destructive" : "text-muted-foreground"}`}>
                                    {isDeadlinePassed(project.deadline) ? "마감됨" : new Date(project.deadline).toLocaleDateString("ko-KR")}
                                  </div>
                                )}
                                {project.isPermanent && (
                                  <Badge variant="secondary" className="text-xs shrink-0">상시</Badge>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* No results message */}
                      {searchResults.length === 0 && searchQuery && !isSearching && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          검색 결과가 없습니다. 다른 키워드로 검색해보세요.
                        </p>
                      )}

                      {/* Back to recommended */}
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                          setShowSearchMode(false);
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                      >
                        추천 지원사업으로 돌아가기
                      </Button>
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
                placeholder="신규 사업의 목적, 내용, 기대 효과를 상세히 작성해주세요. 해결하고자 하는 문제, 해결 방안, 목표 시장, 차별화 포인트 등을 포함하면 좋습니다."
                className="min-h-[150px]"
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

        {/* 추진 계획 Card */}
        <Card>
          <CardHeader>
            <CardTitle>추진 계획</CardTitle>
            <p className="text-sm text-muted-foreground">
              사업 기간과 단계별 추진 일정을 입력하세요
            </p>
          </CardHeader>
          <CardContent>
            <ExecutionPlanForm
              value={executionPlan}
              onChange={setExecutionPlan}
            />
          </CardContent>
        </Card>

        {/* 예산 계획 Card */}
        <Card>
          <CardHeader>
            <CardTitle>예산 계획</CardTitle>
            <p className="text-sm text-muted-foreground">
              총 사업비와 재원 조달 계획을 입력하세요
            </p>
          </CardHeader>
          <CardContent>
            <BudgetPlanForm
              value={budgetPlan}
              onChange={setBudgetPlan}
            />
          </CardContent>
        </Card>

        {/* 기대 효과 Card */}
        <Card>
          <CardHeader>
            <CardTitle>기대 효과</CardTitle>
            <p className="text-sm text-muted-foreground">
              사업 완료 후 달성할 정량적 목표를 입력하세요
            </p>
          </CardHeader>
          <CardContent>
            <ExpectedOutcomesForm
              value={expectedOutcomes}
              onChange={setExpectedOutcomes}
            />
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
              <div
                {...getRootProps()}
                className={cn(
                  "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all",
                  isDragging
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                <input {...getInputProps()} />
                <Upload
                  className={cn(
                    "h-8 w-8 mb-2 transition-transform",
                    isDragging ? "text-primary scale-110" : "text-muted-foreground"
                  )}
                />
                <p className="text-sm text-muted-foreground text-center">
                  {isDragging
                    ? "여기에 파일을 놓으세요"
                    : "파일을 드래그하거나 클릭하여 선택하세요"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF 또는 이미지 | 최대 20MB
                </p>
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{plan.title}</span>
                            <Badge
                              variant={
                                plan.status === "completed"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {plan.status === "completed"
                                ? "완료"
                                : plan.status === "in_progress"
                                  ? "작성중"
                                  : "초안"}
                            </Badge>
                          </div>
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
            disabled={isSubmitting || !formData.title}
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
