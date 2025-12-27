"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectStepper, StepContent } from "@/components/projects";
import type { StepConfig } from "@/components/projects";

interface ProjectWorkspaceProps {
  projectId: string;
  projectUrl: string | null;
  companyId: string;
  existingPlanId: string | null;
  initialStep: number;
  initialCompletions: boolean[];
  steps: StepConfig[];
}

export function ProjectWorkspace({
  projectId,
  projectUrl,
  companyId,
  existingPlanId,
  initialStep,
  initialCompletions,
  steps,
}: ProjectWorkspaceProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [stepCompletions, setStepCompletions] = useState(initialCompletions);

  const handleStepComplete = async (completedStep: number) => {
    // Update local state optimistically
    const newCompletions = [...stepCompletions];
    newCompletions[completedStep - 1] = true;
    setStepCompletions(newCompletions);

    const nextStep = completedStep < steps.length ? completedStep + 1 : completedStep;
    if (completedStep < steps.length) {
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
            steps={steps}
            currentStep={currentStep}
            stepCompletions={stepCompletions}
          />
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <StepContent
        currentStep={currentStep}
        steps={steps}
        projectId={projectId}
        projectUrl={projectUrl}
        companyId={companyId}
        existingPlanId={existingPlanId}
        onStepComplete={handleStepComplete}
      />
    </div>
  );
}
