import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client Singleton with Connection Pool Optimization
 *
 * Memory Optimization (2025.01):
 * - Production 환경에서도 싱글톤 유지 (연결 누수 방지)
 * - 연결 풀 설정은 DATABASE_URL의 connection_limit으로 관리
 * - Railway 환경에서 메모리 효율 개선
 *
 * DATABASE_URL 권장 설정:
 * ?pgbouncer=true&connection_limit=10&pool_timeout=20
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// Memory Optimization: Production에서도 싱글톤 유지 (연결 누수 방지)
globalForPrisma.prisma = prisma;

/**
 * Graceful shutdown handler
 * Railway/Docker 환경에서 연결 정리
 */
if (typeof process !== "undefined") {
  process.on("beforeExit", async () => {
    await prisma.$disconnect();
  });
}
