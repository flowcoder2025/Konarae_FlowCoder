"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Step1Detail,
  Step2Diagnosis,
  Step3Plan,
  Step4Verify,
  Step5Package,
} from "./steps";
import type { StepConfig } from "./project-stepper";

interface StepContentProps {
  currentStep: number;
  steps: StepConfig[];
  projectId: string;
  projectUrl: string | null;
  companyId: string;
  existingPlanId: string | null;
  onStepComplete: (step: number) => void;
}

export function StepContent({
  currentStep,
  steps,
  projectId,
  projectUrl,
  companyId,
  existingPlanId,
  onStepComplete,
}: StepContentProps) {
  const currentStepConfig = steps[currentStep - 1];

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1Detail
            projectUrl={projectUrl}
            onComplete={() => onStepComplete(1)}
          />
        );
      case 2:
        return (
          <Step2Diagnosis
            companyId={companyId}
            projectId={projectId}
            creditCost={currentStepConfig.creditCost || 50}
            onComplete={() => onStepComplete(2)}
          />
        );
      case 3:
        return (
          <Step3Plan
            projectId={projectId}
            companyId={companyId}
            existingPlanId={existingPlanId}
            onComplete={() => onStepComplete(3)}
          />
        );
      case 4:
        return (
          <Step4Verify
            projectId={projectId}
            creditCost={currentStepConfig.creditCost || 30}
            onComplete={() => onStepComplete(4)}
          />
        );
      case 5:
        return (
          <Step5Package
            projectId={projectId}
            projectUrl={projectUrl}
            onComplete={() => onStepComplete(5)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
            {currentStep}
          </div>
          <div>
            <CardTitle>{currentStepConfig.label}</CardTitle>
            <CardDescription>{currentStepConfig.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{renderStepContent()}</CardContent>
    </Card>
  );
}
