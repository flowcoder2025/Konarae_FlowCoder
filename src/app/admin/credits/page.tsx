/**
 * Admin Credit Management Page
 * 사용자별 크래딧 현황 조회 및 부여
 */

import { prisma } from "@/lib/prisma"
import { formatDateKST } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, TrendingUp, TrendingDown, Users } from "lucide-react"
import { GrantCreditDialog } from "@/components/admin/grant-credit-dialog"

export default async function AdminCreditsPage() {
  // 크래딧이 있는 사용자 목록 조회
  const usersWithCredits = await prisma.user.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      credit: {
        select: {
          id: true,
          balance: true,
          totalPurchased: true,
          totalUsed: true,
          updatedAt: true,
        },
      },
    },
  })

  // 통계 계산
  const stats = usersWithCredits.reduce(
    (acc, user) => {
      if (user.credit) {
        acc.totalBalance += user.credit.balance
        acc.totalPurchased += user.credit.totalPurchased
        acc.totalUsed += user.credit.totalUsed
        acc.usersWithCredit += 1
      }
      return acc
    },
    { totalBalance: 0, totalPurchased: 0, totalUsed: 0, usersWithCredit: 0 }
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">크래딧 관리</h1>
        <p className="mt-2 text-muted-foreground">
          사용자 크래딧 현황을 조회하고 부여할 수 있습니다
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">크래딧 보유 사용자</div>
              <div className="text-2xl font-bold">{stats.usersWithCredit}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <Coins className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">총 잔액</div>
              <div className="text-2xl font-bold">
                {stats.totalBalance.toLocaleString()}C
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">총 부여</div>
              <div className="text-2xl font-bold">
                {stats.totalPurchased.toLocaleString()}C
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-orange-100 p-2">
              <TrendingDown className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">총 사용</div>
              <div className="text-2xl font-bold">
                {stats.totalUsed.toLocaleString()}C
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Users with Credits Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium">사용자</th>
                <th className="p-4 text-left font-medium">이메일</th>
                <th className="p-4 text-right font-medium">잔액</th>
                <th className="p-4 text-right font-medium">누적 부여</th>
                <th className="p-4 text-right font-medium">누적 사용</th>
                <th className="p-4 text-left font-medium">최근 활동</th>
                <th className="p-4 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {usersWithCredits.map((user) => {
                const credit = user.credit
                const balance = credit?.balance ?? 0
                const balanceStatus =
                  balance === 0
                    ? "destructive"
                    : balance < 50
                    ? "secondary"
                    : "default"

                return (
                  <tr
                    key={user.id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {user.name || "이름 없음"}
                        </span>
                        {user.role === "admin" && (
                          <Badge variant="default" className="text-xs">
                            관리자
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="p-4 text-right">
                      <Badge variant={balanceStatus}>
                        <Coins className="mr-1 h-3 w-3" />
                        {balance.toLocaleString()}C
                      </Badge>
                    </td>
                    <td className="p-4 text-right text-sm text-muted-foreground">
                      {credit ? `${credit.totalPurchased.toLocaleString()}C` : "-"}
                    </td>
                    <td className="p-4 text-right text-sm text-muted-foreground">
                      {credit ? `${credit.totalUsed.toLocaleString()}C` : "-"}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {credit?.updatedAt
                        ? formatDateKST(credit.updatedAt)
                        : "-"}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end">
                        <GrantCreditDialog
                          userId={user.id}
                          userName={user.name || user.email}
                          currentBalance={balance}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {usersWithCredits.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              등록된 사용자가 없습니다
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
