/**
 * 부족항목 진단 API
 * GET /api/diagnosis - 진단 목록 조회
 * POST /api/diagnosis - 새 진단 요청
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runDiagnosis, getUserDiagnoses } from "@/lib/diagnosis"
import { hasSufficientCredit, getInsufficientCreditMessage, getCreditBalance } from "@/lib/credits"
import { CREDIT_COSTS } from "@/types/diagnosis"

/**
 * GET /api/diagnosis - 사용자의 진단 목록 조회
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
    const companyId = searchParams.get("companyId") || undefined
    const projectId = searchParams.get("projectId") || undefined

    const result = await getUserDiagnoses(session.user.id, {
      page,
      limit,
      companyId,
      projectId,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[GET /api/diagnosis] Error:", error)
    return NextResponse.json(
      { error: "진단 목록 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/diagnosis - 새 진단 요청 (15C 차감)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const body = await request.json()
    const { companyId, projectId } = body

    if (!companyId || !projectId) {
      return NextResponse.json(
        { error: "companyId와 projectId가 필요합니다" },
        { status: 400 }
      )
    }

    // 크래딧 잔액 확인
    const hasCredit = await hasSufficientCredit(
      session.user.id,
      CREDIT_COSTS.DIAGNOSIS
    )

    if (!hasCredit) {
      const balance = await getCreditBalance(session.user.id)
      return NextResponse.json(
        {
          error: getInsufficientCreditMessage(
            balance || 0,
            CREDIT_COSTS.DIAGNOSIS
          ),
        },
        { status: 402 } // Payment Required
      )
    }

    // 진단 실행
    const result = await runDiagnosis({
      userId: session.user.id,
      companyId,
      projectId,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, diagnosisId: result.diagnosisId },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        diagnosisId: result.diagnosisId,
        message: "진단이 완료되었습니다",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[POST /api/diagnosis] Error:", error)
    return NextResponse.json(
      { error: "진단 요청 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
