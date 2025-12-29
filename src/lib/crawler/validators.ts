/**
 * Data validation utilities for crawler
 * Prevents invalid category/region data from being saved
 *
 * @version 2.0.0
 * @updated 2025-12-29
 *
 * 주요 변경사항:
 * - 카테고리 분류 강화: 제목/요약에서 키워드 추출
 * - 지역 정규화: 17개 광역시·도로 표준화 (전북특별자치도 → 전북)
 * - 시·군·구 → 광역시·도 매핑 추가
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "crawler-validators" });

// Valid category values (분야) - 10개 + 기타
export const VALID_CATEGORIES = [
  "인력",
  "수출",
  "창업",
  "기술",
  "자금",
  "판로",
  "경영",
  "R&D",
  "글로벌",
  "사업화",
  "기타",
] as const;

// 표준 지역 (17개 광역시·도 + 전국)
// 모든 지역은 이 18개 값 중 하나로 정규화됨
export const STANDARD_REGIONS = [
  "전국",
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

// 하위 호환성을 위해 VALID_REGIONS 유지 (deprecated)
export const VALID_REGIONS = STANDARD_REGIONS;

export type ValidCategory = (typeof VALID_CATEGORIES)[number];
export type StandardRegion = (typeof STANDARD_REGIONS)[number];
export type ValidRegion = StandardRegion; // alias for backward compatibility

/**
 * 시·군·구 → 광역시·도 매핑 테이블
 * 상세 검색용 subRegion과 UI 표시용 region을 함께 관리
 */
