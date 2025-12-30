/**
 * Project Name Normalization Utilities
 *
 * 지원사업명을 정규화하여 중복 감지에 사용
 * - 연도 추출 (2024, 2025 등)
 * - 이름 정규화 (특수문자 제거, 공백 표준화)
 * - 2-gram 생성 (유사도 비교용)
 */

export interface NormalizedProject {
  originalName: string;
  normalizedName: string; // 연도 제외, 정규화된 이름
  projectYear: number | null; // 추출된 연도 (2024, 2025 등)
  ngrams: string[]; // 2-gram 토큰
}

/**
 * 사업명에서 연도 추출
 * - 패턴: 2024년, 2024, '24년, (2024), [2024]
 * - 가장 최근 연도 반환 (2020-2030 범위)
 */
export function extractYear(name: string): number | null {
  // 다양한 연도 패턴 매칭
  const patterns = [
    /20[2-3][0-9]년도?/g, // 2024년, 2024년도
    /\(20[2-3][0-9]\)/g, // (2024)
    /\[20[2-3][0-9]\]/g, // [2024]
    /'[2-3][0-9]년/g, // '24년
    /(?:^|[^\d])20[2-3][0-9](?:[^\d]|$)/g, // 독립된 2024
  ];

  const years: number[] = [];

  for (const pattern of patterns) {
    const matches = name.match(pattern);
    if (matches) {
      for (const match of matches) {
        // 4자리 연도 추출
        const yearMatch = match.match(/20[2-3][0-9]/);
        if (yearMatch) {
          years.push(parseInt(yearMatch[0], 10));
        }
        // 2자리 연도 추출 ('24 -> 2024)
        const shortYearMatch = match.match(/'([2-3][0-9])/);
        if (shortYearMatch) {
          years.push(2000 + parseInt(shortYearMatch[1], 10));
        }
      }
    }
  }

  // 가장 최근 연도 반환
  if (years.length > 0) {
    return Math.max(...years);
  }

  return null;
}

/**
 * 사업명 정규화
 * - 연도 제거
 * - 특수문자 제거
 * - 공백 표준화
 * - 조사/접미사 표준화
 */
export function normalizeName(name: string): string {
  let normalized = name;

  // 1. 연도 패턴 제거
  normalized = normalized
    .replace(/20[2-3][0-9]년도?/g, "") // 2024년, 2024년도
    .replace(/\(20[2-3][0-9]\)/g, "") // (2024)
    .replace(/\[20[2-3][0-9]\]/g, "") // [2024]
    .replace(/'[2-3][0-9]년/g, "") // '24년
    .replace(/(?:^|(?<=[^\d]))20[2-3][0-9](?=[^\d]|$)/g, ""); // 독립된 2024

  // 2. 차수 패턴 표준화 (1차, 제1차, 1회차 -> 제거 또는 표준화)
  normalized = normalized
    .replace(/제?\d+차\s*/g, "") // 제1차, 1차
    .replace(/\d+회차?\s*/g, "") // 1회, 1회차
    .replace(/\d+기\s*/g, ""); // 1기

  // 3. 특수문자 제거 (괄호 내용 포함)
  normalized = normalized
    .replace(/\([^)]*\)/g, "") // (내용) 제거
    .replace(/\[[^\]]*\]/g, "") // [내용] 제거
    .replace(/[『』「」【】<>《》]/g, "") // 특수 괄호
    .replace(/[~!@#$%^&*()_+=\-\[\]{};':"\\|,.<>\/?]/g, " "); // 특수문자 -> 공백

  // 4. 공백 표준화
  normalized = normalized.replace(/\s+/g, " ").trim();

  // 5. 흔한 접미사/접두사 표준화
  normalized = normalized
    .replace(/지원\s*사업$/g, "지원사업")
    .replace(/^사업\s*/g, "")
    .replace(/\s*공고$/g, "")
    .replace(/\s*모집$/g, "")
    .replace(/\s*안내$/g, "");

  // 6. 소문자 변환 (영문이 있는 경우)
  normalized = normalized.toLowerCase();

  return normalized.trim();
}

/**
 * 2-gram 생성 (공백 제거 후)
 * 예: "스마트공장지원" -> ["스마", "마트", "트공", "공장", "장지", "지원"]
 */
export function generateNgrams(text: string, n: number = 2): string[] {
  // 공백 제거
  const cleanText = text.replace(/\s+/g, "");

  if (cleanText.length < n) {
    return [cleanText];
  }

  const ngrams: string[] = [];
  for (let i = 0; i <= cleanText.length - n; i++) {
    ngrams.push(cleanText.substring(i, i + n));
  }

  return ngrams;
}

/**
 * Jaccard 유사도 계산
 * 두 집합의 교집합 / 합집합
 */
export function jaccardSimilarity(set1: string[], set2: string[]): number {
  const s1 = new Set(set1);
  const s2 = new Set(set2);

  const intersection = new Set([...s1].filter((x) => s2.has(x)));
  const union = new Set([...s1, ...s2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

/**
 * 사업명 완전 정규화
 * 연도 추출 + 이름 정규화 + 2-gram 생성
 */
export function normalizeProject(name: string): NormalizedProject {
  const projectYear = extractYear(name);
  const normalizedName = normalizeName(name);
  const ngrams = generateNgrams(normalizedName);

  return {
    originalName: name,
    normalizedName,
    projectYear,
    ngrams,
  };
}

/**
 * 두 프로젝트의 이름 유사도 계산
 * @returns 0.0 ~ 1.0 (1.0 = 동일)
 */
export function calculateNameSimilarity(
  name1: string,
  name2: string
): number {
  const proj1 = normalizeProject(name1);
  const proj2 = normalizeProject(name2);

  // 정규화된 이름이 완전히 같으면 1.0
  if (proj1.normalizedName === proj2.normalizedName) {
    return 1.0;
  }

  // 2-gram Jaccard 유사도
  return jaccardSimilarity(proj1.ngrams, proj2.ngrams);
}

/**
 * 두 프로젝트의 종합 유사도 계산
 * - 이름 유사도 (70%)
 * - 마감일 근접성 (15%)
 * - 지원금액 근접성 (15%)
 */
export interface SimilarityFactors {
  name1: string;
  name2: string;
  deadline1?: Date | null;
  deadline2?: Date | null;
  amount1?: bigint | null;
  amount2?: bigint | null;
}

export interface SimilarityResult {
  totalScore: number; // 0.0 ~ 1.0
  nameSimilarity: number;
  deadlineSimilarity: number;
  amountSimilarity: number;
  yearMatch: boolean; // 연도 일치 여부
  project1Year: number | null;
  project2Year: number | null;
}

export function calculateProjectSimilarity(
  factors: SimilarityFactors
): SimilarityResult {
  const proj1 = normalizeProject(factors.name1);
  const proj2 = normalizeProject(factors.name2);

  // 이름 유사도
  let nameSimilarity: number;
  if (proj1.normalizedName === proj2.normalizedName) {
    nameSimilarity = 1.0;
  } else {
    nameSimilarity = jaccardSimilarity(proj1.ngrams, proj2.ngrams);
  }

  // 마감일 유사도 (7일 이내면 1.0, 30일까지 선형 감소)
  let deadlineSimilarity = 0.5; // 기본값 (정보 없음)
  if (factors.deadline1 && factors.deadline2) {
    const diffDays = Math.abs(
      (factors.deadline1.getTime() - factors.deadline2.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (diffDays <= 7) {
      deadlineSimilarity = 1.0;
    } else if (diffDays <= 30) {
      deadlineSimilarity = 1.0 - (diffDays - 7) / 23; // 선형 감소
    } else {
      deadlineSimilarity = 0;
    }
  }

  // 지원금액 유사도 (20% 이내면 1.0, 50%까지 선형 감소)
  let amountSimilarity = 0.5; // 기본값 (정보 없음)
  if (factors.amount1 && factors.amount2) {
    const amt1 = Number(factors.amount1);
    const amt2 = Number(factors.amount2);
    const maxAmt = Math.max(amt1, amt2);
    const minAmt = Math.min(amt1, amt2);

    if (maxAmt === 0) {
      amountSimilarity = 1.0;
    } else {
      const ratio = minAmt / maxAmt;
      if (ratio >= 0.8) {
        amountSimilarity = 1.0;
      } else if (ratio >= 0.5) {
        amountSimilarity = (ratio - 0.5) / 0.3; // 0.5 -> 0, 0.8 -> 1
      } else {
        amountSimilarity = 0;
      }
    }
  }

  // 연도 일치 여부
  const yearMatch =
    proj1.projectYear !== null &&
    proj2.projectYear !== null &&
    proj1.projectYear === proj2.projectYear;

  // 가중 평균 (이름 70%, 마감일 15%, 금액 15%)
  const totalScore =
    nameSimilarity * 0.7 +
    deadlineSimilarity * 0.15 +
    amountSimilarity * 0.15;

  return {
    totalScore,
    nameSimilarity,
    deadlineSimilarity,
    amountSimilarity,
    yearMatch,
    project1Year: proj1.projectYear,
    project2Year: proj2.projectYear,
  };
}

/**
 * 연도가 같은 프로젝트인지 확인 (중복 판정의 전제조건)
 * - 둘 다 연도가 있으면: 같아야 true
 * - 하나만 연도가 있으면: true (연도 미기재 프로젝트와 매칭 허용)
 * - 둘 다 연도가 없으면: true
 */
export function isSameYearProject(
  year1: number | null,
  year2: number | null
): boolean {
  if (year1 !== null && year2 !== null) {
    return year1 === year2;
  }
  return true; // 연도 정보 부족 시 매칭 허용
}
