"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectStepper, StepContent } from "@/components/projects";
import type { StepConfig } from "@/components/projects";
import { toast } from "sonner";
import {
  FileText,
  ClipboardCheck,
  FileCheck,
  Package,
} from "lucide-react";

// Step configuration - 클라이언트 컴포넌트 내부에서 정의 (아이콘 함수 포함)
const STEPS: StepConfig[] = [
  {
    number: 1,
    label: "공고 확인",
    description: "지원자격과 제출서류를 확인해요",
    icon: FileText,
  },
  {
    number: 2,
    label: "부족항목 진단",
    description: "AI가 부족한 정보와 증빙을 찾아드려요",
    icon: ClipboardCheck,
    creditCost: 50,
    isOptional: true,
  },
  {
    number: 3,
    label: "계획서 작성",
    description: "블록 기반으로 쉽게 작성해요",
    icon: FileText,
  },
  {
    number: 4,
    label: "제출 전 검증",
    description: "AI가 최종 점검을 도와드려요",
    icon: FileCheck,
    creditCost: 30,
    isOptional: true,
  },
  {
    number: 5,
    label: "패키징 & 제출",
    description: "파일을 정리하고 제출 준비를 완료해요",
    icon: Package,
  },
];

interface ProjectWorkspaceProps {
  projectId: string;
  supportProjectId: string;
  projectUrl: string | null;
  companyId: string;
  existingPlanId: string | null;
  initialStep: number;
  initialCompletions: boolean[];
}

export function ProjectWorkspace({
  projectId,
  supportProjectId,
  projectUrl,
  companyId,
  existingPlanId,
  initialStep,
  initialCompletions,
}: ProjectWorkspaceProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [stepCompletions, setStepCompletions] = useState(initialCompletions);

  const saveProgress = async (stepNumber: number, completed: boolean, nextStep: number) => {
    try {
      const stepFieldMap: Record<number, string> = {
        1: "step1Completed",
        2: "step2Completed",
        3: "step3Completed",
        4: "step4Completed",
        5: "step5Completed",
      };

      const response = await fetch(`/api/user-projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [stepFieldMap[stepNumber]]: completed,
          currentStep: nextStep,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  };

  const handleStepComplete = async (completedStep: number) => {
    // 롤백을 위한 이전 상태 저장
    const prevCompletions = [...stepCompletions];
    const prevStep = currentStep;

    // Update local state optimistically (함수형 setter로 최신 상태 사용)
    setStepCompletions((prev) => {
      const newCompletions = [...prev];
      newCompletions[completedStep - 1] = true;
      return newCompletions;
    });

    const nextStep = completedStep < STEPS.length ? completedStep + 1 : completedStep;
    if (completedStep < STEPS.length) {
      setCurrentStep(nextStep);
    }

    // Save to API
    const success = await saveProgress(completedStep, true, nextStep);
    if (!success) {
      // 실패 시 저장된 이전 상태로 롤백
      setStepCompletions(prevCompletions);
      setCurrentStep(prevStep);
      toast.error("진행 상태 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleStepSkip = async (skippedStep: number) => {
    // 롤백을 위한 이전 상태 저장
    const prevStep = currentStep;

    // 건너뛴 단계는 완료 처리하지 않고 다음 단계로 이동
    const nextStep = skippedStep < STEPS.length ? skippedStep + 1 : skippedStep;
    setCurrentStep(nextStep);

    // Save only currentStep (step not completed)
    try {
      const response = await fetch(`/api/user-projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: nextStep }),
      });

      if (!response.ok) {
        setCurrentStep(prevStep);
        toast.error("진행 상태 저장에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setCurrentStep(prevStep);
      toast.error("진행 상태 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleStepClick = (stepNumber: number) => {
    // 완료된 스텝이거나 현재 스텝 이하만 이동 가능
    if (stepCompletions[stepNumber - 1] || stepNumber <= currentStep) {
      setCurrentStep(stepNumber);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Stepper */}
      <Card>
        <CardHeader>
          <CardTitle>진행 현황</CardTitle>
          <CardDescription>
            5단계를 완료하면 제출 준비가 끝납니다
            <span className="text-xs ml-2 text-muted-foreground">
              (완료된 단계를 클릭하여 이동할 수 있습니다)
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectStepper
            steps={STEPS}
            currentStep={currentStep}
            stepCompletions={stepCompletions}
            onStepClick={handleStepClick}
          />
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <StepContent
        currentStep={currentStep}
        steps={STEPS}
        projectId={projectId}
        supportProjectId={supportProjectId}
        projectUrl={projectUrl}
        companyId={companyId}
        existingPlanId={existingPlanId}
        onStepComplete={handleStepComplete}
        onStepSkip={handleStepSkip}
        onPrevious={handlePrevious}
      />
    </div>
  );
}
