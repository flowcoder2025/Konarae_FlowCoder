"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ClipboardCheck, Loader2 } from "lucide-react"

interface StartDiagnosisButtonProps {
  companyId: string
  projectId: string
  className?: string
}

export function StartDiagnosisButton({
  companyId,
  projectId,
  className,
}: StartDiagnosisButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStartDiagnosis = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, projectId }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 402) {
          setError(data.error || "크래딧이 부족합니다")
        } else {
          setError(data.error || "진단 요청에 실패했습니다")
        }
        return
      }

      // 진단 결과 페이지로 이동
      router.push(`/diagnosis/${data.diagnosisId}`)
    } catch (err) {
      setError("네트워크 오류가 발생했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={className}>
      <Button
        onClick={handleStartDiagnosis}
        disabled={isLoading}
        variant="outline"
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            진단 중...
          </>
        ) : (
          <>
            <ClipboardCheck className="w-4 h-4 mr-2" />
            부족항목 진단 (15C)
          </>
        )}
      </Button>
      {error && (
        <p className="text-sm text-destructive mt-2 text-center">{error}</p>
      )}
    </div>
  )
}
