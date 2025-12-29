#!/usr/bin/env npx ts-node
/**
 * 지원사업 분류/지역 재분류 마이그레이션 스크립트
 *
 * 실행 방법:
 * set -a && source .env.local && set +a && npx ts-node scripts/migrate-region-category.ts
 *
 * 기능:
 * 1. 기존 "기타" 카테고리 → 제목/요약 분석으로 재분류
 * 2. 기존 "전국" 지역 → 제목/기관명 분석으로 재분류
 * 3. 비표준 지역명 정규화 (전북특별자치도 → 전북)
 * 4. subRegion 필드 채우기 (시·군·구 정보)
 */

import { PrismaClient } from "@prisma/client";

// 표준 지역 (17개 광역시·도 + 전국)
const STANDARD_REGIONS = [
  "전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;

type StandardRegion = (typeof STANDARD_REGIONS)[number];
type ValidCategory = "인력" | "수출" | "창업" | "기술" | "자금" | "판로" | "경영" | "R&D" | "글로벌" | "사업화" | "기타";

// 시·군·구 → 광역시·도 매핑 테이블 (주요 도시만)
const DISTRICT_TO_REGION_MAP: Record<string, StandardRegion> = {
  // 경기도 주요 시
  수원시: "경기", 성남시: "경기", 의정부시: "경기", 안양시: "경기", 부천시: "경기",
  광명시: "경기", 평택시: "경기", 안산시: "경기", 고양시: "경기", 과천시: "경기",
  구리시: "경기", 남양주시: "경기", 오산시: "경기", 시흥시: "경기", 군포시: "경기",
  의왕시: "경기", 하남시: "경기", 용인시: "경기", 파주시: "경기", 이천시: "경기",
  안성시: "경기", 김포시: "경기", 화성시: "경기", 광주시: "경기", 양주시: "경기",
  포천시: "경기", 여주시: "경기",

  // 경북 주요 시
  포항시: "경북", 경주시: "경북", 김천시: "경북", 안동시: "경북", 구미시: "경북",
  영주시: "경북", 영천시: "경북", 상주시: "경북", 문경시: "경북", 경산시: "경북",

  // 경남 주요 시
  창원시: "경남", 진주시: "경남", 통영시: "경남", 사천시: "경남", 김해시: "경남",
  밀양시: "경남", 거제시: "경남", 양산시: "경남",

  // 충북 주요 시
  청주시: "충북", 충주시: "충북", 제천시: "충북", 옥천군: "충북",

  // 충남 주요 시
  천안시: "충남", 공주시: "충남", 보령시: "충남", 아산시: "충남", 서산시: "충남",
  논산시: "충남", 계룡시: "충남", 당진시: "충남",

  // 전북 주요 시
  전주시: "전북", 군산시: "전북", 익산시: "전북", 정읍시: "전북", 남원시: "전북",
  김제시: "전북",

  // 전남 주요 시
  목포시: "전남", 여수시: "전남", 순천시: "전남", 나주시: "전남", 광양시: "전남",

  // 강원 주요 시
  춘천시: "강원", 원주시: "강원", 강릉시: "강원", 동해시: "강원", 태백시: "강원",
  속초시: "강원", 삼척시: "강원",

  // 제주
  제주시: "제주", 서귀포시: "제주",
};

/**
 * 텍스트에서 시·군·구명 추출 및 광역시·도 매핑
 */
function extractRegionInfo(text: string): { region: StandardRegion; subRegion: string | null } {
  if (!text) return { region: "전국", subRegion: null };

  const normalizedText = text.trim();

  // 1. 직접 매핑된 시·군·구 확인
  for (const [district, region] of Object.entries(DISTRICT_TO_REGION_MAP)) {
    const districtWithoutSuffix = district.replace(/시$|군$|구$/, "");
    if (
      normalizedText.includes(district) ||
      normalizedText.includes(districtWithoutSuffix + "시") ||
      normalizedText.includes(districtWithoutSuffix + "군") ||
      normalizedText.includes(districtWithoutSuffix + "구")
    ) {
      return { region, subRegion: district };
    }
  }

  // 2. 광역시·도명 직접 매칭
  const regionPatterns: Array<{ patterns: string[]; region: StandardRegion }> = [
    { patterns: ["서울특별시", "서울시", "서울"], region: "서울" },
    { patterns: ["부산광역시", "부산시", "부산"], region: "부산" },
    { patterns: ["대구광역시", "대구시", "대구"], region: "대구" },
    { patterns: ["인천광역시", "인천시", "인천"], region: "인천" },
    { patterns: ["광주광역시", "광주시"], region: "광주" },
    { patterns: ["대전광역시", "대전시", "대전"], region: "대전" },
    { patterns: ["울산광역시", "울산시", "울산"], region: "울산" },
    { patterns: ["세종특별자치시", "세종시", "세종"], region: "세종" },
    { patterns: ["경기도", "경기"], region: "경기" },
    { patterns: ["강원특별자치도", "강원도", "강원"], region: "강원" },
    { patterns: ["충청북도", "충북"], region: "충북" },
    { patterns: ["충청남도", "충남"], region: "충남" },
    { patterns: ["전북특별자치도", "전라북도", "전북"], region: "전북" },
    { patterns: ["전라남도", "전남"], region: "전남" },
    { patterns: ["경상북도", "경북"], region: "경북" },
    { patterns: ["경상남도", "경남"], region: "경남" },
    { patterns: ["제주특별자치도", "제주도", "제주"], region: "제주" },
  ];

  for (const { patterns, region } of regionPatterns) {
    for (const pattern of patterns) {
      if (normalizedText.includes(pattern)) {
        return { region, subRegion: null };
      }
    }
  }

  return { region: "전국", subRegion: null };
}

/**
 * 텍스트에서 카테고리 추출
 */
function extractCategoryFromText(text: string): ValidCategory | null {
  if (!text) return null;

  const normalizedText = text.toLowerCase();

  const categoryKeywords: Array<{ keywords: string[]; category: ValidCategory }> = [
    { keywords: ["스마트공장", "자율형공장", "스마트팩토리"], category: "기술" },
    { keywords: ["r&d", "rnd", "연구개발", "기술개발", "특허", "지식재산"], category: "R&D" },
    { keywords: ["창업", "스타트업", "startup", "예비창업", "초기창업", "액셀러레이팅", "창업보육", "벤처"], category: "창업" },
    { keywords: ["투자유치", "투자지원", "융자", "보증", "보조금", "지원금", "출자"], category: "자금" },
    { keywords: ["수출", "해외진출", "글로벌", "수입", "무역", "전시회"], category: "수출" },
    { keywords: ["인증", "iso", "기술지원", "기술혁신", "이차전지", "ai", "인공지능"], category: "기술" },
    { keywords: ["사업화", "상용화", "기술사업화", "실증", "파일럿"], category: "사업화" },
    { keywords: ["인력", "교육", "채용", "고용", "일자리", "직업훈련", "역량강화"], category: "인력" },
    { keywords: ["컨설팅", "멘토링", "경영", "혁신", "네트워킹", "설명회", "세미나"], category: "경영" },
    { keywords: ["판로", "마케팅", "홍보", "전시", "박람회", "입점"], category: "판로" },
  ];

  for (const { keywords, category } of categoryKeywords) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        return category;
      }
    }
  }

  return null;
}

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  categoryUpdated: number;
  regionUpdated: number;
  subRegionAdded: number;
  regionNormalized: number;
  skipped: number;
  errors: number;
}

