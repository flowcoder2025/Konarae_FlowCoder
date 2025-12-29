"use client"

import { useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import type { BudgetPlan, BudgetItem } from "@/types/business-plan"
import { BUDGET_CATEGORIES } from "@/types/business-plan"

interface BudgetPlanFormProps {
  value: BudgetPlan
  onChange: (value: BudgetPlan) => void
}

// 숫자 포맷팅 (쉼표 추가)
function formatNumber(num: number): string {
  return num.toLocaleString("ko-KR")
}

// 숫자 파싱 (쉼표 제거)
function parseNumber(str: string): number {
  return parseInt(str.replace(/,/g, ""), 10) || 0
}

export function BudgetPlanForm({ value, onChange }: BudgetPlanFormProps) {
  // 총액 자동 계산 (정부지원금 + 자부담)
  useEffect(() => {
    const calculatedTotal = value.governmentFunding + value.selfFunding
    if (calculatedTotal !== value.totalAmount) {
      onChange({ ...value, totalAmount: calculatedTotal })
    }
  }, [value.governmentFunding, value.selfFunding])

  const handleGovernmentFundingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const funding = parseNumber(e.target.value)
      onChange({ ...value, governmentFunding: funding })
    },
    [value, onChange]
  )

  const handleSelfFundingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const funding = parseNumber(e.target.value)
      onChange({ ...value, selfFunding: funding })
    },
    [value, onChange]
  )

  const addBudgetItem = useCallback(() => {
    const newItem: BudgetItem = {
      category: "",
      amount: 0,
      description: "",
    }
    onChange({
      ...value,
      breakdown: [...(value.breakdown || []), newItem],
    })
  }, [value, onChange])

  const removeBudgetItem = useCallback(
    (index: number) => {
      const newBreakdown = (value.breakdown || []).filter((_, i) => i !== index)
      onChange({ ...value, breakdown: newBreakdown })
    },
    [value, onChange]
  )

  const updateBudgetItem = useCallback(
    (index: number, field: keyof BudgetItem, fieldValue: string | number) => {
      const newBreakdown = [...(value.breakdown || [])]
      newBreakdown[index] = {
        ...newBreakdown[index],
        [field]: fieldValue,
      }
      onChange({ ...value, breakdown: newBreakdown })
    },
    [value, onChange]
  )

  // 세부 항목 합계
  const breakdownTotal = (value.breakdown || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  )

  return (
    <div className="space-y-4">
      {/* 총 사업비 개요 */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* 정부지원금 */}
        <div className="space-y-2">
          <Label htmlFor="governmentFunding">정부지원금 *</Label>
          <div className="relative">
            <Input
              id="governmentFunding"
              type="text"
              value={formatNumber(value.governmentFunding)}
              onChange={handleGovernmentFundingChange}
              placeholder="100,000,000"
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              원
            </span>
          </div>
        </div>

        {/* 자부담 */}
        <div className="space-y-2">
          <Label htmlFor="selfFunding">자부담 *</Label>
          <div className="relative">
            <Input
              id="selfFunding"
              type="text"
              value={formatNumber(value.selfFunding)}
              onChange={handleSelfFundingChange}
              placeholder="30,000,000"
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              원
            </span>
          </div>
        </div>

        {/* 총 사업비 (자동 계산) */}
        <div className="space-y-2">
          <Label>총 사업비</Label>
          <div className="h-10 px-3 py-2 rounded-md border bg-muted flex items-center justify-between">
            <span className="font-semibold">
              {formatNumber(value.totalAmount)}
            </span>
            <span className="text-sm text-muted-foreground">원</span>
          </div>
        </div>
      </div>

      {/* 비율 표시 */}
      {value.totalAmount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>정부지원 {Math.round((value.governmentFunding / value.totalAmount) * 100)}%</span>
          <span>|</span>
          <span>자부담 {Math.round((value.selfFunding / value.totalAmount) * 100)}%</span>
        </div>
      )}

      {/* 세부 항목 */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between">
          <Label>예산 세부 항목 (선택)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBudgetItem}
          >
            <Plus className="h-4 w-4 mr-1" />
            항목 추가
          </Button>
        </div>

        {(value.breakdown || []).length > 0 ? (
          <div className="space-y-2">
            {/* 헤더 */}
            <div className="grid grid-cols-[1fr,120px,1fr,40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <div>항목</div>
              <div>금액</div>
              <div>설명</div>
              <div></div>
            </div>

            {/* 항목 리스트 */}
            {(value.breakdown || []).map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr,120px,1fr,40px] gap-2 items-center"
              >
                <Select
                  value={item.category}
                  onValueChange={(cat) =>
                    updateBudgetItem(index, "category", cat)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="항목 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGET_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Input
                    type="text"
                    value={item.amount ? formatNumber(item.amount) : ""}
                    onChange={(e) =>
                      updateBudgetItem(
                        index,
                        "amount",
                        parseNumber(e.target.value)
                      )
                    }
                    placeholder="금액"
                    className="pr-6 text-right"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    원
                  </span>
                </div>

                <Input
                  value={item.description || ""}
                  onChange={(e) =>
                    updateBudgetItem(index, "description", e.target.value)
                  }
                  placeholder="설명 (선택)"
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeBudgetItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* 세부 항목 합계 */}
            <div className="flex items-center justify-between pt-2 border-t text-sm">
              <span className="text-muted-foreground">세부 항목 합계</span>
              <span className="font-medium">{formatNumber(breakdownTotal)}원</span>
            </div>

            {/* 차이 경고 */}
            {breakdownTotal > 0 && breakdownTotal !== value.totalAmount && (
              <p className="text-xs text-amber-600">
                세부 항목 합계가 총 사업비와 {formatNumber(Math.abs(value.totalAmount - breakdownTotal))}원
                차이가 있습니다.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">
            세부 항목을 추가하면 더 정확한 예산 계획을 작성할 수 있습니다
          </p>
        )}
      </div>
    </div>
  )
}
