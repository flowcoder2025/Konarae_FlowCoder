"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/common"
import { DiagnosisResponse, DiagnosisStatus } from "@/types/diagnosis"

const STATUS_LABELS: Record<DiagnosisStatus, string> = {
  pending: "대기 중",
  processing: "분석 중",
  completed: "완료",
  failed: "실패",
}

const STATUS_VARIANTS: Record<
  DiagnosisStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  pending: "secondary",
  processing: "secondary",
  completed: "default",
  failed: "destructive",
}

interface DiagnosisListItem {
  id: string
  companyId: string
  projectId: string
  status: DiagnosisStatus
  fitScore: number | null
  creditUsed: number
  createdAt: string
  completedAt: string | null
  company?: { id: string; name: string }
  project?: { id: string; name: string }
}

export default function DiagnosisListPage() {
  const router = useRouter()
  const [diagnoses, setDiagnoses] = useState<DiagnosisListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchDiagnoses()
  }, [])

  const fetchDiagnoses = async () => {
    try {
      const res = await fetch("/api/diagnosis")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setDiagnoses(data.diagnoses)
      setTotal(data.total)
    } catch (error) {
      console.error("Fetch diagnoses error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getFitScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground"
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    if (score >= 40) return "text-orange-600"
    return "text-red-600"
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <PageHeader
        title="부족항목 진단"
        description={`총 ${total}건의 진단 결과`}
      />

      {diagnoses.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              아직 진단 결과가 없습니다.
            </p>
            <Button asChild>
              <Link href="/matching">매칭 시작하기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4">
          {diagnoses.map((diagnosis) => (
            <Card
              key={diagnosis.id}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => router.push(`/diagnosis/${diagnosis.id}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">
                        {diagnosis.company?.name || "기업"}
                      </h3>
                      <Badge variant={STATUS_VARIANTS[diagnosis.status]}>
                        {STATUS_LABELS[diagnosis.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {diagnosis.project?.name || "지원사업"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(diagnosis.createdAt).toLocaleDateString("ko-KR")}
                    </p>
                  </div>

                  <div className="text-right">
                    {diagnosis.status === "completed" && (
                      <div
                        className={`text-3xl font-bold ${getFitScoreColor(
                          diagnosis.fitScore
                        )}`}
                      >
                        {diagnosis.fitScore ?? "-"}
                        <span className="text-sm font-normal text-muted-foreground">
                          점
                        </span>
                      </div>
                    )}
                    {diagnosis.status === "processing" && (
                      <p className="text-sm text-muted-foreground">분석 중...</p>
                    )}
                    {diagnosis.status === "failed" && (
                      <p className="text-sm text-destructive">분석 실패</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
