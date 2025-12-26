/**
 * 진단 상세 API
 * GET /api/diagnosis/[id] - 진단 결과 조회
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDiagnosis } from "@/lib/diagnosis"

interface Context {
  params: Promise<{ id: string }>
}

/**
 * GET /api/diagnosis/[id] - 진단 결과 상세 조회
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
    }

    const { id } = await params

    const diagnosis = await getDiagnosis(id, session.user.id)

    if (!diagnosis) {
      return NextResponse.json(
        { error: "진단 결과를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    return NextResponse.json(diagnosis)
  } catch (error) {
    console.error("[GET /api/diagnosis/[id]] Error:", error)
    return NextResponse.json(
      { error: "진단 결과 조회 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
