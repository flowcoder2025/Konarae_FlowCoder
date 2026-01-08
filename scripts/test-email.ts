import { PrismaClient } from "@prisma/client";
import { sendDailyDigestEmail } from "../src/lib/notifications";

const prisma = new PrismaClient();

async function sendTestEmail() {
  console.log("📧 수정된 템플릿으로 테스트 이메일 발송\n");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const user = await prisma.user.findFirst({
    where: { email: "hyunil8702@gmail.com" },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    console.log("❌ 사용자 없음");
    return;
  }

  const matchingResults = await prisma.matchingResult.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: since },
    },
    select: {
      totalScore: true,
      confidence: true,
      matchReasons: true,
      project: {
        select: {
          id: true,
          name: true,
          organization: true,
          category: true,
          deadline: true,
          amountMin: true,
          amountMax: true,
        },
      },
      company: {
        select: { id: true, name: true },
      },
    },
    orderBy: { totalScore: "desc" },
    take: 10,
  });

  console.log("→", user.email, "|", matchingResults.length, "건");

  try {
    await sendDailyDigestEmail({
      userId: user.id,
      email: user.email,
      userName: user.name || "사용자",
      matchingResults,
      totalCount: matchingResults.length,
    });
    console.log("✅ 발송 성공");
  } catch (error) {
    console.log("❌ 발송 실패:", error instanceof Error ? error.message : error);
  }
}

sendTestEmail()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
