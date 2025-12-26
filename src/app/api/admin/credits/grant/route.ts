/**
 * 관리자 크래딧 부여 API
 * POST /api/admin/credits/grant - 사용자에게 크래딧 부여
 */

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ api: "admin-credits-grant" })

interface GrantCreditRequest {
  userId: string
  amount: number
  reason: string
}

export async function POST(request: Request) {
  try {
    // 관리자 권한 확인
    const session = await requireAdmin()

    const body: GrantCreditRequest = await request.json()
    const { userId, amount, reason } = body

    // 유효성 검사
    if (!userId || !amount || !reason) {
      return NextResponse.json(
        { error: "userId, amount, reason은 필수입니다" },
        { status: 400 }
      )
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: "부여할 크래딧은 0보다 커야 합니다" },
        { status: 400 }
      )
    }

    if (amount > 10000) {
      return NextResponse.json(
        { error: "한 번에 최대 10,000C까지 부여 가능합니다" },
        { status: 400 }
      )
    }

    // 사용자 존재 확인
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // 크래딧 부여 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      // 기존 크래딧 조회 또는 생성
      let credit = await tx.credit.findUnique({
        where: { userId },
      })

      if (!credit) {
        // 크래딧이 없으면 신규 생성 (부여 금액만)
        credit = await tx.credit.create({
          data: {
            userId,
            balance: amount,
            totalPurchased: amount,
            totalUsed: 0,
          },
        })
      } else {
        // 기존 크래딧에 추가
        credit = await tx.credit.update({
          where: { id: credit.id },
          data: {
            balance: credit.balance + amount,
            totalPurchased: credit.totalPurchased + amount,
          },
        })
      }

      // 트랜잭션 기록
      await tx.creditTransaction.create({
        data: {
          creditId: credit.id,
          type: "purchase", // 관리자 부여도 purchase 타입
          amount: amount,
          balanceAfter: credit.balance,
          description: `[관리자 부여] ${reason}`,
          relatedType: null,
          relatedId: null,
        },
      })

      return credit
    })

    logger.info("Credit granted by admin", {
      adminId: session.user.id,
      targetUserId: userId,
      targetEmail: user.email,
      amount,
      reason,
      newBalance: result.balance,
    })

    return NextResponse.json({
      success: true,
      userId,
      amount,
      newBalance: result.balance,
      message: `${user.name || user.email}님에게 ${amount}C가 부여되었습니다`,
    })
  } catch (error) {
    // requireAdmin이 throw한 경우
    if (error instanceof Response) {
      return error
    }

    logger.error("Failed to grant credit", { error })
    return NextResponse.json(
      { error: "크래딧 부여 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
