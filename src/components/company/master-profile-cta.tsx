"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Sparkles,
  FileText,
  Clock,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { GenerateProfileModal } from "./generate-profile-modal"
import type { MasterProfileStatus, ExpectedQuality } from "@/lib/master-profile/types"
import { MASTER_PROFILE_MESSAGES } from "@/lib/master-profile/constants"

interface MasterProfileCTAProps {
  companyId: string
  companyName: string
  /** 프로필 상태 (null = 프로필 없음) */
  profileStatus: MasterProfileStatus | null
  /** 분석된 문서 수 */
  analyzedDocumentCount: number
  /** 생성 가능 여부 */
  canGenerate: boolean
  /** 첫 생성 여부 (무료) */
  isFirstGeneration: boolean
  /** 필요 크레딧 */
  requiredCredit: number
  /** 현재 잔액 */
  currentBalance: number
  /** 예상 품질 */
  expectedQuality: ExpectedQuality
  /** 누락된 필수 문서 그룹 */
  missingRequiredGroups?: string[][]
  /** 생성 완료 콜백 */
  onGenerateComplete?: () => void
}

const STATUS_CONFIG: Record<MasterProfileStatus, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  badgeVariant: "default" | "outline" | "secondary"
}> = {
  draft: { label: "초안", icon: FileText, badgeVariant: "outline" },
  generating: { label: "생성 중", icon: Clock, badgeVariant: "secondary" },
  completed: { label: "완료", icon: CheckCircle2, badgeVariant: "default" },
  failed: { label: "실패", icon: AlertCircle, badgeVariant: "outline" },
}

const QUALITY_CONFIG: Record<ExpectedQuality, {
  label: string
  color: string
  bgColor: string
}> = {
  low: { label: "기본", color: "text-yellow-600", bgColor: "bg-yellow-50" },
  medium: { label: "표준", color: "text-blue-600", bgColor: "bg-blue-50" },
  high: { label: "우수", color: "text-green-600", bgColor: "bg-green-50" },
  excellent: { label: "최상", color: "text-primary", bgColor: "bg-primary/10" },
}

export function MasterProfileCTA({
  companyId,
  companyName,
  profileStatus,
  analyzedDocumentCount,
  canGenerate,
  isFirstGeneration,
  requiredCredit,
  currentBalance,
  expectedQuality,
  missingRequiredGroups = [],
  onGenerateComplete,
}: MasterProfileCTAProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const hasProfile = profileStatus !== null
  const isGenerating = profileStatus === "generating"
  const isCompleted = profileStatus === "completed"
  const qualityConfig = QUALITY_CONFIG[expectedQuality]

  // 프로필 완성 상태 - 간단한 카드
  if (isCompleted) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">마스터 프로필</CardTitle>
                <CardDescription className="text-xs">
                  사업계획서 작성에 활용할 수 있습니다
                </CardDescription>
              </div>
            </div>
            <Badge variant="default" className="bg-primary">
              완성됨
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2">
            <Link href={`/companies/${companyId}/profile`} className="flex-1">
              <Button variant="outline" className="w-full" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                프로필 보기
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              disabled={!canGenerate}
            >
              재생성
            </Button>
          </div>
        </CardContent>

        <GenerateProfileModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          companyId={companyId}
          companyName={companyName}
          isFirstGeneration={false}
          requiredCredit={requiredCredit}
          currentBalance={currentBalance}
          analyzedDocumentCount={analyzedDocumentCount}
          expectedQuality={expectedQuality}
          onComplete={() => {
            setIsModalOpen(false)
            onGenerateComplete?.()
          }}
        />
      </Card>
    )
  }

  // 생성 중 상태
  if (isGenerating) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">마스터 프로필 생성 중</CardTitle>
              <CardDescription className="text-xs">
                AI가 문서를 분석하고 있습니다. 잠시만 기다려 주세요.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Progress value={33} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            보통 1~2분 정도 소요됩니다
          </p>
        </CardContent>
      </Card>
    )
  }

  // 미생성 또는 생성 가능 상태 - CTA 카드
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {hasProfile ? "마스터 프로필 재생성" : "마스터 프로필 만들기"}
              </CardTitle>
              <CardDescription>
                {MASTER_PROFILE_MESSAGES.CTA_SUBTITLE}
              </CardDescription>
            </div>
          </div>
          {isFirstGeneration && (
            <Badge variant="default" className="bg-green-600">
              무료
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 품질 예상 */}
        <div className={`rounded-lg p-3 ${qualityConfig.bgColor}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">예상 품질</span>
            <Badge variant="outline" className={qualityConfig.color}>
              {qualityConfig.label}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            분석된 문서 {analyzedDocumentCount}개 기준
          </p>
        </div>

        {/* 품질 향상 팁 */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            {MASTER_PROFILE_MESSAGES.CTA_QUALITY_TIP}
          </p>
        </div>

        {/* 누락 문서 경고 */}
        {missingRequiredGroups.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 p-3 border border-yellow-200">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-yellow-800">
                필수 문서가 부족합니다
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                {missingRequiredGroups.map((group) => group.join(" 또는 ")).join(", ")} 중 하나가 필요합니다.
              </p>
            </div>
          </div>
        )}

        {/* 비용 안내 */}
        {!isFirstGeneration && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">필요 크레딧</span>
            <span className="font-medium">{requiredCredit}C</span>
          </div>
        )}

        {/* CTA 버튼 */}
        <Button
          className="w-full"
          size="lg"
          onClick={() => setIsModalOpen(true)}
          disabled={!canGenerate}
        >
          {canGenerate ? (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {hasProfile ? "프로필 재생성" : "프로필 생성하기"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              <AlertCircle className="mr-2 h-4 w-4" />
              {currentBalance < requiredCredit
                ? "크레딧 부족"
                : "문서 업로드 필요"}
            </>
          )}
        </Button>

        {/* 비용 안내 텍스트 */}
        <p className="text-center text-xs text-muted-foreground">
          {isFirstGeneration
            ? MASTER_PROFILE_MESSAGES.MODAL_COST_FREE
            : MASTER_PROFILE_MESSAGES.MODAL_COST_CREDIT.replace("{cost}", String(requiredCredit))}
        </p>
      </CardContent>

      <GenerateProfileModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        companyId={companyId}
        companyName={companyName}
        isFirstGeneration={isFirstGeneration}
        requiredCredit={requiredCredit}
        currentBalance={currentBalance}
        analyzedDocumentCount={analyzedDocumentCount}
        expectedQuality={expectedQuality}
        onComplete={() => {
          setIsModalOpen(false)
          onGenerateComplete?.()
        }}
      />
    </Card>
  )
}
