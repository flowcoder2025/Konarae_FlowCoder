"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Kanban, Plus } from "lucide-react"
import Link from "next/link"
import { PipelineBoard } from "@/components/pipeline"
import type { PipelineProject } from "@/components/pipeline"

interface PipelineClientProps {
  data: Record<string, PipelineProject[]>
  hiddenCount: number
  showHidden: boolean
}

export function PipelineClient({ data, hiddenCount, showHidden }: PipelineClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleToggleHidden = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (checked) {
      params.set("showHidden", "true")
    } else {
      params.delete("showHidden")
    }
    router.push(`/pipeline?${params.toString()}`)
  }

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Kanban className="h-8 w-8 text-primary" />
            파이프라인
          </h1>
          <p className="mt-1 text-muted-foreground">
            모든 프로젝트를 한눈에 관리하세요
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Hidden Projects Toggle */}
          {hiddenCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch
                id="show-hidden-pipeline"
                checked={showHidden}
                onCheckedChange={handleToggleHidden}
              />
              <Label
                htmlFor="show-hidden-pipeline"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                숨긴 프로젝트 ({hiddenCount})
              </Label>
            </div>
          )}
          <Button asChild>
            <Link href="/projects">
              <Plus className="h-4 w-4 mr-2" />
              새 프로젝트
            </Link>
          </Button>
        </div>
      </div>

      {/* Pipeline Board */}
      <PipelineBoard data={data} />
    </div>
  )
}
