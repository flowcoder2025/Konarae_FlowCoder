/**
 * Data validation utilities for crawler
 * Prevents invalid category/region data from being saved
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "crawler-validators" });

// Valid category values (분야)
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

// Valid region values (지역)
export const VALID_REGIONS = [
  "전국",
  "서울",
  "경기",
  "인천",
  "강원",
  "충북",
  "충남",
  "대전",
  "세종",
  "전북",
  "전남",
  "광주",
  "경북",
  "경남",
  "대구",
  "울산",
  "부산",
  "제주",
  "강원도",
  "경상북도",
  "경상남도",
  "전라북도",
  "전라남도",
  "전북특별자치도",
  "충청북도",
  "충청남도",
] as const;

export type ValidCategory = (typeof VALID_CATEGORIES)[number];
export type ValidRegion = (typeof VALID_REGIONS)[number];

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
    전북특별자치도: "전북특별자치도",
    전북도: "전북특별자치도",
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
 * Validate crawled project data
 * @param project Raw project data from crawler
 * @returns Validated and normalized project data
 */
export function validateProject<T extends { category?: string; region?: string; name?: string; organization?: string }>(
  project: T
): T {
  let region = validateRegion(project.region);

  // 지역이 "전국"이고 제목/기관명에서 지역 정보를 추출할 수 있는 경우
  if (region === "전국") {
    const extractedFromName = extractRegionFromText(project.name || "");
    const extractedFromOrg = extractRegionFromText(project.organization || "");

    if (extractedFromName) {
      region = extractedFromName;
      logger.info(`Extracted region "${region}" from project name: "${project.name}"`);
    } else if (extractedFromOrg) {
      region = extractedFromOrg;
      logger.info(`Extracted region "${region}" from organization: "${project.organization}"`);
    }
  }

  return {
    ...project,
    category: validateCategory(project.category) as any,
    region: region as any,
  };
}
