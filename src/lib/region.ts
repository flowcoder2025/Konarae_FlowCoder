/**
 * 지역 유틸리티 함수 (matching.ts 지원)
 *
 * 기능:
 * - 주소에서 지역 코드 추출
 * - 지역 매칭 여부 확인
 * - 지역 정규화
 */

/**
 * 표준 지역 코드
 */
export const REGION_CODES = [
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
] as const

export type RegionCode = (typeof REGION_CODES)[number]

/**
 * 주소/지역명에서 표준 지역 코드 추출을 위한 매핑
 * - 풀네임, 약어, 변형 모두 처리
 */
const REGION_PATTERNS: Array<{ patterns: string[]; code: RegionCode }> = [
  // 특별시/광역시
  { patterns: ["서울특별시", "서울시", "서울"], code: "서울" },
  { patterns: ["부산광역시", "부산시", "부산"], code: "부산" },
  { patterns: ["대구광역시", "대구시", "대구"], code: "대구" },
  { patterns: ["인천광역시", "인천시", "인천"], code: "인천" },
  { patterns: ["광주광역시", "광주시", "광주"], code: "광주" },
  { patterns: ["대전광역시", "대전시", "대전"], code: "대전" },
  { patterns: ["울산광역시", "울산시", "울산"], code: "울산" },
  { patterns: ["세종특별자치시", "세종시", "세종"], code: "세종" },

  // 도
  { patterns: ["경기도", "경기"], code: "경기" },
  { patterns: ["강원특별자치도", "강원도", "강원"], code: "강원" },
  { patterns: ["충청북도", "충북"], code: "충북" },
  { patterns: ["충청남도", "충남"], code: "충남" },
  { patterns: ["전북특별자치도", "전라북도", "전북"], code: "전북" },
  { patterns: ["전라남도", "전남"], code: "전남" },
  { patterns: ["경상북도", "경북"], code: "경북" },
  { patterns: ["경상남도", "경남"], code: "경남" },
  { patterns: ["제주특별자치도", "제주도", "제주"], code: "제주" },
]

/**
 * 주소 문자열에서 지역 코드 추출
 *
 * @param address - 주소 문자열 (예: "대구광역시 북구 오봉로 164")
 * @returns 지역 코드 또는 null (추출 불가 시)
 *
 * @example
 * extractRegionFromAddress("대구광역시 북구 오봉로") // "대구"
 * extractRegionFromAddress("경상북도 고령군 성산면") // "경북"
 * extractRegionFromAddress("813ho") // null
 */
export function extractRegionFromAddress(address: string | null | undefined): RegionCode | null {
  if (!address || address.trim().length < 2) {
    return null
  }

  const normalizedAddress = address.trim()

  // 패턴 매칭 (긴 패턴부터 매칭하여 정확도 향상)
  for (const { patterns, code } of REGION_PATTERNS) {
    // 긴 패턴부터 확인 (예: "경상북도" > "경북")
    const sortedPatterns = [...patterns].sort((a, b) => b.length - a.length)

    for (const pattern of sortedPatterns) {
      if (normalizedAddress.includes(pattern)) {
        return code
      }
    }
  }

  return null
}

/**
 * 프로젝트 지역과 기업 지역의 매칭 여부 확인
 *
 * @param companyRegion - 기업 지역 코드 (null이면 모든 지역 매칭)
 * @param projectRegion - 프로젝트 지역 문자열
 * @returns 매칭 여부
 *
 * 규칙:
 * 1. 프로젝트 지역이 "전국"이거나 비어있으면 항상 매칭
 * 2. 기업 지역이 null이면 항상 매칭 (지역 정보 없음)
 * 3. 프로젝트 지역에 기업 지역 코드가 포함되면 매칭
 */
export function isRegionMatch(
  companyRegion: RegionCode | null,
  projectRegion: string | null | undefined
): boolean {
  // 프로젝트 지역이 없거나 "전국"이면 항상 매칭
  if (!projectRegion || projectRegion.trim() === "") {
    return true
  }

  const normalizedProjectRegion = projectRegion.trim().toLowerCase()

  // "전국" 키워드 포함 시 항상 매칭
  if (
    normalizedProjectRegion === "전국" ||
    normalizedProjectRegion.includes("전국") ||
    normalizedProjectRegion.includes("전 지역")
  ) {
    return true
  }

  // 기업 지역이 없으면 매칭 (필터링 불가)
  if (!companyRegion) {
    return true
  }

  // 프로젝트 지역에서 지역 코드 추출하여 비교
  const projectRegionCode = extractRegionFromAddress(projectRegion)

  // 프로젝트 지역 코드 추출 성공 시 직접 비교
  if (projectRegionCode) {
    return projectRegionCode === companyRegion
  }

  // 프로젝트 지역 문자열에 기업 지역 코드가 포함되어 있는지 확인
  // 예: "[대구] 2025년 지원사업" → "대구" 포함
  return normalizedProjectRegion.includes(companyRegion.toLowerCase())
}

/**
 * 지역 코드를 정규화 (다양한 형태의 입력을 표준 코드로 변환)
 *
 * @param region - 입력 지역명
 * @returns 표준 지역 코드 또는 원본 (변환 불가 시)
 *
 * @example
 * normalizeRegion("서울특별시") // "서울"
 * normalizeRegion("전북특별자치도") // "전북"
 * normalizeRegion("알 수 없음") // "알 수 없음"
 */
export function normalizeRegion(region: string): string {
  const extracted = extractRegionFromAddress(region)
  return extracted || region
}

/**
 * 두 지역이 같은 광역 지역인지 확인
 * (추후 "인근 지역" 매칭 기능 확장 시 사용)
 */
export function isSameMetroArea(region1: RegionCode, region2: RegionCode): boolean {
  // 수도권
  const sudogwon = ["서울", "경기", "인천"]
  // 충청권
  const chungcheong = ["대전", "세종", "충북", "충남"]
  // 호남권
  const honam = ["광주", "전북", "전남"]
  // 영남권
  const youngnam = ["부산", "대구", "울산", "경북", "경남"]
  // 기타
  const others = ["강원", "제주"]

  const metroAreas = [sudogwon, chungcheong, honam, youngnam, others]

  for (const area of metroAreas) {
    if (area.includes(region1) && area.includes(region2)) {
      return true
    }
  }

  return false
}
