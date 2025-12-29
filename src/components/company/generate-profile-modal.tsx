"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles,
  FileText,
  Coins,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Building2,
  Briefcase,
  TrendingUp,
  Users,
  Award,
  Trophy,
  Zap,
  Target,
  type LucideIcon,
} from "lucide-react"

// 아이콘 이름 → 컴포넌트 매핑
const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Briefcase,
  TrendingUp,
  Users,
  Award,
  Trophy,
  Zap,
  Target,
}
import type { ExpectedQuality } from "@/lib/master-profile/types"
import { MASTER_PROFILE_MESSAGES, BLOCK_CATEGORIES } from "@/lib/master-profile/constants"
import { toast } from "sonner"

interface GenerateProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  companyName: string
  isFirstGeneration: boolean
  requiredCredit: number
  currentBalance: number
  analyzedDocumentCount: number
  expectedQuality: ExpectedQuality
  onComplete?: () => void
}

const QUALITY_CONFIG: Record<ExpectedQuality, {
  label: string
  description: string
  color: string
}> = {
  low: {
    label: "기본",
    description: "핵심 정보만 생성됩니다",
    color: "text-yellow-600",
  },
  medium: {
    label: "표준",
    description: "대부분의 섹션이 채워집니다",
    color: "text-blue-600",
  },
  high: {
    label: "우수",
    description: "상세한 프로필이 생성됩니다",
    color: "text-green-600",
  },
  excellent: {
    label: "최상",
    description: "모든 섹션이 상세하게 작성됩니다",
    color: "text-primary",
  },
}

export function GenerateProfileModal({
  open,
  onOpenChange,
  companyId,
  companyName,
  isFirstGeneration,
  requiredCredit,
  currentBalance,
  analyzedDocumentCount,
  expectedQuality,
  onComplete,
}: GenerateProfileModalProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const qualityConfig = QUALITY_CONFIG[expectedQuality]

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/companies/${companyId}/master-profile/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "생성에 실패했습니다")
      }

      toast.success(MASTER_PROFILE_MESSAGES.SUCCESS_GENERATED)
      onComplete?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류"
      setError(message)
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const canAfford = isFirstGeneration || currentBalance >= requiredCredit

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            마스터 프로필 {isFirstGeneration ? "생성" : "재생성"}
          </DialogTitle>
          <DialogDescription>
            {companyName}의 문서를 분석하여 사업계획서용 프로필을 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 분석 대상 문서 */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">분석 대상 문서</span>
            </div>
            <Badge variant="outline">{analyzedDocumentCount}개</Badge>
          </div>

          {/* 예상 품질 */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">예상 품질</span>
              <span className={`text-sm font-semibold ${qualityConfig.color}`}>
                {qualityConfig.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {qualityConfig.description}
            </p>
          </div>

          {/* 생성될 블록 카테고리 */}
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium mb-2">생성될 프로필 블록</p>
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_CATEGORIES.slice(0, 6).map((category) => {
                const IconComponent = ICON_MAP[category.icon]
                return (
                  <Badge key={category.id} variant="secondary" className="text-xs">
                    {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                    {category.label}
                  </Badge>
                )
              })}
              {BLOCK_CATEGORIES.length > 6 && (
                <Badge variant="secondary" className="text-xs">
                  +{BLOCK_CATEGORIES.length - 6}개 더
                </Badge>
              )}
            </div>
          </div>

          {/* 품질 향상 팁 */}
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 border border-primary/20">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {MASTER_PROFILE_MESSAGES.CTA_QUALITY_TIP}
            </p>
          </div>

          {/* 비용 안내 */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {isFirstGeneration ? "비용" : "필요 크레딧"}
                </span>
              </div>
              {isFirstGeneration ? (
                <Badge variant="default" className="bg-green-600">
                  무료
                </Badge>
              ) : (
                <span className="font-medium">{requiredCredit}C</span>
              )}
            </div>
            {!isFirstGeneration && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>현재 잔액</span>
                <span className={!canAfford ? "text-destructive" : ""}>
                  {currentBalance}C
                </span>
              </div>
            )}
          </div>

          {/* 크레딧 부족 경고 */}
          {!canAfford && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-destructive">
                  크레딧이 부족합니다
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {requiredCredit - currentBalance}C가 더 필요합니다.
                </p>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            취소
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!canAfford || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isFirstGeneration ? "무료로 생성하기" : "생성하기"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
