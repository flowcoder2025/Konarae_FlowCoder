"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectStepper, StepContent } from "@/components/projects";
import type { StepConfig } from "@/components/projects";
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
  projectUrl: string | null;
  companyId: string;
  existingPlanId: string | null;
  initialStep: number;
  initialCompletions: boolean[];
}

export function ProjectWorkspace({
  projectId,
  projectUrl,
  companyId,
  existingPlanId,
  initialStep,
  initialCompletions,
}: ProjectWorkspaceProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [stepCompletions, setStepCompletions] = useState(initialCompletions);

  const handleStepComplete = async (completedStep: number) => {
    // Update local state optimistically
    const newCompletions = [...stepCompletions];
    newCompletions[completedStep - 1] = true;
    setStepCompletions(newCompletions);

    const nextStep = completedStep < STEPS.length ? completedStep + 1 : completedStep;
    if (completedStep < STEPS.length) {
      setCurrentStep(nextStep);
    }

    // Save to API
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
          [stepFieldMap[completedStep]]: true,
          currentStep: nextStep,
        }),
      });

      if (!response.ok) {
        // Revert on error
        console.error("Failed to save progress");
        setStepCompletions(stepCompletions);
        setCurrentStep(currentStep);
      }
    } catch (error) {
      console.error("Failed to save progress:", error);
      // Revert on error
      setStepCompletions(stepCompletions);
      setCurrentStep(currentStep);
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
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectStepper
            steps={STEPS}
            currentStep={currentStep}
            stepCompletions={stepCompletions}
          />
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <StepContent
        currentStep={currentStep}
        steps={STEPS}
        projectId={projectId}
        projectUrl={projectUrl}
        companyId={companyId}
        existingPlanId={existingPlanId}
        onStepComplete={handleStepComplete}
      />
    </div>
  );
}
