/**
 * 크래딧 잔액 조회 API
 * GET /api/credits - 현재 사용자의 크래딧 잔액 조회
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrCreateCredit } from "@/lib/credits"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ api: "credits" })

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const credit = await getOrCreateCredit(session.user.id)

    return NextResponse.json(credit)
  } catch (error) {
    logger.error("Failed to fetch credits", { error })
    return NextResponse.json(
      { error: "크래딧 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
