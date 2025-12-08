import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const projects = await prisma.supportProject.findMany({
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: {
      name: true,
      description: true,
      eligibility: true,
      applicationProcess: true,
      evaluationCriteria: true,
      amountDescription: true,
      deadline: true,
      startDate: true,
      endDate: true
    }
  });

  console.log('=== AI 분석 결과 확인 ===\n');
  projects.forEach((p, i) => {
    console.log(`[${i+1}] ${p.name}`);
    console.log(`    📝 description: ${p.description ? p.description.substring(0, 80) + '...' : '❌ 없음'}`);
    console.log(`    💰 amountDescription: ${p.amountDescription || '❌ 없음'}`);
    console.log(`    📅 deadline: ${p.deadline ? p.deadline.toISOString().split('T')[0] : '❌ 없음'}`);
    console.log(`    📆 기간: ${p.startDate ? p.startDate.toISOString().split('T')[0] : '?'} ~ ${p.endDate ? p.endDate.toISOString().split('T')[0] : '?'}`);
    console.log(`    👥 eligibility: ${p.eligibility ? '✅ 있음' : '❌ 없음'}`);
    console.log(`    📋 process: ${p.applicationProcess ? '✅ 있음' : '❌ 없음'}`);
    console.log(`    📊 evaluationCriteria: ${p.evaluationCriteria ? '✅ 있음' : '❌ 없음'}\n`);
  });

  // Count projects with AI analysis
  const withDescription = await prisma.supportProject.count({
    where: { description: { not: null } }
  });
  const total = await prisma.supportProject.count();

  console.log(`=== 통계 ===`);
  console.log(`AI 분석 완료: ${withDescription}/${total} 프로젝트`);

  await prisma.$disconnect();
}

main().catch(console.error);