const DISTRICT_TO_REGION_MAP: Record<string, StandardRegion> = {
  // 서울특별시 자치구 (25개)
  종로구: "서울", 중구: "서울", 용산구: "서울", 성동구: "서울", 광진구: "서울",
  동대문구: "서울", 중랑구: "서울", 성북구: "서울", 강북구: "서울", 도봉구: "서울",
  노원구: "서울", 은평구: "서울", 서대문구: "서울", 마포구: "서울", 양천구: "서울",
  강서구: "서울", 구로구: "서울", 금천구: "서울", 영등포구: "서울", 동작구: "서울",
  관악구: "서울", 서초구: "서울", 강남구: "서울", 송파구: "서울", 강동구: "서울",

  // 부산광역시 자치구/군 (16개)
  중구부산: "부산", 서구부산: "부산", 동구부산: "부산", 영도구: "부산", 부산진구: "부산",
  동래구: "부산", 남구부산: "부산", 북구부산: "부산", 해운대구: "부산", 사하구: "부산",
  금정구: "부산", 강서구부산: "부산", 연제구: "부산", 수영구: "부산", 사상구: "부산",
  기장군: "부산",

  // 대구광역시 자치구/군 (8개)
  중구대구: "대구", 동구대구: "대구", 서구대구: "대구", 남구대구: "대구", 북구대구: "대구",
  수성구: "대구", 달서구: "대구", 달성군: "대구",

  // 인천광역시 자치구/군 (10개)
  중구인천: "인천", 동구인천: "인천", 미추홀구: "인천", 연수구: "인천", 남동구: "인천",
  부평구: "인천", 계양구: "인천", 서구인천: "인천", 강화군: "인천", 옹진군: "인천",

  // 광주광역시 자치구 (5개)
  동구광주: "광주", 서구광주: "광주", 남구광주: "광주", 북구광주: "광주", 광산구: "광주",

  // 대전광역시 자치구 (5개)
  동구대전: "대전", 중구대전: "대전", 서구대전: "대전", 유성구: "대전", 대덕구: "대전",

  // 울산광역시 자치구/군 (5개)
  중구울산: "울산", 남구울산: "울산", 동구울산: "울산", 북구울산: "울산", 울주군: "울산",

  // 경기도 시·군 (31개)
  수원시: "경기", 성남시: "경기", 의정부시: "경기", 안양시: "경기", 부천시: "경기",
  광명시: "경기", 평택시: "경기", 동두천시: "경기", 안산시: "경기", 고양시: "경기",
  과천시: "경기", 구리시: "경기", 남양주시: "경기", 오산시: "경기", 시흥시: "경기",
  군포시: "경기", 의왕시: "경기", 하남시: "경기", 용인시: "경기", 파주시: "경기",
  이천시: "경기", 안성시: "경기", 김포시: "경기", 화성시: "경기", 광주시: "경기",
  양주시: "경기", 포천시: "경기", 여주시: "경기", 연천군: "경기", 가평군: "경기",
  양평군: "경기",

  // 강원특별자치도 시·군 (18개)
  춘천시: "강원", 원주시: "강원", 강릉시: "강원", 동해시: "강원", 태백시: "강원",
  속초시: "강원", 삼척시: "강원", 홍천군: "강원", 횡성군: "강원", 영월군: "강원",
  평창군: "강원", 정선군: "강원", 철원군: "강원", 화천군: "강원", 양구군: "강원",
  인제군: "강원", 고성군강원: "강원", 양양군: "강원",

  // 충청북도 시·군 (11개)
  청주시: "충북", 충주시: "충북", 제천시: "충북", 보은군: "충북", 옥천군: "충북",
  영동군: "충북", 증평군: "충북", 진천군: "충북", 괴산군: "충북", 음성군: "충북",
  단양군: "충북",

  // 충청남도 시·군 (15개)
  천안시: "충남", 공주시: "충남", 보령시: "충남", 아산시: "충남", 서산시: "충남",
  논산시: "충남", 계룡시: "충남", 당진시: "충남", 금산군: "충남", 부여군: "충남",
  서천군: "충남", 청양군: "충남", 홍성군: "충남", 예산군: "충남", 태안군: "충남",

  // 전북특별자치도 시·군 (14개)
  전주시: "전북", 군산시: "전북", 익산시: "전북", 정읍시: "전북", 남원시: "전북",
  김제시: "전북", 완주군: "전북", 진안군: "전북", 무주군: "전북", 장수군: "전북",
  임실군: "전북", 순창군: "전북", 고창군: "전북", 부안군: "전북",

  // 전라남도 시·군 (22개)
  목포시: "전남", 여수시: "전남", 순천시: "전남", 나주시: "전남", 광양시: "전남",
  담양군: "전남", 곡성군: "전남", 구례군: "전남", 고흥군: "전남", 보성군: "전남",
  화순군: "전남", 장흥군: "전남", 강진군: "전남", 해남군: "전남", 영암군: "전남",
  무안군: "전남", 함평군: "전남", 영광군: "전남", 장성군: "전남", 완도군: "전남",
  진도군: "전남", 신안군: "전남",

  // 경상북도 시·군 (23개)
  포항시: "경북", 경주시: "경북", 김천시: "경북", 안동시: "경북", 구미시: "경북",
  영주시: "경북", 영천시: "경북", 상주시: "경북", 문경시: "경북", 경산시: "경북",
  군위군: "경북", 의성군: "경북", 청송군: "경북", 영양군: "경북", 영덕군: "경북",
  청도군: "경북", 고령군: "경북", 성주군: "경북", 칠곡군: "경북", 예천군: "경북",
  봉화군: "경북", 울진군: "경북", 울릉군: "경북",

  // 경상남도 시·군 (18개)
  창원시: "경남", 진주시: "경남", 통영시: "경남", 사천시: "경남", 김해시: "경남",
  밀양시: "경남", 거제시: "경남", 양산시: "경남", 의령군: "경남", 함안군: "경남",
  창녕군: "경남", 고성군경남: "경남", 남해군: "경남", 하동군: "경남", 산청군: "경남",
  함양군: "경남", 거창군: "경남", 합천군: "경남",

  // 제주특별자치도 (2개)
  제주시: "제주", 서귀포시: "제주",
};

/**
 * 텍스트에서 시·군·구명 추출 및 광역시·도 매핑
 * @returns { region: StandardRegion, subRegion: string | null }
 */
