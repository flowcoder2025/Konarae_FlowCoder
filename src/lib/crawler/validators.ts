/**
 * Data validation utilities for crawler
 * Prevents invalid category/region data from being saved
 */

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
    console.warn(
      `[Crawler] Region "${trimmed}" found in category field - using "기타"`
    );
    return "기타";
  }

  // Check if it looks like a date
  if (/^\d{4}[-./]\d{2}[-./]\d{2}/.test(trimmed)) {
    console.warn(
      `[Crawler] Date "${trimmed}" found in category field - using "기타"`
    );
    return "기타";
  }

  // Map common variations
  const categoryMapping: Record<string, ValidCategory> = {
    "시설ㆍ공간ㆍ보육": "기타",
    "행사ㆍ네트워크": "기타",
    "멘토링ㆍ컨설팅ㆍ교육": "경영",
    내수: "판로",
    "판로ㆍ해외진출": "판로",
    포항: "기타", // 지역명이지만 category로는 기타 처리
    수출입: "수출",
    "R&D/기술": "R&D",
    기술개발: "기술",
  };

  if (categoryMapping[trimmed]) {
    console.info(
      `[Crawler] Mapped category "${trimmed}" → "${categoryMapping[trimmed]}"`
    );
    return categoryMapping[trimmed];
  }

  // If still unknown, use "기타"
  console.warn(`[Crawler] Unknown category "${trimmed}" - using "기타"`);
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
    console.warn(
      `[Crawler] Date "${trimmed}" found in region field - using "전국"`
    );
    return "전국";
  }

  // Check if it's actually a category (wrong field)
  if (VALID_CATEGORIES.includes(trimmed as ValidCategory)) {
    console.warn(
      `[Crawler] Category "${trimmed}" found in region field - using "전국"`
    );
    return "전국";
  }

  // Check if it's a department/ministry name
  if (
    trimmed.includes("부") ||
    trimmed.includes("청") ||
    trimmed.includes("원")
  ) {
    console.warn(
      `[Crawler] Department "${trimmed}" found in region field - using "전국"`
    );
    return "전국";
  }

  // Map common variations
  const regionMapping: Record<string, ValidRegion> = {
    울산광역시: "울산",
    제주특별자치도: "제주",
    인천광역시: "인천",
    서울특별시: "서울",
    부산광역시: "부산",
    대구광역시: "대구",
    대전광역시: "대전",
    광주광역시: "광주",
    경기도: "경기",
    전북도: "전북특별자치도",
  };

  if (regionMapping[trimmed]) {
    console.info(
      `[Crawler] Mapped region "${trimmed}" → "${regionMapping[trimmed]}"`
    );
    return regionMapping[trimmed];
  }

  // If still unknown, use "전국"
  console.warn(`[Crawler] Unknown region "${trimmed}" - using "전국"`);
  return "전국";
}

/**
 * Validate crawled project data
 * @param project Raw project data from crawler
 * @returns Validated and normalized project data
 */
export function validateProject<T extends { category?: string; region?: string }>(
  project: T
): T {
  return {
    ...project,
    category: validateCategory(project.category) as any,
    region: validateRegion(project.region) as any,
  };
}
