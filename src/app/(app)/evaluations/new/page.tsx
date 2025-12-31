"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common";
import { useDropzone } from "@/hooks/use-dropzone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Upload, FileText, X } from "lucide-react";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ page: "evaluation-new" });

export default function NewEvaluationPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [businessPlans, setBusinessPlans] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [mode, setMode] = useState<"businessPlan" | "upload">("businessPlan");

  // Business Plan mode
  const [businessPlanId, setBusinessPlanId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [customCriteria, setCustomCriteria] = useState("");

  // Upload mode
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCriteria, setUploadCriteria] = useState("");

  useEffect(() => {
    fetchBusinessPlans();
    fetchProjects();
  }, []);

  const fetchBusinessPlans = async () => {
    try {
      const res = await fetch("/api/business-plans");
      if (res.ok) {
        const data = await res.json();
        setBusinessPlans(data.businessPlans || []);
      }
    } catch (error) {
      logger.error("Fetch business plans error", { error });
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
      logger.error("Fetch projects error", { error });
    }
  };

  const handleFileDrop = useCallback((files: File[]) => {
    if (files.length > 0) {
      setUploadFile(files[0]);
    }
  }, []);

  const handleDropError = useCallback((errorMsg: string) => {
    toast.error(errorMsg);
  }, []);

  const { isDragging, getRootProps, getInputProps, open } = useDropzone({
    accept: [
      "application/pdf",
      "application/haansofthwp",
      "application/x-hwp",
      ".pdf",
      ".hwp",
      ".hwpx",
    ],
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false,
    onDrop: handleFileDrop,
    onError: handleDropError,
  });

  const handleBusinessPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessPlanId,
          criteria: customCriteria || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create evaluation");
      }

      const data = await res.json();
      router.push(`/evaluations/${data.evaluation.id}`);
    } catch (error: any) {
      logger.error("Create evaluation error", { error });
      alert(error.message || "평가 요청에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      alert("파일을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("criteria", uploadCriteria);
      if (selectedProjectId) {
        formData.append("projectId", selectedProjectId);
      }

      const res = await fetch("/api/evaluations/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload file");
      }

      const data = await res.json();
      router.push(`/evaluations/${data.evaluation.id}`);
    } catch (error: any) {
      logger.error("Upload evaluation error", { error });
      alert(error.message || "파일 업로드에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <PageHeader
        title="새 평가 요청"
        description="사업계획서를 AI가 평가하고 피드백을 제공합니다"
        listHref="/evaluations"
        listLabel="평가 목록"
      />

      <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="businessPlan">내 사업계획서</TabsTrigger>
          <TabsTrigger value="upload">파일 업로드</TabsTrigger>
        </TabsList>

        <TabsContent value="businessPlan">
          <Card className="p-6">
            <form onSubmit={handleBusinessPlanSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="businessPlanId">사업계획서 선택</Label>
                <Select
                  value={businessPlanId}
                  onValueChange={(value: string) => setBusinessPlanId(value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="평가할 사업계획서를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.title} ({plan.company.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customCriteria">
                  평가 기준 (선택사항)
                </Label>
                <Textarea
                  id="customCriteria"
                  value={customCriteria}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setCustomCriteria(e.target.value)
                  }
                  placeholder="비워두면 지원사업의 평가 기준을 사용합니다"
                  className="min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground">
                  지원사업에 평가 기준이 없는 경우 반드시 입력해주세요
                </p>
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
                  {isSubmitting ? "평가 중..." : "평가 요청"}
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="upload">
          <Card className="p-6">
            <form onSubmit={handleUploadSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label>파일 선택</Label>
                {!uploadFile ? (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-all",
                      isDragging
                        ? "border-primary bg-primary/5 ring-2 ring-primary"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50"
                    )}
                  >
                    <input {...getInputProps()} />
                    <Upload
                      className={cn(
                        "h-10 w-10 mb-3 transition-transform",
                        isDragging ? "text-primary scale-110" : "text-muted-foreground"
                      )}
                    />
                    <p className="text-sm text-muted-foreground text-center mb-1">
                      {isDragging
                        ? "여기에 파일을 놓으세요"
                        : "파일을 드래그하거나 클릭하여 선택하세요"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, HWP, HWPX | 최대 50MB
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{uploadFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setUploadFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="uploadCriteria">평가 기준</Label>
                <Textarea
                  id="uploadCriteria"
                  value={uploadCriteria}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setUploadCriteria(e.target.value)
                  }
                  placeholder="평가 기준을 입력하세요 (예: 사업성, 기술성, 실현가능성 등)"
                  className="min-h-[150px]"
                  required
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
                  {isSubmitting ? "업로드 중..." : "업로드 및 평가"}
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
