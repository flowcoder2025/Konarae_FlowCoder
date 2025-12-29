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
  포천시: "경기", 여주시: "경기", 동두천시: "경기", 가평군: "경기", 양평군: "경기",
  연천군: "경기",

  // 경북 주요 시
  포항시: "경북", 경주시: "경북", 김천시: "경북", 안동시: "경북", 구미시: "경북",
  영주시: "경북", 영천시: "경북", 상주시: "경북", 문경시: "경북", 경산시: "경북",
  군위군: "경북", 의성군: "경북", 청송군: "경북", 영양군: "경북", 영덕군: "경북",
  청도군: "경북", 고령군: "경북", 성주군: "경북", 칠곡군: "경북", 예천군: "경북",
  봉화군: "경북", 울진군: "경북", 울릉군: "경북",

  // 경남 주요 시
  창원시: "경남", 진주시: "경남", 통영시: "경남", 사천시: "경남", 김해시: "경남",
  밀양시: "경남", 거제시: "경남", 양산시: "경남", 의령군: "경남", 함안군: "경남",
  창녕군: "경남", 고성군경남: "경남", 남해군: "경남", 하동군: "경남", 산청군: "경남",
  함양군: "경남", 거창군: "경남", 합천군: "경남",

  // 충북 주요 시
  청주시: "충북", 충주시: "충북", 제천시: "충북", 옥천군: "충북", 보은군: "충북",
  영동군: "충북", 증평군: "충북", 진천군: "충북", 괴산군: "충북", 음성군: "충북",
  단양군: "충북",

  // 충남 주요 시
  천안시: "충남", 공주시: "충남", 보령시: "충남", 아산시: "충남", 서산시: "충남",
  논산시: "충남", 계룡시: "충남", 당진시: "충남", 금산군: "충남", 부여군: "충남",
  서천군: "충남", 청양군: "충남", 홍성군: "충남", 예산군: "충남", 태안군: "충남",

  // 전북 주요 시
  전주시: "전북", 군산시: "전북", 익산시: "전북", 정읍시: "전북", 남원시: "전북",
  김제시: "전북", 완주군: "전북", 진안군: "전북", 무주군: "전북", 장수군: "전북",
  임실군: "전북", 순창군: "전북", 고창군: "전북", 부안군: "전북",

  // 전남 주요 시
  목포시: "전남", 여수시: "전남", 순천시: "전남", 나주시: "전남", 광양시: "전남",
  담양군: "전남", 곡성군: "전남", 구례군: "전남", 고흥군: "전남", 보성군: "전남",
  화순군: "전남", 장흥군: "전남", 강진군: "전남", 해남군: "전남", 영암군: "전남",
  무안군: "전남", 함평군: "전남", 영광군: "전남", 장성군: "전남", 완도군: "전남",
  진도군: "전남", 신안군: "전남",

  // 강원 주요 시
  춘천시: "강원", 원주시: "강원", 강릉시: "강원", 동해시: "강원", 태백시: "강원",
  속초시: "강원", 삼척시: "강원", 홍천군: "강원", 횡성군: "강원", 영월군: "강원",
  평창군: "강원", 정선군: "강원", 철원군: "강원", 화천군: "강원", 양구군: "강원",
  인제군: "강원", 고성군강원: "강원", 양양군: "강원",

  // 제주
  제주시: "제주", 서귀포시: "제주",

  // 서울 자치구
  종로구: "서울", 중구: "서울", 용산구: "서울", 성동구: "서울", 광진구: "서울",
  동대문구: "서울", 중랑구: "서울", 성북구: "서울", 강북구: "서울", 도봉구: "서울",
  노원구: "서울", 은평구: "서울", 서대문구: "서울", 마포구: "서울", 양천구: "서울",
  강서구: "서울", 구로구: "서울", 금천구: "서울", 영등포구: "서울", 동작구: "서울",
  관악구: "서울", 서초구: "서울", 강남구: "서울", 송파구: "서울", 강동구: "서울",

  // 부산 자치구
  중구부산: "부산", 서구부산: "부산", 동구부산: "부산", 영도구: "부산", 부산진구: "부산",
  동래구: "부산", 남구부산: "부산", 북구부산: "부산", 해운대구: "부산", 사하구: "부산",
  금정구: "부산", 강서구부산: "부산", 연제구: "부산", 수영구: "부산", 사상구: "부산",
  기장군: "부산",

  // 대구 자치구
  중구대구: "대구", 동구대구: "대구", 서구대구: "대구", 남구대구: "대구", 북구대구: "대구",
  수성구: "대구", 달서구: "대구", 달성군: "대구",

  // 인천 자치구
  중구인천: "인천", 동구인천: "인천", 미추홀구: "인천", 연수구: "인천", 남동구: "인천",
  부평구: "인천", 계양구: "인천", 서구인천: "인천", 강화군: "인천", 옹진군: "인천",

  // 광주 자치구
  동구광주: "광주", 서구광주: "광주", 남구광주: "광주", 북구광주: "광주", 광산구: "광주",

  // 대전 자치구
  동구대전: "대전", 중구대전: "대전", 서구대전: "대전", 유성구: "대전", 대덕구: "대전",

  // 울산 자치구
  중구울산: "울산", 남구울산: "울산", 동구울산: "울산", 북구울산: "울산", 울주군: "울산",
};

