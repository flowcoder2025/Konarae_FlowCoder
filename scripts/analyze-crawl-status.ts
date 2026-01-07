/**
 * 크롤링 데이터 품질 분석 스크립트
 *
 * 분석 항목:
 * 1. 파싱 안된 첨부파일 (shouldParse=true, isParsed=false)
 * 2. 임베딩 안된 프로젝트 (needsEmbedding=true)
 * 3. 첨부파일 없는 공고
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/analyze-crawl-status.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  console.log('=== 크롤링 데이터 품질 분석 ===\n');
  console.log(`분석 시작: ${new Date().toISOString()}\n`);

  // ========================================
  // 1. 전체 통계
  // ========================================
  console.log('📊 1. 전체 통계');
  console.log('─'.repeat(50));

  const totalProjects = await prisma.supportProject.count({
    where: { deletedAt: null }
  });

  const totalAttachments = await prisma.projectAttachment.count();

  const totalEmbeddings = await prisma.documentEmbedding.count({
    where: { sourceType: 'support_project' }
  });

  console.log(`총 프로젝트: ${totalProjects.toLocaleString()}개`);
  console.log(`총 첨부파일: ${totalAttachments.toLocaleString()}개`);
  console.log(`총 임베딩: ${totalEmbeddings.toLocaleString()}개`);
  console.log('');

  // ========================================
  // 2. 파싱 상태 분석
  // ========================================
  console.log('📄 2. 첨부파일 파싱 상태');
  console.log('─'.repeat(50));

  const parsableFiles = await prisma.projectAttachment.count({
    where: { shouldParse: true }
  });

  const parsedFiles = await prisma.projectAttachment.count({
    where: { shouldParse: true, isParsed: true }
  });

  const unparsedFiles = await prisma.projectAttachment.count({
    where: { shouldParse: true, isParsed: false }
  });

  const filesWithError = await prisma.projectAttachment.count({
    where: {
      shouldParse: true,
      isParsed: false,
      parseError: { not: null }
    }
  });

  console.log(`파싱 대상 파일: ${parsableFiles.toLocaleString()}개`);
  console.log(`  ✅ 파싱 완료: ${parsedFiles.toLocaleString()}개`);
  console.log(`  ❌ 파싱 안됨: ${unparsedFiles.toLocaleString()}개`);
  console.log(`     - 에러 있음: ${filesWithError.toLocaleString()}개`);
  console.log(`     - 에러 없음 (미시도): ${(unparsedFiles - filesWithError).toLocaleString()}개`);
  console.log('');

  // 파싱 안된 파일 샘플
  if (unparsedFiles > 0) {
    console.log('📋 파싱 안된 파일 샘플 (최대 10개):');
    const unparsedSamples = await prisma.projectAttachment.findMany({
      where: { shouldParse: true, isParsed: false },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        sourceUrl: true,
        parseError: true,
        storagePath: true,
        project: {
          select: { id: true, name: true }
        }
      },
      take: 10
    });

    unparsedSamples.forEach((f, i) => {
      const hasStorage = f.storagePath ? '💾' : '🔗';
      const hasError = f.parseError ? '⚠️' : '⏳';
      console.log(`  [${i + 1}] ${hasStorage}${hasError} ${f.fileName}`);
      console.log(`      Type: ${f.fileType} | Project: ${f.project.name.substring(0, 30)}...`);
      if (f.parseError) {
        console.log(`      Error: ${f.parseError.substring(0, 80)}`);
      }
    });
    console.log('');
  }

  // ========================================
  // 3. 임베딩 상태 분석
  // ========================================
  console.log('🧠 3. 임베딩 상태');
  console.log('─'.repeat(50));

  const needsEmbedding = await prisma.supportProject.count({
    where: { needsEmbedding: true, deletedAt: null }
  });

  const hasEmbedding = await prisma.supportProject.count({
    where: { needsEmbedding: false, deletedAt: null }
  });

  // document_embeddings에 실제 존재하는 프로젝트 수
  const projectsWithEmbeddings = await prisma.documentEmbedding.groupBy({
    by: ['sourceId'],
    where: { sourceType: 'support_project' }
  });

  console.log(`임베딩 필요 프로젝트: ${needsEmbedding.toLocaleString()}개`);
  console.log(`임베딩 완료 프로젝트 (플래그 기준): ${hasEmbedding.toLocaleString()}개`);
  console.log(`실제 임베딩 존재 프로젝트: ${projectsWithEmbeddings.length.toLocaleString()}개`);
  console.log('');

  // ========================================
  // 4. 첨부파일 없는 공고
  // ========================================
  console.log('📎 4. 첨부파일 없는 공고');
  console.log('─'.repeat(50));

  // 첨부파일이 0개인 프로젝트 찾기
  const projectsWithoutAttachments = await prisma.supportProject.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      organization: true,
      sourceUrl: true,
      detailUrl: true,
      attachmentUrls: true,
      _count: {
        select: { attachments: true }
      }
    }
  });

  const noAttachmentProjects = projectsWithoutAttachments.filter(
    p => p._count.attachments === 0 && (!p.attachmentUrls || p.attachmentUrls.length === 0)
  );

  // detailUrl이 있는 것과 없는 것 분류
  const withDetailUrl = noAttachmentProjects.filter(p => p.detailUrl);
  const withoutDetailUrl = noAttachmentProjects.filter(p => !p.detailUrl);

  console.log(`첨부파일 없는 공고: ${noAttachmentProjects.length.toLocaleString()}개`);
  console.log(`  - detailUrl 있음 (재크롤링 가능): ${withDetailUrl.length.toLocaleString()}개`);
  console.log(`  - detailUrl 없음: ${withoutDetailUrl.length.toLocaleString()}개`);
  console.log('');

  // 재크롤링 가능한 공고 샘플
  if (withDetailUrl.length > 0) {
    console.log('📋 재크롤링 가능한 공고 샘플 (최대 10개):');
    withDetailUrl.slice(0, 10).forEach((p, i) => {
      console.log(`  [${i + 1}] ${p.name.substring(0, 50)}...`);
      console.log(`      기관: ${p.organization}`);
      console.log(`      URL: ${p.detailUrl?.substring(0, 60)}...`);
    });
    console.log('');
  }

  // ========================================
  // 5. 파일 타입별 분포
  // ========================================
  console.log('📁 5. 파일 타입별 분포');
  console.log('─'.repeat(50));

  const fileTypeStats = await prisma.projectAttachment.groupBy({
    by: ['fileType'],
    _count: { id: true }
  });

  fileTypeStats.forEach(stat => {
    console.log(`  ${stat.fileType}: ${stat._count.id.toLocaleString()}개`);
  });
  console.log('');

  // ========================================
  // 6. 파싱 에러 유형 분석
  // ========================================
  console.log('⚠️ 6. 파싱 에러 유형 분석');
  console.log('─'.repeat(50));

  const errorFiles = await prisma.projectAttachment.findMany({
    where: {
      parseError: { not: null }
    },
    select: { parseError: true }
  });

  // 에러 유형별 카운트
  const errorTypes: Record<string, number> = {};
  errorFiles.forEach(f => {
    const errorType = categorizeError(f.parseError!);
    errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
  });

  Object.entries(errorTypes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count.toLocaleString()}개`);
    });
  console.log('');

  // ========================================
  // 7. 기관별 첨부파일 없는 공고 분포
  // ========================================
  console.log('🏢 7. 기관별 첨부파일 없는 공고 (Top 10)');
  console.log('─'.repeat(50));

  const orgStats: Record<string, number> = {};
  noAttachmentProjects.forEach(p => {
    orgStats[p.organization] = (orgStats[p.organization] || 0) + 1;
  });

  Object.entries(orgStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([org, count]) => {
      console.log(`  ${org}: ${count.toLocaleString()}개`);
    });
  console.log('');

  // ========================================
  // 8. 요약 및 권장 조치
  // ========================================
  console.log('📌 8. 요약 및 권장 조치');
  console.log('─'.repeat(50));

  console.log('\n🎯 조치 필요 항목:');
  console.log(`  1. 파싱 재시도 필요: ${unparsedFiles.toLocaleString()}개 파일`);
  console.log(`  2. 임베딩 생성 필요: ${needsEmbedding.toLocaleString()}개 프로젝트`);
  console.log(`  3. 재크롤링 가능: ${withDetailUrl.length.toLocaleString()}개 공고`);

  // 상세 JSON 출력 (디버깅용)
  const summaryData = {
    timestamp: new Date().toISOString(),
    stats: {
      totalProjects,
      totalAttachments,
      totalEmbeddings,
      parsableFiles,
      parsedFiles,
      unparsedFiles,
      filesWithError,
      needsEmbedding,
      hasEmbedding,
      noAttachmentProjects: noAttachmentProjects.length,
      recrawlableProjects: withDetailUrl.length
    },
    fileTypeStats,
    errorTypes,
    recrawlableSample: withDetailUrl.slice(0, 20).map(p => ({
      id: p.id,
      name: p.name,
      organization: p.organization,
      detailUrl: p.detailUrl
    }))
  };

  console.log('\n📊 JSON Summary:');
  console.log(JSON.stringify(summaryData.stats, null, 2));

  await prisma.$disconnect();
  console.log('\n분석 완료!');
}

/**
 * 에러 메시지를 카테고리화
 */
function categorizeError(error: string): string {
  const lower = error.toLowerCase();

  if (lower.includes('download failed') || lower.includes('다운로드')) {
    return 'Download Failed';
  }
  if (lower.includes('upload failed') || lower.includes('업로드')) {
    return 'Upload Failed';
  }
  if (lower.includes('timeout') || lower.includes('시간 초과')) {
    return 'Timeout';
  }
  if (lower.includes('parse') || lower.includes('파싱')) {
    return 'Parse Failed';
  }
  if (lower.includes('hwp') || lower.includes('한글')) {
    return 'HWP Parse Error';
  }
  if (lower.includes('pdf')) {
    return 'PDF Parse Error';
  }
  if (lower.includes('empty') || lower.includes('비어있') || lower.includes('0 bytes')) {
    return 'Empty File';
  }
  if (lower.includes('network') || lower.includes('네트워크') || lower.includes('connect')) {
    return 'Network Error';
  }

  return 'Other';
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