export function extractRegionInfo(text: string): { region: StandardRegion; subRegion: string | null } {
  if (!text) return { region: "전국", subRegion: null };

  const normalizedText = text.trim();

  // 1. 직접 매핑된 시·군·구 확인
  for (const [district, region] of Object.entries(DISTRICT_TO_REGION_MAP)) {
    // "구미시", "구미" 등 다양한 형태 매칭
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
    { patterns: ["광주광역시", "광주시"], region: "광주" }, // "광주"는 경기도 광주시와 중복
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
 * Validate and normalize category
 * @param value Raw category value from crawler
 * @returns Normalized category or "기타" if invalid
 */
export function validateCategory(value: string | undefined): ValidCategory {
  if (!value || value.trim().length === 0) {
    return "기타";
  }

  const trimmed = value.trim();

  // Check if it's a valid category
  if (VALID_CATEGORIES.includes(trimmed as ValidCategory)) {
    return trimmed as ValidCategory;
  }

  // Check if it's actually a region name (wrong field)
  if (VALID_REGIONS.includes(trimmed as ValidRegion)) {
    logger.warn(`Region "${trimmed}" found in category field - using "기타"`);
    return "기타";
  }

  // Check if it looks like a date
  if (/^\d{4}[-./]\d{2}[-./]\d{2}/.test(trimmed)) {
    logger.warn(`Date "${trimmed}" found in category field - using "기타"`);
    return "기타";
  }

  // Map common variations - 확장된 매핑 테이블
  const categoryMapping: Record<string, ValidCategory> = {
    // 기존 매핑
    "시설ㆍ공간ㆍ보육": "기타",
    "행사ㆍ네트워크": "경영",
    "멘토링ㆍ컨설팅ㆍ교육": "경영",
    내수: "판로",
    "판로ㆍ해외진출": "판로",
    포항: "기타", // 지역명이지만 category로는 기타 처리
    수출입: "수출",
    "R&D/기술": "R&D",
    기술개발: "기술",

    // 자금 관련
    투자: "자금",
    투자지원: "자금",
    금융: "자금",
    금융지원: "자금",
    융자: "자금",
    보증: "자금",
    보조금: "자금",
    지원금: "자금",

    // 수출/글로벌 관련
    수출지원: "수출",
    해외진출: "글로벌",
    해외: "글로벌",
    글로벌지원: "글로벌",
    수출: "수출",

    // R&D/기술 관련
    특허: "R&D",
    연구: "R&D",
    연구개발: "R&D",
    기술이전: "기술",
    인증: "기술",
    인증지원: "기술",
    기술지원: "기술",
    기술사업화: "사업화",

    // 창업 관련
    창업지원: "창업",
    스케일업: "창업",
    액셀러레이팅: "창업",
    "액셀러레이터": "창업",
    예비창업: "창업",
    초기창업: "창업",

    // 경영/교육 관련
    컨설팅: "경영",
    "컨설팅지원": "경영",
    교육: "인력",
    "교육지원": "인력",
    네트워크: "경영",
    멘토링: "경영",

    // 판로 관련
    마케팅: "판로",
    홍보: "판로",
    "홍보지원": "판로",
    판로지원: "판로",

    // 인력 관련
    인력지원: "인력",
    "고용지원": "인력",
    "채용지원": "인력",
    일자리: "인력",

    // 사업화 관련
    사업화지원: "사업화",
    상용화: "사업화",

    // 시설/공간 (기타로 분류)
    입주: "기타",
    입주지원: "기타",
    공간지원: "기타",
  };

  if (categoryMapping[trimmed]) {
    logger.info(`Mapped category "${trimmed}" → "${categoryMapping[trimmed]}"`);
    return categoryMapping[trimmed];
  }

  // 부분 일치 검사 (원문에서 키워드가 포함된 경우)
  const partialMatches: [string, ValidCategory][] = [
    // 자금 관련 키워드
    ["투자", "자금"],
    ["융자", "자금"],
    ["보증", "자금"],
    ["자금", "자금"],
    ["금융", "자금"],

    // 수출/글로벌
    ["수출", "수출"],
    ["해외", "글로벌"],
    ["글로벌", "글로벌"],

    // R&D/기술
    ["R&D", "R&D"],
    ["연구", "R&D"],
    ["기술", "기술"],
    ["특허", "R&D"],

    // 창업
    ["창업", "창업"],
    ["스타트업", "창업"],

    // 인력
    ["인력", "인력"],
    ["교육", "인력"],
    ["고용", "인력"],
    ["일자리", "인력"],

    // 경영
    ["컨설팅", "경영"],
    ["멘토링", "경영"],
    ["경영", "경영"],

    // 판로
    ["판로", "판로"],
    ["마케팅", "판로"],

    // 사업화
    ["사업화", "사업화"],
  ];

  for (const [keyword, category] of partialMatches) {
    if (trimmed.includes(keyword)) {
      logger.info(`Partial match category "${trimmed}" contains "${keyword}" → "${category}"`);
      return category;
    }
  }

  // If still unknown, use "기타"
  logger.warn(`Unknown category "${trimmed}" - using "기타"`);
  return "기타";
}

/**
 * Validate and normalize region
 * @param value Raw region value from crawler
 * @returns Normalized region or "전국" if invalid
 */
export function validateRegion(value: string | undefined): ValidRegion {
  if (!value || value.trim().length === 0) {
    return "전국";
  }

  const trimmed = value.trim();

  // Check if it's a valid region
  if (VALID_REGIONS.includes(trimmed as ValidRegion)) {
    return trimmed as ValidRegion;
  }

  // Check if it looks like a date (wrong field)
  if (/^\d{4}[-./]\d{2}[-./]\d{2}/.test(trimmed)) {
    logger.warn(`Date "${trimmed}" found in region field - using "전국"`);
    return "전국";
  }

  // Check if it's actually a category (wrong field)
  if (VALID_CATEGORIES.includes(trimmed as ValidCategory)) {
    logger.warn(`Category "${trimmed}" found in region field - using "전국"`);
    return "전국";
  }

  // Check if it's a department/ministry name
  if (
    trimmed.includes("부") ||
    trimmed.includes("청") ||
    trimmed.includes("원")
  ) {
    logger.warn(`Department "${trimmed}" found in region field - using "전국"`);
    return "전국";
  }

  // Map common variations - 확장된 지역 매핑
  const regionMapping: Record<string, ValidRegion> = {
    // 광역시
    울산광역시: "울산",
    인천광역시: "인천",
    서울특별시: "서울",
    부산광역시: "부산",
    대구광역시: "대구",
    대전광역시: "대전",
    광주광역시: "광주",

    // 도 단위
    경기도: "경기",
    강원도: "강원",
    충청북도: "충북",
    충청남도: "충남",
    전라북도: "전북",
    전라남도: "전남",
    경상북도: "경북",
    경상남도: "경남",

    // 특별자치
    제주특별자치도: "제주",
    전북특별자치도: "전북",
    전북도: "전북",
    강원특별자치도: "강원",
    세종특별자치시: "세종",

    // 복합 지역 (전국으로 처리)
    "서울/경기": "전국",
    "수도권": "전국",
    "전국 및 해외": "전국",
    "해외": "전국",
    "온라인": "전국",
  };

  if (regionMapping[trimmed]) {
    logger.info(`Mapped region "${trimmed}" → "${regionMapping[trimmed]}"`);
    return regionMapping[trimmed];
  }

  // 부분 일치 검사 (원문에서 지역명이 포함된 경우)
  const partialMatches: [string, ValidRegion][] = [
    ["서울", "서울"],
    ["경기", "경기"],
    ["인천", "인천"],
    ["강원", "강원"],
    ["충북", "충북"],
    ["충남", "충남"],
    ["대전", "대전"],
    ["세종", "세종"],
    ["전북", "전북"],
    ["전남", "전남"],
    ["광주", "광주"],
    ["경북", "경북"],
    ["경남", "경남"],
    ["대구", "대구"],
    ["울산", "울산"],
    ["부산", "부산"],
    ["제주", "제주"],
  ];

  for (const [keyword, region] of partialMatches) {
    if (trimmed.includes(keyword)) {
      logger.info(`Partial match region "${trimmed}" contains "${keyword}" → "${region}"`);
      return region;
    }
  }

  // If still unknown, use "전국"
  logger.warn(`Unknown region "${trimmed}" - using "전국"`);
  return "전국";
}

/**
 * Extract region from text (title, content, organization name)
 * 공고 제목, 내용, 기관명에서 지역 정보를 추출
 * @param text Text to analyze for region information
 * @returns Extracted region or undefined if not found
 */
export function extractRegionFromText(text: string): ValidRegion | undefined {
  if (!text) return undefined;

  // 지역명 패턴 - 순서 중요 (더 구체적인 것부터)
  const regionPatterns: [RegExp, ValidRegion][] = [
    // 광역시 패턴
    [/서울(?:특별시|시)?/g, "서울"],
    [/부산(?:광역시|시)?/g, "부산"],
    [/대구(?:광역시|시)?/g, "대구"],
    [/인천(?:광역시|시)?/g, "인천"],
    [/광주(?:광역시|시)?/g, "광주"],
    [/대전(?:광역시|시)?/g, "대전"],
    [/울산(?:광역시|시)?/g, "울산"],
    [/세종(?:특별자치시|시)?/g, "세종"],

    // 도 단위 패턴
    [/경기(?:도)?(?![\uAC00-\uD7AF])/g, "경기"],
    [/강원(?:특별자치도|도)?/g, "강원"],
    [/충청북도|충북/g, "충북"],
    [/충청남도|충남/g, "충남"],
    [/전라북도|전북(?:특별자치도)?/g, "전북"],
    [/전라남도|전남/g, "전남"],
    [/경상북도|경북/g, "경북"],
    [/경상남도|경남/g, "경남"],
    [/제주(?:특별자치도|도)?/g, "제주"],
  ];

  // 명확한 지역 키워드 패턴 (기관명에서)
  const organizationPatterns: [RegExp, ValidRegion][] = [
    [/서울(?:산업진흥원|테크노파크|창조경제혁신센터|창업지원센터)/g, "서울"],
    [/경기(?:도경제과학진흥원|테크노파크|창조경제혁신센터)/g, "경기"],
    [/인천(?:테크노파크|창조경제혁신센터|경제자유구역)/g, "인천"],
    [/부산(?:테크노파크|창조경제혁신센터|경제진흥원)/g, "부산"],
    [/대구(?:테크노파크|창조경제혁신센터|경북테크노파크)/g, "대구"],
    [/광주(?:테크노파크|창조경제혁신센터|전남테크노파크)/g, "광주"],
    [/대전(?:테크노파크|창조경제혁신센터|충남테크노파크)/g, "대전"],
    [/울산(?:테크노파크|창조경제혁신센터)/g, "울산"],
    [/강원(?:테크노파크|창조경제혁신센터)/g, "강원"],
    [/충북(?:테크노파크|창조경제혁신센터)/g, "충북"],
    [/충남(?:테크노파크|창조경제혁신센터)/g, "충남"],
    [/전북(?:테크노파크|창조경제혁신센터)/g, "전북"],
    [/전남(?:테크노파크|창조경제혁신센터)/g, "전남"],
    [/경북(?:테크노파크|창조경제혁신센터)/g, "경북"],
    [/경남(?:테크노파크|창조경제혁신센터)/g, "경남"],
    [/제주(?:테크노파크|창조경제혁신센터)/g, "제주"],
  ];

  // 기관명 패턴 먼저 확인
  for (const [pattern, region] of organizationPatterns) {
    if (pattern.test(text)) {
      return region;
    }
  }

  // 일반 지역명 패턴 확인
  for (const [pattern, region] of regionPatterns) {
    if (pattern.test(text)) {
      return region;
    }
  }

  return undefined;
}

/**
 * 텍스트(제목, 요약)에서 카테고리 추출
 * 기존 카테고리가 "기타"일 때 텍스트 분석으로 더 정확한 카테고리 결정
 */
export function extractCategoryFromText(text: string): ValidCategory | null {
  if (!text) return null;

  const normalizedText = text.toLowerCase();

  // 우선순위가 높은 키워드부터 확인 (순서 중요)
  const categoryKeywords: Array<{ keywords: string[]; category: ValidCategory }> = [
    // 스마트공장/자율공장 → 기술
    { keywords: ["스마트공장", "자율형공장", "스마트팩토리", "smart factory"], category: "기술" },

    // R&D 관련
    { keywords: ["r&d", "rnd", "연구개발", "기술개발", "특허", "지식재산"], category: "R&D" },

    // 창업 관련
    { keywords: ["창업", "스타트업", "startup", "예비창업", "초기창업", "액셀러레이팅", "액셀러레이터", "창업보육", "벤처"], category: "창업" },

    // 자금 관련
    { keywords: ["투자유치", "투자지원", "융자", "보증", "보조금", "지원금", "출자"], category: "자금" },

    // 수출/글로벌
    { keywords: ["수출", "해외진출", "글로벌", "수입", "무역", "fta", "전시회"], category: "수출" },

    // 기술/인증
    { keywords: ["인증", "iso", "기술지원", "기술혁신", "이차전지", "ai", "인공지능"], category: "기술" },

    // 사업화
    { keywords: ["사업화", "상용화", "기술사업화", "실증", "파일럿"], category: "사업화" },

    // 인력
    { keywords: ["인력", "교육", "채용", "고용", "일자리", "직업훈련", "역량강화"], category: "인력" },

    // 경영
    { keywords: ["컨설팅", "멘토링", "경영", "혁신", "네트워킹", "설명회", "세미나"], category: "경영" },

    // 판로
    { keywords: ["판로", "마케팅", "홍보", "전시", "박람회", "입점", "온라인쇼핑"], category: "판로" },
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

/**
 * Validate crawled project data (v2.0)
 * @param project Raw project data from crawler
 * @returns Validated and normalized project data with subRegion
 */
export function validateProject<T extends { category?: string; region?: string; name?: string; organization?: string; summary?: string }>(
  project: T
): T & { subRegion?: string } {
  // 1. 카테고리 검증 및 텍스트 기반 재분류
  let category = validateCategory(project.category);

  // 카테고리가 "기타"이면 제목/요약에서 추출 시도
  if (category === "기타") {
    const extractedFromName = extractCategoryFromText(project.name || "");
    const extractedFromSummary = extractCategoryFromText(project.summary || "");

    if (extractedFromName) {
      category = extractedFromName;
      logger.info(`Extracted category "${category}" from project name: "${project.name?.substring(0, 50)}..."`);
    } else if (extractedFromSummary) {
      category = extractedFromSummary;
      logger.info(`Extracted category "${category}" from summary`);
    }
  }

  // 2. 지역 검증 및 상세 지역 추출
  let region = validateRegion(project.region);
  let subRegion: string | null = null;

  // 지역이 "전국"이거나 비표준이면 텍스트에서 추출 시도
  if (region === "전국" || !STANDARD_REGIONS.includes(region as StandardRegion)) {
    // 제목에서 지역 정보 추출
    const fromName = extractRegionInfo(project.name || "");
    if (fromName.region !== "전국") {
      region = fromName.region;
      subRegion = fromName.subRegion;
      logger.info(`Extracted region "${region}" (subRegion: ${subRegion}) from name: "${project.name?.substring(0, 50)}..."`);
    } else {
      // 기관명에서 지역 정보 추출
      const fromOrg = extractRegionInfo(project.organization || "");
      if (fromOrg.region !== "전국") {
        region = fromOrg.region;
        subRegion = fromOrg.subRegion;
        logger.info(`Extracted region "${region}" (subRegion: ${subRegion}) from org: "${project.organization}"`);
      }
    }
  }

  // 3. 비표준 지역명 정규화 (예: "전북특별자치도" → "전북")
  const regionNormalization: Record<string, StandardRegion> = {
    "전북특별자치도": "전북",
    "강원특별자치도": "강원",
    "경상북도": "경북",
    "경상남도": "경남",
    "충청북도": "충북",
    "충청남도": "충남",
    "전라북도": "전북",
    "전라남도": "전남",
  };

  if (regionNormalization[region]) {
    const normalized = regionNormalization[region];
    logger.info(`Normalized region "${region}" → "${normalized}"`);
    region = normalized;
  }

  return {
    ...project,
    category: category as any,
    region: region as any,
    subRegion: subRegion || undefined,
  };
}
