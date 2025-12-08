import * as dotenv from 'dotenv';
import path from 'path';

// 환경 변수 먼저 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  // 환경 변수 로드 후 동적 import
  const { processCrawlJob } = await import('../src/lib/crawler/worker');
  const { prisma } = await import('../src/lib/prisma');

  // 기존 첨부파일 삭제
  const deleted = await prisma.projectAttachment.deleteMany({});
  console.log('기존 첨부파일 삭제:', deleted.count, '개');

  // pending 상태인 job 찾기 또는 새로 생성
  let job = await prisma.crawlJob.findFirst({
    where: { status: 'pending' },
    include: { source: true }
  });

  if (!job) {
    const source = await prisma.crawlSource.findFirst();
    if (!source) {
      console.log('크롤링 소스가 없습니다');
      return;
    }
    job = await prisma.crawlJob.create({
      data: {
        sourceId: source.id,
        status: 'pending'
      },
      include: { source: true }
    });
    console.log('새 크롤링 작업 생성:', job.id);
  }

  console.log('\n=== 크롤링 시작 (선택적 저장 전략) ===');
  console.log('Source:', job.source.name);

  const result = await processCrawlJob(job.id);
  console.log('\n=== 크롤링 완료 ===');
  console.log(result);

  // 결과 확인
  const stats = await prisma.projectAttachment.groupBy({
    by: ['shouldParse'],
    _count: true
  });
  console.log('\n=== 저장 통계 ===');
  stats.forEach(s => {
    console.log(`shouldParse=${s.shouldParse}: ${s._count}개`);
  });

  const stored = await prisma.projectAttachment.count({
    where: { storagePath: { not: null } }
  });
  console.log(`Storage 저장: ${stored}개`);

  // 파일명 확인 (인코딩 테스트)
  console.log('\n=== 파일명 확인 ===');
  const files = await prisma.projectAttachment.findMany({
    take: 10,
    select: { fileName: true, fileType: true, storagePath: true }
  });
  files.forEach((f, i) => {
    const stored = f.storagePath ? '✅ Storage' : '🔗 URL';
    console.log(`[${i+1}] ${stored} | ${f.fileType} | ${f.fileName}`);
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { prisma } = await import('../src/lib/prisma');
  await prisma.$disconnect();
  process.exit(1);
});
