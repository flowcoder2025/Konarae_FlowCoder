"use client"

import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2 } from "lucide-react"
import type { ExpectedOutcomes } from "@/types/business-plan"

interface ExpectedOutcomesFormProps {
  value: ExpectedOutcomes
  onChange: (value: ExpectedOutcomes) => void
}

// 성과 지표 항목 설정
const OUTCOME_FIELDS = [
  {
    id: "revenueTarget",
    label: "매출 목표",
    placeholder: "예: 사업 종료 후 3년 내 10억원",
    hint: "기술 사업화를 통한 예상 매출",
  },
  {
    id: "employmentTarget",
    label: "고용 창출 목표",
    placeholder: "예: 신규 정규직 5명 채용",
    hint: "사업 수행으로 인한 신규 고용",
  },
  {
    id: "exportTarget",
    label: "수출 목표",
    placeholder: "예: 2년 내 2억원 수출",
    hint: "해외 시장 진출 및 수출 계획",
  },
  {
    id: "patentTarget",
    label: "지식재산권 목표",
    placeholder: "예: 특허 2건 출원, 1건 등록",
    hint: "특허, 실용신안, 상표 등",
  },
] as const

type OutcomeFieldId = typeof OUTCOME_FIELDS[number]["id"]

export function ExpectedOutcomesForm({
  value,
  onChange,
}: ExpectedOutcomesFormProps) {
  const handleFieldChange = useCallback(
    (field: OutcomeFieldId, fieldValue: string) => {
      onChange({ ...value, [field]: fieldValue })
    },
    [value, onChange]
  )

  const addOtherMetric = useCallback(() => {
    const newMetrics = [...(value.otherMetrics || []), ""]
    onChange({ ...value, otherMetrics: newMetrics })
  }, [value, onChange])

  const updateOtherMetric = useCallback(
    (index: number, metricValue: string) => {
      const newMetrics = [...(value.otherMetrics || [])]
      newMetrics[index] = metricValue
      onChange({ ...value, otherMetrics: newMetrics })
    },
    [value, onChange]
  )

  const removeOtherMetric = useCallback(
    (index: number) => {
      const newMetrics = (value.otherMetrics || []).filter(
        (_, i) => i !== index
      )
      onChange({ ...value, otherMetrics: newMetrics })
    },
    [value, onChange]
  )

  return (
    <div className="space-y-4">
      {/* 주요 성과 지표 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {OUTCOME_FIELDS.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>{field.label}</Label>
            <Input
              id={field.id}
              value={value[field.id] || ""}
              onChange={(e) =>
                handleFieldChange(field.id, e.target.value)
              }
              placeholder={field.placeholder}
            />
            <p className="text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>

      {/* 기타 성과 지표 */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between">
          <Label>기타 성과 지표 (선택)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOtherMetric}
          >
            <Plus className="h-4 w-4 mr-1" />
            지표 추가
          </Button>
        </div>

        {(value.otherMetrics || []).length > 0 ? (
          <div className="space-y-2">
            {(value.otherMetrics || []).map((metric, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={metric}
                  onChange={(e) => updateOtherMetric(index, e.target.value)}
                  placeholder="예: 기술이전 1건, 논문발표 2건"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeOtherMetric(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">
            사업 특성에 맞는 추가 성과 지표를 입력할 수 있습니다
          </p>
        )}
      </div>

      {/* 팁 */}
      <div className="bg-primary/5 rounded-lg p-3">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">팁:</strong> 정량적 목표를 구체적인
          숫자로 작성하면 AI가 더 설득력 있는 사업계획서를 생성합니다.
        </p>
      </div>
    </div>
  )
}
