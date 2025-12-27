"use client";

import { CheckCircle2, Coins } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StepConfig {
  number: number;
  label: string;
  description: string;
  icon: LucideIcon;
  creditCost?: number;
  isOptional?: boolean;
}

interface ProjectStepperProps {
  steps: StepConfig[];
  currentStep: number;
  stepCompletions: boolean[];
  onStepClick?: (stepNumber: number) => void;
}

export function ProjectStepper({
  steps,
  currentStep,
  stepCompletions,
  onStepClick,
}: ProjectStepperProps) {
  const handleStepClick = (stepNumber: number, isClickable: boolean) => {
    if (isClickable && onStepClick) {
      onStepClick(stepNumber);
    }
  };

  return (
    <>
      {/* Desktop Stepper */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, idx) => {
          const isCompleted = stepCompletions[idx];
          const isCurrent = currentStep === step.number;
          const isLocked = currentStep < step.number && !isCompleted;
          // 완료되었거나 현재 단계면 클릭 가능
          const isClickable = isCompleted || step.number <= currentStep;
          const StepIcon = step.icon;

          return (
            <div key={step.number} className="flex items-center flex-1">
              <div
                className={`flex flex-col items-center text-center ${isClickable ? "cursor-pointer" : ""}`}
                onClick={() => handleStepClick(step.number, isClickable)}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && isClickable) {
                    handleStepClick(step.number, isClickable);
                  }
                }}
              >
                <div
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all
                    ${isCompleted ? "bg-primary text-primary-foreground" : ""}
                    ${isCurrent ? "bg-primary/10 text-primary ring-2 ring-primary" : ""}
                    ${isLocked ? "bg-muted text-muted-foreground" : ""}
                    ${isClickable && !isCurrent ? "hover:ring-2 hover:ring-primary/50" : ""}
                  `}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <StepIcon className="h-6 w-6" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${isLocked ? "text-muted-foreground" : ""}`}
                >
                  {step.label}
                </span>
                <div className="flex items-center gap-1 mt-1">
                  {step.creditCost && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Coins className="h-3 w-3" />
                      {step.creditCost}C
                    </span>
                  )}
                  {step.isOptional && (
                    <span className="text-xs text-muted-foreground">(선택)</span>
                  )}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    stepCompletions[idx] ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile Stepper */}
      <div className="md:hidden space-y-3">
        {steps.map((step) => {
          const isCompleted = stepCompletions[step.number - 1];
          const isCurrent = currentStep === step.number;
          const isLocked = currentStep < step.number && !isCompleted;
          const isClickable = isCompleted || step.number <= currentStep;
          const StepIcon = step.icon;

          return (
            <div
              key={step.number}
              className={`
                flex items-center gap-3 p-3 rounded-lg transition-all
                ${isCurrent ? "bg-primary/10 ring-1 ring-primary" : ""}
                ${isLocked ? "opacity-50" : ""}
                ${isClickable ? "cursor-pointer hover:bg-muted/50" : ""}
              `}
              onClick={() => handleStepClick(step.number, isClickable)}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && isClickable) {
                  handleStepClick(step.number, isClickable);
                }
              }}
            >
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center shrink-0
                  ${isCompleted ? "bg-primary text-primary-foreground" : "bg-muted"}
                `}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <StepIcon className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{step.label}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {step.isOptional && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    선택
                  </span>
                )}
                {step.creditCost && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2 py-1 rounded">
                    <Coins className="h-3 w-3" />
                    {step.creditCost}C
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
