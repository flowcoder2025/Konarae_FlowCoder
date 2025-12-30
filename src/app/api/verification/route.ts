/**
 * 제출 전 검증 API
 * GET /api/verification - 검증 목록 조회
 * POST /api/verification - 새 검증 요청
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runVerification, getUserVerifications } from "@/lib/verification"
import {
  hasSufficientCredit,
  getInsufficientCreditMessage,
  getCreditBalance,
} from "@/lib/credits"
import { VERIFICATION_CREDIT_COST } from "@/types/verification"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ api: "verification" })

/**
 * GET /api/verification - 사용자의 검증 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const userProjectId = searchParams.get("userProjectId") || undefined

    const result = await getUserVerifications(session.user.id, {
      page,
      limit,
      userProjectId,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error("Failed to fetch verifications", { error })
    return NextResponse.json(
      { error: "검증 목록 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/verification - 새 검증 요청 (20C 차감)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const body = await request.json()
    const { userProjectId } = body

    if (!userProjectId) {
      return NextResponse.json(
        { error: "userProjectId가 필요합니다" },
        { status: 400 }
      )
    }

    // 크래딧 잔액 확인
    const hasCredit = await hasSufficientCredit(
      session.user.id,
      VERIFICATION_CREDIT_COST
    )

    if (!hasCredit) {
      const balance = await getCreditBalance(session.user.id)
      return NextResponse.json(
        {
          error: getInsufficientCreditMessage(
            balance || 0,
            VERIFICATION_CREDIT_COST
          ),
        },
        { status: 402 } // Payment Required
      )
    }

    // 검증 실행
    const result = await runVerification({
      userId: session.user.id,
      userProjectId,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, verificationId: result.verificationId },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        verificationId: result.verificationId,
        message: "검증이 완료되었습니다",
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error("Failed to create verification", { error })
    return NextResponse.json(
      { error: "검증 요청 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
