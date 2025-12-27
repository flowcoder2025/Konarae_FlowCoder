"use client"

import { Button } from "@/components/ui/button"
import { useStartProject } from "@/hooks/use-user-project"
import { Rocket, Loader2, CheckCircle } from "lucide-react"
import { useState } from "react"

interface StartProjectButtonProps {
  companyId: string
  projectId: string
  matchingResultId: string
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
  className?: string
  showIcon?: boolean
}

export function StartProjectButton({
  companyId,
  projectId,
  matchingResultId,
  variant = "default",
  size = "default",
  className,
  showIcon = true,
}: StartProjectButtonProps) {
  const { startProject, isLoading, error } = useStartProject()
  const [started, setStarted] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const success = await startProject(companyId, projectId, matchingResultId)
    if (success) {
      setStarted(true)
    }
  }

  if (started) {
    return (
      <Button variant="outline" size={size} className={className} disabled>
        <CheckCircle className="h-4 w-4 mr-2" />
        프로젝트 시작됨
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : showIcon ? (
          <Rocket className="h-4 w-4 mr-2" />
        ) : null}
        {isLoading ? "시작 중..." : "지원 준비 시작"}
      </Button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
