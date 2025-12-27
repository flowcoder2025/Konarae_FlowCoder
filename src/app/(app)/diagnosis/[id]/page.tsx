"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/common"
import {
  DiagnosisResponse,
  GapItem,
  ActionItem,
  GapSeverity,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  RequirementCategory,
} from "@/types/diagnosis"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ page: "diagnosis-detail" })

export default function DiagnosisDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDiagnosis()
    const interval = setInterval(() => {
      if (diagnosis?.status === "processing") {
        fetchDiagnosis()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [id, diagnosis?.status])

  const fetchDiagnosis = async () => {
    try {
      const res = await fetch(`/api/diagnosis/${id}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setDiagnosis(data)
    } catch (error) {
      logger.error("Fetch diagnosis error", { error })
      router.push("/diagnosis")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <p>로딩 중...</p>
      </div>
    )
  }

  if (!diagnosis) {
    return null
  }

  const getFitScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    if (score >= 40) return "text-orange-600"
    return "text-red-600"
  }

  const getFitScoreLabel = (score: number) => {
    if (score >= 80) return "우수"
    if (score >= 60) return "양호"
    if (score >= 40) return "보통"
    return "미흡"
  }

  // 심각도별 갭 분류
  const gapsBySeverity = {
    critical: diagnosis.gaps?.filter((g) => g.severity === "critical") || [],
    high: diagnosis.gaps?.filter((g) => g.severity === "high") || [],
    medium: diagnosis.gaps?.filter((g) => g.severity === "medium") || [],
    low: diagnosis.gaps?.filter((g) => g.severity === "low") || [],
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <PageHeader
        title="부족항목 진단 결과"
        description={`${diagnosis.company?.name || "기업"} → ${
          diagnosis.project?.name || "지원사업"
        }`}
        backHref="/diagnosis"
      />

      {/* 진단 진행 중 */}
      {diagnosis.status === "processing" && (
        <Card className="mt-6 border-blue-200 bg-blue-50">
          <CardContent className="py-8 text-center">
            <Clock className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-pulse" />
            <h3 className="text-lg font-semibold mb-2">진단 분석 중...</h3>
            <p className="text-muted-foreground">
              AI가 공고 요구사항과 기업 현황을 비교 분석하고 있습니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 진단 실패 */}
      {diagnosis.status === "failed" && (
        <Card className="mt-6 border-destructive bg-destructive/5">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">진단 실패</h3>
            <p className="text-muted-foreground mb-4">
              {diagnosis.errorMessage || "알 수 없는 오류가 발생했습니다."}
            </p>
            <p className="text-sm text-muted-foreground">
              크래딧이 환불되었습니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 진단 완료 - 결과 표시 */}
      {diagnosis.status === "completed" && diagnosis.fitScore !== null && (
        <div className="mt-6 space-y-6">
          {/* 적합도 점수 카드 */}
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    지원 적합도
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-5xl font-bold ${getFitScoreColor(
                        diagnosis.fitScore
                      )}`}
                    >
                      {diagnosis.fitScore}
                    </span>
                    <span className="text-xl text-muted-foreground">/ 100</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`mt-2 ${getFitScoreColor(diagnosis.fitScore)}`}
                  >
                    {getFitScoreLabel(diagnosis.fitScore)}
                  </Badge>
                </div>

                <div className="text-right">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-red-600">
                        {gapsBySeverity.critical.length}
                      </div>
                      <div className="text-xs text-muted-foreground">필수</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-orange-600">
                        {gapsBySeverity.high.length}
                      </div>
                      <div className="text-xs text-muted-foreground">중요</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-600">
                        {gapsBySeverity.medium.length}
                      </div>
                      <div className="text-xs text-muted-foreground">권장</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {gapsBySeverity.low.length}
                      </div>
                      <div className="text-xs text-muted-foreground">선호</div>
                    </div>
                  </div>
                </div>
              </div>

              <Progress
                value={diagnosis.fitScore}
                className="mt-4 h-3"
              />
            </CardContent>
          </Card>

          {/* 부족 항목 목록 */}
          {diagnosis.gaps && diagnosis.gaps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  부족 항목 ({diagnosis.gaps.length}건)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {diagnosis.gaps.map((gap) => (
                    <GapCard key={gap.id} gap={gap} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 개선 액션 */}
          {diagnosis.actions && diagnosis.actions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  개선 액션 ({diagnosis.actions.length}건)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {diagnosis.actions.map((action, idx) => (
                    <ActionCard key={action.id} action={action} index={idx} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 모두 충족 시 */}
          {diagnosis.gaps?.length === 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  모든 요건을 충족합니다
                </h3>
                <p className="text-muted-foreground">
                  지원 자격이 완벽하게 갖춰져 있습니다.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="mt-8 flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/diagnosis">목록으로</Link>
        </Button>
        {diagnosis.status === "completed" && (
          <Button asChild>
            <Link href={`/companies/${diagnosis.companyId}`}>
              기업 정보 보기
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}

// 부족 항목 카드 컴포넌트
function GapCard({ gap }: { gap: GapItem }) {
  const colors = SEVERITY_COLORS[gap.severity]

  return (
    <div className={`p-4 rounded-lg border ${colors.border} ${colors.bg}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`${colors.text} border-current`}
          >
            {SEVERITY_LABELS[gap.severity]}
          </Badge>
          <Badge variant="secondary">
            {CATEGORY_LABELS[gap.category as RequirementCategory] || gap.category}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          영향도 {gap.impact}%
        </div>
      </div>

      <h4 className="font-medium mb-2">{gap.requirement}</h4>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">현재 상태:</span>
          <p className="mt-1">{gap.current}</p>
        </div>
        <div>
          <span className="text-muted-foreground">필요 사항:</span>
          <p className="mt-1 font-medium">{gap.gap}</p>
        </div>
      </div>
    </div>
  )
}

// 개선 액션 카드 컴포넌트
function ActionCard({ action, index }: { action: ActionItem; index: number }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
        {action.priority}
      </div>

      <div className="flex-1">
        <h4 className="font-medium mb-1">{action.title}</h4>
        <p className="text-sm text-muted-foreground">{action.description}</p>

        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {action.documentType && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {action.documentType}
            </span>
          )}
          {action.estimatedDays && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              예상 {action.estimatedDays}일
            </span>
          )}
        </div>
      </div>

      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}