// 기관명 키워드 → 지역 매핑
const ORGANIZATION_TO_REGION_MAP: Array<{ keywords: string[]; region: StandardRegion; subRegion?: string }> = [
  // 대구
  { keywords: ["달구벌", "대구경북"], region: "대구" },
  { keywords: ["대구테크노파크", "대구TP", "대구창조경제"], region: "대구" },

  // 서울 자치구 기관 (구 없이도 매칭)
  { keywords: ["도봉구", "도봉"], region: "서울", subRegion: "도봉구" },
  { keywords: ["강동구", "강동 "], region: "서울", subRegion: "강동구" },
  { keywords: ["강남구", "강남 ", "강남취"], region: "서울", subRegion: "강남구" },
  { keywords: ["강서구", "강서 "], region: "서울", subRegion: "강서구" },
  { keywords: ["관악구", "관악 "], region: "서울", subRegion: "관악구" },
  { keywords: ["광진구", "광진경제", "광진 "], region: "서울", subRegion: "광진구" },
  { keywords: ["구로구", "구로 "], region: "서울", subRegion: "구로구" },
  { keywords: ["금천구", "금천 "], region: "서울", subRegion: "금천구" },
  { keywords: ["노원구", "노원 "], region: "서울", subRegion: "노원구" },
  { keywords: ["동대문구", "동대문 "], region: "서울", subRegion: "동대문구" },
  { keywords: ["동작구", "동작 "], region: "서울", subRegion: "동작구" },
  { keywords: ["마포구", "마포청년", "마포 "], region: "서울", subRegion: "마포구" },
  { keywords: ["서대문구", "서대문 "], region: "서울", subRegion: "서대문구" },
  { keywords: ["서초구", "서초 "], region: "서울", subRegion: "서초구" },
  { keywords: ["성동구", "성동 "], region: "서울", subRegion: "성동구" },
  { keywords: ["성북구", "성북문화", "길음청년"], region: "서울", subRegion: "성북구" },
  { keywords: ["송파구", "송파 "], region: "서울", subRegion: "송파구" },
  { keywords: ["양천구", "양천 "], region: "서울", subRegion: "양천구" },
  { keywords: ["영등포구", "영등포 "], region: "서울", subRegion: "영등포구" },
  { keywords: ["용산구", "용산 "], region: "서울", subRegion: "용산구" },
  { keywords: ["은평구", "은평 "], region: "서울", subRegion: "은평구" },
  { keywords: ["종로구", "종로 "], region: "서울", subRegion: "종로구" },
  { keywords: ["중랑구", "중랑 "], region: "서울", subRegion: "중랑구" },
  { keywords: ["강북구", "강북 "], region: "서울", subRegion: "강북구" },
  { keywords: ["중원유스센터", "중원청소년"], region: "서울" },
  { keywords: ["서울산업진흥원", "SBA", "서울경제진흥원", "서울창업허브"], region: "서울" },

  // 경기 시군구 기관
  { keywords: ["시흥산업진흥원", "시흥시", "시흥"], region: "경기", subRegion: "시흥시" },
  { keywords: ["수원시", "수원"], region: "경기", subRegion: "수원시" },
  { keywords: ["성남시", "성남", "판교"], region: "경기", subRegion: "성남시" },
  { keywords: ["용인시", "용인"], region: "경기", subRegion: "용인시" },
  { keywords: ["화성시", "화성", "동탄"], region: "경기", subRegion: "화성시" },
  { keywords: ["고양시", "고양", "일산"], region: "경기", subRegion: "고양시" },
  { keywords: ["안산시", "안산"], region: "경기", subRegion: "안산시" },
  { keywords: ["안양시", "안양"], region: "경기", subRegion: "안양시" },
  { keywords: ["평택시", "평택"], region: "경기", subRegion: "평택시" },
  { keywords: ["부천시", "부천"], region: "경기", subRegion: "부천시" },
  { keywords: ["김포시", "김포"], region: "경기", subRegion: "김포시" },
  { keywords: ["파주시", "파주"], region: "경기", subRegion: "파주시" },
  { keywords: ["경기테크노파크", "경기TP", "경기창조경제", "경기도경제과학진흥원"], region: "경기" },

  // 충남
  { keywords: ["공주대", "국립공주대"], region: "충남", subRegion: "공주시" },
  { keywords: ["천안시", "천안"], region: "충남", subRegion: "천안시" },
  { keywords: ["아산시", "아산"], region: "충남", subRegion: "아산시" },
  { keywords: ["충남테크노파크", "충남TP", "충남창조경제"], region: "충남" },

  // 충북
  { keywords: ["청주시", "청주"], region: "충북", subRegion: "청주시" },
  { keywords: ["충주시", "충주"], region: "충북", subRegion: "충주시" },
  { keywords: ["충북테크노파크", "충북TP", "충북창조경제"], region: "충북" },

  // 전북
  { keywords: ["전주시", "전주"], region: "전북", subRegion: "전주시" },
  { keywords: ["군산시", "군산"], region: "전북", subRegion: "군산시" },
  { keywords: ["익산시", "익산"], region: "전북", subRegion: "익산시" },
  { keywords: ["전북테크노파크", "전북TP", "전북창조경제", "전북경제통상진흥원"], region: "전북" },

  // 전남
  { keywords: ["여수시", "여수"], region: "전남", subRegion: "여수시" },
  { keywords: ["순천시", "순천"], region: "전남", subRegion: "순천시" },
  { keywords: ["목포시", "목포"], region: "전남", subRegion: "목포시" },
  { keywords: ["전남테크노파크", "전남TP", "전남창조경제"], region: "전남" },

  // 경북
  { keywords: ["구미시", "구미"], region: "경북", subRegion: "구미시" },
  { keywords: ["포항시", "포항"], region: "경북", subRegion: "포항시" },
  { keywords: ["경주시", "경주"], region: "경북", subRegion: "경주시" },
  { keywords: ["안동시", "안동"], region: "경북", subRegion: "안동시" },
  { keywords: ["경북테크노파크", "경북TP", "경북창조경제"], region: "경북" },

  // 경남
  { keywords: ["창원시", "창원"], region: "경남", subRegion: "창원시" },
  { keywords: ["김해시", "김해"], region: "경남", subRegion: "김해시" },
  { keywords: ["진주시", "진주"], region: "경남", subRegion: "진주시" },
  { keywords: ["경남테크노파크", "경남TP", "경남창조경제"], region: "경남" },

  // 부산
  { keywords: ["부산테크노파크", "부산TP", "부산창조경제", "부산경제진흥원"], region: "부산" },
  { keywords: ["해운대", "해운대구"], region: "부산", subRegion: "해운대구" },

  // 대전
  { keywords: ["대전테크노파크", "대전TP", "대전창조경제", "대전경제통상진흥원"], region: "대전" },
  { keywords: ["유성구"], region: "대전", subRegion: "유성구" },

  // 인천
  { keywords: ["인천테크노파크", "인천TP", "인천창조경제", "인천경제산업진흥원"], region: "인천" },

  // 광주
  { keywords: ["광주테크노파크", "광주TP", "광주창조경제"], region: "광주" },

  // 울산
  { keywords: ["울산테크노파크", "울산TP", "울산창조경제"], region: "울산" },

  // 강원
  { keywords: ["춘천시", "춘천"], region: "강원", subRegion: "춘천시" },
  { keywords: ["원주시", "원주"], region: "강원", subRegion: "원주시" },
  { keywords: ["강릉시", "강릉"], region: "강원", subRegion: "강릉시" },
  { keywords: ["강원테크노파크", "강원TP", "강원창조경제"], region: "강원" },

  // 제주
  { keywords: ["제주테크노파크", "제주TP", "제주창조경제"], region: "제주" },

  // 세종
  { keywords: ["세종시", "세종특별자치시"], region: "세종" },
];

/**
 * 텍스트에서 시·군·구명 추출 및 광역시·도 매핑
 */
function extractRegionInfo(text: string): { region: StandardRegion; subRegion: string | null } {
  if (!text) return { region: "전국", subRegion: null };

  const normalizedText = text.trim();

  // 1. 기관명 키워드 매핑 확인 (우선순위 높음)
  for (const { keywords, region, subRegion } of ORGANIZATION_TO_REGION_MAP) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        return { region, subRegion: subRegion || null };
      }
    }
  }

  // 2. 직접 매핑된 시·군·구 확인
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

  // 3. 광역시·도명 직접 매칭
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
