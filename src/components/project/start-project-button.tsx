"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Rocket, Loader2, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Company {
  id: string;
  name: string;
}

interface ExistingProject {
  id: string;
  companyName: string;
}

interface StartProjectButtonProps {
  projectId: string;
  projectName: string;
  companies: Company[];
  existingProjects: ExistingProject[];
}

export function StartProjectButton({
  projectId,
  projectName,
  companies,
  existingProjects,
}: StartProjectButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  // No company registered
  if (companies.length === 0) {
    return (
      <Button asChild>
        <Link href="/company">
          <Building2 className="h-4 w-4 mr-2" />
          기업 등록 후 시작하기
        </Link>
      </Button>
    );
  }

  // Already has project with all companies
  if (existingProjects.length >= companies.length) {
    const project = existingProjects[0];
    return (
      <Button variant="outline" asChild>
        <Link href={`/my-projects/${project.id}`}>
          <ArrowRight className="h-4 w-4 mr-2" />
          진행 중인 프로젝트 보기
        </Link>
      </Button>
    );
  }

  const handleStart = async (companyId: string) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/user-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, projectId }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // Already exists
        toast.info("이미 등록된 프로젝트입니다");
        router.push(`/my-projects/${data.userProjectId}`);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "프로젝트 시작에 실패했습니다");
      }

      toast.success("프로젝트가 시작되었습니다!");
      router.push(`/my-projects/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "오류가 발생했습니다");
    } finally {
      setIsLoading(false);
      setShowDialog(false);
    }
  };

  // Single company - direct start
  if (companies.length === 1) {
    return (
      <Button onClick={() => handleStart(companies[0].id)} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Rocket className="h-4 w-4 mr-2" />
        )}
        {isLoading ? "시작 중..." : "지원 준비 시작"}
      </Button>
    );
  }

  // Multiple companies - show selector
  const availableCompanies = companies.filter(
    (c) => !existingProjects.some((ep) => ep.companyName === c.name)
  );

  return (
    <>
      <Button onClick={() => setShowDialog(true)} disabled={isLoading}>
        <Rocket className="h-4 w-4 mr-2" />
        지원 준비 시작
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>기업 선택</DialogTitle>
            <DialogDescription>
              &quot;{projectName}&quot; 지원을 준비할 기업을 선택하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Select
              value={selectedCompanyId}
              onValueChange={setSelectedCompanyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="기업을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {availableCompanies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              className="w-full"
              onClick={() => handleStart(selectedCompanyId)}
              disabled={!selectedCompanyId || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              {isLoading ? "시작 중..." : "시작하기"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
