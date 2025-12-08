import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const total = await prisma.projectAttachment.count();
  const stored = await prisma.projectAttachment.count({
    where: { storagePath: { not: null } }
  });
  const urlOnly = await prisma.projectAttachment.count({
    where: { storagePath: null }
  });

  console.log('=== 첨부파일 통계 ===');
  console.log('총:', total, '개');
  console.log('Storage 저장:', stored, '개');
  console.log('URL만 저장:', urlOnly, '개');

  // 샘플 확인
  const samples = await prisma.projectAttachment.findMany({
    take: 10,
    select: {
      fileName: true,
      fileType: true,
      fileSize: true,
      storagePath: true,
      shouldParse: true
    }
  });
  console.log('\n=== 샘플 데이터 ===');
  samples.forEach((s, i) => {
    const isStored = s.storagePath ? '✅ Storage' : '🔗 URL';
    console.log(`[${i+1}] ${isStored} | ${s.fileType} | ${s.fileName}`);
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
