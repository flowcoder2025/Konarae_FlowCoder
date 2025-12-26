/**
 * 크래딧 시스템 서비스
 * @see /docs/gap-diagnosis-plan.md
 */

import { prisma } from "@/lib/prisma"
import {
  CreditBalanceResponse,
  CreditRelatedType,
  CreditTransactionType,
  INITIAL_CREDIT_BONUS,
} from "@/types/diagnosis"

// ============================================
// 크래딧 조회
// ============================================

/**
 * 사용자 크래딧 잔액 조회 (없으면 자동 생성)
 */
export async function getOrCreateCredit(
  userId: string
): Promise<CreditBalanceResponse> {
  let credit = await prisma.credit.findUnique({
    where: { userId },
  })

  // 크래딧이 없으면 신규 생성 + 가입 보너스 지급
  if (!credit) {
    credit = await prisma.credit.create({
      data: {
        userId,
        balance: INITIAL_CREDIT_BONUS,
        totalPurchased: 0,
        totalUsed: 0,
      },
    })

    // 가입 보너스 트랜잭션 기록
    await prisma.creditTransaction.create({
      data: {
        creditId: credit.id,
        type: "signup_bonus",
        amount: INITIAL_CREDIT_BONUS,
        balanceAfter: INITIAL_CREDIT_BONUS,
        description: "신규 가입 보너스",
      },
    })
  }

  return {
    balance: credit.balance,
    totalPurchased: credit.totalPurchased,
    totalUsed: credit.totalUsed,
  }
}

/**
 * 크래딧 잔액만 조회 (없으면 null)
 */
export async function getCreditBalance(userId: string): Promise<number | null> {
  const credit = await prisma.credit.findUnique({
    where: { userId },
    select: { balance: true },
  })
  return credit?.balance ?? null
}

// ============================================
// 크래딧 사용
// ============================================

export interface UseCreditParams {
  userId: string
  amount: number
  description: string
  relatedType: CreditRelatedType
  relatedId: string
}

export interface UseCreditResult {
  success: boolean
  newBalance: number
  transactionId: string
  error?: string
}

/**
 * 크래딧 사용 (차감)
 * - 잔액 부족 시 실패
 * - 트랜잭션 기록
 */
export async function consumeCredit(
  params: UseCreditParams
): Promise<UseCreditResult> {
  const { userId, amount, description, relatedType, relatedId } = params

  if (amount <= 0) {
    return {
      success: false,
      newBalance: 0,
      transactionId: "",
      error: "사용량은 0보다 커야 합니다",
    }
  }

  // 트랜잭션으로 원자적 처리
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. 현재 잔액 조회 (잠금)
      const credit = await tx.credit.findUnique({
        where: { userId },
      })

      if (!credit) {
        throw new Error("CREDIT_NOT_FOUND")
      }

      if (credit.balance < amount) {
        throw new Error("INSUFFICIENT_BALANCE")
      }

      // 2. 잔액 차감
      const newBalance = credit.balance - amount
      await tx.credit.update({
        where: { id: credit.id },
        data: {
          balance: newBalance,
          totalUsed: credit.totalUsed + amount,
        },
      })

      // 3. 트랜잭션 기록
      const transaction = await tx.creditTransaction.create({
        data: {
          creditId: credit.id,
          type: "usage",
          amount: -amount, // 사용은 음수
          balanceAfter: newBalance,
          description,
          relatedType,
          relatedId,
        },
      })

      return {
        newBalance,
        transactionId: transaction.id,
      }
    })

    return {
      success: true,
      newBalance: result.newBalance,
      transactionId: result.transactionId,
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CREDIT_NOT_FOUND") {
        return {
          success: false,
          newBalance: 0,
          transactionId: "",
          error: "크래딧 정보를 찾을 수 없습니다. 먼저 로그인해주세요.",
        }
      }
      if (error.message === "INSUFFICIENT_BALANCE") {
        return {
          success: false,
          newBalance: 0,
          transactionId: "",
          error: "크래딧 잔액이 부족합니다",
        }
      }
    }
    throw error
  }
}

// ============================================
// 크래딧 환불
// ============================================

export interface RefundCreditParams {
  userId: string
  amount: number
  description: string
  relatedType: CreditRelatedType
  relatedId: string
}

/**
 * 크래딧 환불 (API 오류 등으로 작업 실패 시)
 */
export async function refundCredit(
  params: RefundCreditParams
): Promise<{ success: boolean; newBalance: number }> {
  const { userId, amount, description, relatedType, relatedId } = params

  const result = await prisma.$transaction(async (tx) => {
    const credit = await tx.credit.findUnique({
      where: { userId },
    })

    if (!credit) {
      throw new Error("Credit not found")
    }

    const newBalance = credit.balance + amount
    await tx.credit.update({
      where: { id: credit.id },
      data: {
        balance: newBalance,
        totalUsed: Math.max(0, credit.totalUsed - amount),
      },
    })

    await tx.creditTransaction.create({
      data: {
        creditId: credit.id,
        type: "refund",
        amount: amount, // 환불은 양수
        balanceAfter: newBalance,
        description: `[환불] ${description}`,
        relatedType,
        relatedId,
      },
    })

    return { newBalance }
  })

  return {
    success: true,
    newBalance: result.newBalance,
  }
}

// ============================================
// 트랜잭션 조회
// ============================================

export interface GetTransactionsParams {
  userId: string
  page?: number
  limit?: number
  type?: CreditTransactionType
}

/**
 * 크래딧 거래 내역 조회
 */
export async function getCreditTransactions(params: GetTransactionsParams) {
  const { userId, page = 1, limit = 20, type } = params

  const credit = await prisma.credit.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!credit) {
    return { transactions: [], total: 0 }
  }

  const where = {
    creditId: credit.id,
    ...(type && { type }),
  }

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.creditTransaction.count({ where }),
  ])

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type as CreditTransactionType,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      description: t.description,
      relatedType: t.relatedType as CreditRelatedType | null,
      relatedId: t.relatedId,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
  }
}

// ============================================
// 잔액 검증 헬퍼
// ============================================

/**
 * 크래딧 잔액 충분 여부 확인
 */
export async function hasSufficientCredit(
  userId: string,
  requiredAmount: number
): Promise<boolean> {
  const credit = await prisma.credit.findUnique({
    where: { userId },
    select: { balance: true },
  })

  return (credit?.balance ?? 0) >= requiredAmount
}

/**
 * 크래딧 잔액 부족 시 에러 메시지 생성
 */
export function getInsufficientCreditMessage(
  currentBalance: number,
  requiredAmount: number
): string {
  const shortage = requiredAmount - currentBalance
  return `크래딧이 부족합니다. 필요: ${requiredAmount}C, 현재: ${currentBalance}C (${shortage}C 부족)`
}
