"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Coins, Plus } from "lucide-react"
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

const logger = createLogger({ component: "grant-credit-dialog" })

interface GrantCreditDialogProps {
  userId: string
  userName: string
  currentBalance: number
}

export function GrantCreditDialog({
  userId,
  userName,
  currentBalance,
}: GrantCreditDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGrant = async () => {
    const amountNum = parseInt(amount, 10)

    if (!amountNum || amountNum <= 0) {
      setError("유효한 크래딧 금액을 입력하세요")
      return
    }

    if (!reason.trim()) {
      setError("부여 사유를 입력하세요")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/credits/grant", {
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
        throw new Error(data.error || "크래딧 부여 실패")
      }

      // 성공
      setOpen(false)
      setAmount("")
      setReason("")
      router.refresh()
    } catch (err) {
      logger.error("Failed to grant credit", { error: err })
      setError(err instanceof Error ? err.message : "오류가 발생했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  const quickAmounts = [50, 100, 500, 1000]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-3 w-3" />
          부여
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            크래딧 부여
          </DialogTitle>
          <DialogDescription>
            {userName}님에게 크래딧을 부여합니다.
            <br />
            현재 잔액: <strong>{currentBalance.toLocaleString()}C</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 빠른 금액 선택 */}
          <div className="space-y-2">
            <Label>빠른 선택</Label>
            <div className="flex gap-2">
              {quickAmounts.map((amt) => (
                <Button
                  key={amt}
                  variant={amount === String(amt) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAmount(String(amt))}
                >
                  {amt}C
                </Button>
              ))}
            </div>
          </div>

          {/* 직접 입력 */}
          <div className="space-y-2">
            <Label htmlFor="amount">부여 금액 (C)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="크래딧 금액 입력"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={10000}
            />
          </div>

          {/* 사유 입력 */}
          <div className="space-y-2">
            <Label htmlFor="reason">부여 사유</Label>
            <Input
              id="reason"
              placeholder="예: 이벤트 보상, 테스트 용도 등"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button onClick={handleGrant} disabled={isLoading || !amount || !reason}>
            {isLoading ? "처리 중..." : `${amount || 0}C 부여`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
