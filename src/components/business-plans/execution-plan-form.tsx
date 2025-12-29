"use client"

import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"
import type { ExecutionPlan, Milestone } from "@/types/business-plan"

interface ExecutionPlanFormProps {
  value: ExecutionPlan
  onChange: (value: ExecutionPlan) => void
}

const DURATION_OPTIONS = [
  { value: "6개월", label: "6개월" },
  { value: "9개월", label: "9개월" },
  { value: "12개월", label: "12개월 (1년)" },
  { value: "18개월", label: "18개월" },
  { value: "24개월", label: "24개월 (2년)" },
  { value: "36개월", label: "36개월 (3년)" },
]

export function ExecutionPlanForm({ value, onChange }: ExecutionPlanFormProps) {
  const handleDurationChange = useCallback(
    (duration: string) => {
      onChange({ ...value, duration })
    },
    [value, onChange]
  )

  const handleTeamPlanChange = useCallback(
    (teamPlan: string) => {
      onChange({ ...value, teamPlan })
    },
    [value, onChange]
  )

  const updateMilestone = useCallback(
    (index: number, field: keyof Milestone, fieldValue: string) => {
      const newMilestones = [...value.milestones]
      newMilestones[index] = {
        ...newMilestones[index],
        [field]: fieldValue,
      }
      onChange({ ...value, milestones: newMilestones })
    },
    [value, onChange]
  )

  const addMilestone = useCallback(() => {
    const phaseNumber = value.milestones.length + 1
    const newMilestone: Milestone = {
      phase: `${phaseNumber}단계`,
      period: "",
      tasks: "",
      deliverables: "",
    }
    onChange({
      ...value,
      milestones: [...value.milestones, newMilestone],
    })
  }, [value, onChange])

  const removeMilestone = useCallback(
    (index: number) => {
      if (value.milestones.length <= 1) return
      const newMilestones = value.milestones.filter((_, i) => i !== index)
      onChange({ ...value, milestones: newMilestones })
    },
    [value, onChange]
  )

  return (
    <div className="space-y-4">
      {/* 총 사업 기간 */}
      <div className="space-y-2">
        <Label htmlFor="duration">총 사업 기간 *</Label>
        <Select value={value.duration} onValueChange={handleDurationChange}>
          <SelectTrigger id="duration">
            <SelectValue placeholder="사업 기간을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {DURATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 마일스톤 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>추진 일정 (마일스톤) *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMilestone}
          >
            <Plus className="h-4 w-4 mr-1" />
            단계 추가
          </Button>
        </div>

        <div className="space-y-3">
          {value.milestones.map((milestone, index) => (
            <Card key={index} className="relative">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  {/* 드래그 핸들 (미래 구현용) */}
                  <div className="pt-2 cursor-move text-muted-foreground/50">
                    <GripVertical className="h-5 w-5" />
                  </div>

                  <div className="flex-1 grid gap-3 sm:grid-cols-2">
                    {/* 단계명 */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">단계명</Label>
                      <Input
                        value={milestone.phase}
                        onChange={(e) =>
                          updateMilestone(index, "phase", e.target.value)
                        }
                        placeholder="예: 1단계: 기술 개발"
                      />
                    </div>

                    {/* 기간 */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">기간</Label>
                      <Input
                        value={milestone.period}
                        onChange={(e) =>
                          updateMilestone(index, "period", e.target.value)
                        }
                        placeholder="예: 1~3개월"
                      />
                    </div>

                    {/* 주요 과업 */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">주요 과업</Label>
                      <Textarea
                        value={milestone.tasks}
                        onChange={(e) =>
                          updateMilestone(index, "tasks", e.target.value)
                        }
                        placeholder="이 단계에서 수행할 주요 업무"
                        className="min-h-[80px]"
                      />
                    </div>

                    {/* 산출물 */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">산출물</Label>
                      <Textarea
                        value={milestone.deliverables}
                        onChange={(e) =>
                          updateMilestone(index, "deliverables", e.target.value)
                        }
                        placeholder="이 단계의 결과물/산출물"
                        className="min-h-[80px]"
                      />
                    </div>
                  </div>

                  {/* 삭제 버튼 */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMilestone(index)}
                    disabled={value.milestones.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 인력 투입 계획 */}
      <div className="space-y-2">
        <Label htmlFor="teamPlan">인력 투입 계획 (선택)</Label>
        <Textarea
          id="teamPlan"
          value={value.teamPlan || ""}
          onChange={(e) => handleTeamPlanChange(e.target.value)}
          placeholder="예: 총괄책임자(PM) 1명, 연구개발인력 3명, 사업화인력 1명"
          className="min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          투입 예정 인력의 역할과 인원수를 작성하세요
        </p>
      </div>
    </div>
  )
}
