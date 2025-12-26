/**
 * 관리자 크래딧 차감 API
 * POST /api/admin/credits/deduct - 사용자 크래딧 차감
 */

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger({ api: "admin-credits-deduct" })

interface DeductCreditRequest {
  userId: string
  amount: number
  reason: string
}

export async function POST(request: Request) {
  try {
    // 관리자 권한 확인
    const session = await requireAdmin()

    const body: DeductCreditRequest = await request.json()
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
        { error: "차감할 크래딧은 0보다 커야 합니다" },
        { status: 400 }
      )
    }

    // 사용자 및 크래딧 존재 확인
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        credit: {
          select: {
            id: true,
            balance: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    if (!user.credit) {
      return NextResponse.json(
        { error: "사용자의 크래딧 정보가 없습니다" },
        { status: 404 }
      )
    }

    if (user.credit.balance < amount) {
      return NextResponse.json(
        {
          error: `잔액이 부족합니다. 현재 잔액: ${user.credit.balance}C, 차감 요청: ${amount}C`,
        },
        { status: 400 }
      )
    }

    // 크래딧 차감 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      const newBalance = user.credit!.balance - amount

      const credit = await tx.credit.update({
        where: { id: user.credit!.id },
        data: {
          balance: newBalance,
          totalUsed: { increment: amount },
        },
      })

      // 트랜잭션 기록
      await tx.creditTransaction.create({
        data: {
          creditId: credit.id,
          type: "usage",
          amount: -amount, // 차감은 음수
          balanceAfter: newBalance,
          description: `[관리자 차감] ${reason}`,
          relatedType: null,
          relatedId: null,
        },
      })

      return credit
    })

    logger.info("Credit deducted by admin", {
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
      message: `${user.name || user.email}님의 크래딧에서 ${amount}C가 차감되었습니다`,
    })
  } catch (error) {
    // requireAdmin이 throw한 경우
    if (error instanceof Response) {
      return error
    }

    logger.error("Failed to deduct credit", { error })
    return NextResponse.json(
      { error: "크래딧 차감 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
