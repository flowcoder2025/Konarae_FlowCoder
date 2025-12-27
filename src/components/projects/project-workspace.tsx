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
    // Update local state
    const newCompletions = [...stepCompletions];
    newCompletions[completedStep - 1] = true;
    setStepCompletions(newCompletions);

    // Move to next step if not at the end
    if (completedStep < steps.length) {
      setCurrentStep(completedStep + 1);
    }

    // TODO: Save to API
    // await fetch(`/api/projects/${projectId}/progress`, {
    //   method: 'PATCH',
    //   body: JSON.stringify({ step: completedStep, completed: true }),
    // });
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
