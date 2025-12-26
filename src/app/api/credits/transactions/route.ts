/**
 * 크래딧 거래 내역 조회 API
 * GET /api/credits/transactions - 사용자의 크래딧 거래 내역 조회
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCreditTransactions } from "@/lib/credits"
import { CreditTransactionType } from "@/types/diagnosis"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ api: "credit-transactions" })

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const type = searchParams.get("type") as CreditTransactionType | null

    const result = await getCreditTransactions({
      userId: session.user.id,
      page,
      limit,
      ...(type && { type }),
    })

    return NextResponse.json({
      transactions: result.transactions,
      total: result.total,
      page,
      limit,
    })
  } catch (error) {
    logger.error("Failed to fetch credit transactions", { error })
    return NextResponse.json(
      { error: "거래 내역 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
