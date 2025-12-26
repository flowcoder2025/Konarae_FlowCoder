"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ component: "deduct-credit-dialog" })

interface DeductCreditDialogProps {
  userId: string
  userName: string
  currentBalance: number
}

export function DeductCreditDialog({
  userId,
  userName,
  currentBalance,
}: DeductCreditDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeduct = async () => {
    const amountNum = parseInt(amount, 10)

    if (!amountNum || amountNum <= 0) {
      setError("유효한 크래딧 금액을 입력하세요")
      return
    }

    if (amountNum > currentBalance) {
      setError(`잔액(${currentBalance}C)보다 큰 금액은 차감할 수 없습니다`)
      return
    }

    if (!reason.trim()) {
      setError("차감 사유를 입력하세요")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/credits/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          amount: amountNum,
          reason: reason.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "크래딧 차감 실패")
      }

      // 성공
      setOpen(false)
      setAmount("")
      setReason("")
      router.refresh()
    } catch (err) {
      logger.error("Failed to deduct credit", { error: err })
      setError(err instanceof Error ? err.message : "오류가 발생했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  // 잔액이 없으면 비활성화
  const isDisabled = currentBalance === 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isDisabled}>
          <Minus className="mr-1 h-3 w-3" />
          차감
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Minus className="h-5 w-5" />
            크래딧 차감
          </DialogTitle>
          <DialogDescription>
            {userName}님의 크래딧을 차감합니다.
            <br />
            현재 잔액: <strong>{currentBalance.toLocaleString()}C</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 직접 입력 */}
          <div className="space-y-2">
            <Label htmlFor="deduct-amount">차감 금액 (C)</Label>
            <Input
              id="deduct-amount"
              type="number"
              placeholder="차감할 크래딧 금액 입력"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={currentBalance}
            />
            <p className="text-xs text-muted-foreground">
              최대 {currentBalance.toLocaleString()}C까지 차감 가능
            </p>
          </div>

          {/* 사유 입력 */}
          <div className="space-y-2">
            <Label htmlFor="deduct-reason">차감 사유</Label>
            <Input
              id="deduct-reason"
              placeholder="예: 오류 수정, 환불 처리 등"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* 에러 메시지 */}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeduct}
            disabled={isLoading || !amount || !reason}
          >
            {isLoading ? "처리 중..." : `${amount || 0}C 차감`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