const stats: MigrationStats = {
  total: 0,
  categoryUpdated: 0,
  regionUpdated: 0,
  subRegionAdded: 0,
  regionNormalized: 0,
  skipped: 0,
  errors: 0,
};

// 비표준 지역명 정규화 맵
const REGION_NORMALIZATION: Record<string, StandardRegion> = {
  전북특별자치도: "전북",
  강원특별자치도: "강원",
  경상북도: "경북",
  경상남도: "경남",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전라남도: "전남",
  강원도: "강원",
};

async function migrateProject(project: {
  id: string;
  name: string;
  organization: string;
  category: string;
  region: string;
  summary: string;
  subRegion: string | null;
}) {
  const updates: {
    category?: string;
    region?: string;
    subRegion?: string;
  } = {};

  let changed = false;

  // 1. 비표준 지역명 정규화
  if (REGION_NORMALIZATION[project.region]) {
    updates.region = REGION_NORMALIZATION[project.region];
    stats.regionNormalized++;
    changed = true;
    console.log(`  [정규화] ${project.region} → ${updates.region}`);
  }

  // 2. "기타" 카테고리 재분류
  if (project.category === "기타") {
    const fromName = extractCategoryFromText(project.name);
    const fromSummary = extractCategoryFromText(project.summary);
    const newCategory = fromName || fromSummary;

    if (newCategory && newCategory !== "기타") {
      updates.category = newCategory;
      stats.categoryUpdated++;
      changed = true;
      console.log(`  [카테고리] 기타 → ${newCategory}`);
    }
  }

  // 3. "전국" 또는 비표준 지역 재분류
  const currentRegion = updates.region || project.region;
  if (currentRegion === "전국" || !STANDARD_REGIONS.includes(currentRegion as StandardRegion)) {
    const fromName = extractRegionInfo(project.name);
    const fromOrg = extractRegionInfo(project.organization);

    const regionInfo = fromName.region !== "전국" ? fromName : fromOrg;

    if (regionInfo.region !== "전국") {
      updates.region = regionInfo.region;
      stats.regionUpdated++;
      changed = true;
      console.log(`  [지역] ${currentRegion} → ${regionInfo.region}`);

      if (regionInfo.subRegion && !project.subRegion) {
        updates.subRegion = regionInfo.subRegion;
        stats.subRegionAdded++;
        console.log(`  [상세지역] ${regionInfo.subRegion} 추가`);
      }
    }
  }

  // 4. subRegion만 없는 경우 추출 시도
  if (!project.subRegion && !updates.subRegion) {
    const fromName = extractRegionInfo(project.name);
    const fromOrg = extractRegionInfo(project.organization);

    const subRegion = fromName.subRegion || fromOrg.subRegion;
    if (subRegion) {
      updates.subRegion = subRegion;
      stats.subRegionAdded++;
      changed = true;
      console.log(`  [상세지역] ${subRegion} 추가`);
    }
  }

  // 변경사항이 있으면 업데이트
  if (changed && Object.keys(updates).length > 0) {
    try {
      await prisma.supportProject.update({
        where: { id: project.id },
        data: updates,
      });
    } catch (error) {
      console.error(`  [오류] 업데이트 실패: ${error}`);
      stats.errors++;
    }
  } else {
    stats.skipped++;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("지원사업 분류/지역 재분류 마이그레이션 시작");
  console.log("=".repeat(60));

  // 전체 프로젝트 조회
  const projects = await prisma.supportProject.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      organization: true,
      category: true,
      region: true,
      summary: true,
      subRegion: true,
    },
  });

  stats.total = projects.length;
  console.log(`\n총 ${stats.total}개 프로젝트 처리 예정\n`);

  // 배치 처리
  const batchSize = 50;
  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize);
    console.log(`\n--- 배치 ${Math.floor(i / batchSize) + 1} (${i + 1}-${Math.min(i + batchSize, projects.length)}) ---`);

    for (const project of batch) {
      console.log(`\n[${project.name.substring(0, 50)}...]`);
      await migrateProject(project);
    }
  }

  // 결과 출력
  console.log("\n" + "=".repeat(60));
  console.log("마이그레이션 완료");
  console.log("=".repeat(60));
  console.log(`총 처리: ${stats.total}개`);
  console.log(`카테고리 변경: ${stats.categoryUpdated}개`);
  console.log(`지역 변경: ${stats.regionUpdated}개`);
  console.log(`지역 정규화: ${stats.regionNormalized}개`);
  console.log(`상세지역 추가: ${stats.subRegionAdded}개`);
  console.log(`변경 없음: ${stats.skipped}개`);
  console.log(`오류: ${stats.errors}개`);

  // 마이그레이션 후 통계
  console.log("\n" + "=".repeat(60));
  console.log("마이그레이션 후 통계");
  console.log("=".repeat(60));

  const categoryStats = await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
    SELECT category, COUNT(*) as count
    FROM "SupportProject"
    WHERE "deletedAt" IS NULL
    GROUP BY category
    ORDER BY count DESC
  `;
  console.log("\n[카테고리 분포]");
  for (const row of categoryStats) {
    console.log(`  ${row.category}: ${Number(row.count)}개`);
  }

  const regionStats = await prisma.$queryRaw<Array<{ region: string; count: bigint }>>`
    SELECT region, COUNT(*) as count
    FROM "SupportProject"
    WHERE "deletedAt" IS NULL
    GROUP BY region
    ORDER BY count DESC
  `;
  console.log("\n[지역 분포]");
  for (const row of regionStats) {
    console.log(`  ${row.region}: ${Number(row.count)}개`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("마이그레이션 오류:", error);
  prisma.$disconnect();
  process.exit(1);
});
