import { describe, it, expect } from "@jest/globals";
import {
  calculateCategoryScore,
  calculateEligibilityScore,
  checkHardDisqualification,
  calculateSoftPenalty,
} from "@/lib/matching";

describe("Matching - Category Score", () => {
  it("should score 80 for direct category match", () => {
    const score = calculateCategoryScore(
      ["기술개발", "R&D"],
      "기술개발"
    );
    expect(score).toBe(80);
  });

  it("should score 70 for multiple mapped industry keyword matches", () => {
    const score = calculateCategoryScore(
      ["소프트웨어"],
      "중소기업",
      "AI 데이터 SW 개발 기업"
    );
    expect(score).toBe(70);
  });

  it("should score 50 for generic target without industry match", () => {
    const score = calculateCategoryScore(
      ["마케팅"],
      "중소기업"
    );
    expect(score).toBe(50);
  });

  it("should score 0 for no specific target match", () => {
    const score = calculateCategoryScore(
      ["마케팅"],
      "기술개발"
    );
    expect(score).toBe(0);
  });
});

describe("Matching - Eligibility Score", () => {
  it("should score higher for venture companies", () => {
    const result = calculateEligibilityScore(
      {
        companyType: "중소기업",
        isVenture: true,
        isInnoBiz: false,
        isMainBiz: false,
      },
      {
        target: "중소기업",
        eligibility: "벤처기업",
      }
    );
    expect(result.score).toBeGreaterThan(50);
  });

  it("should score lower for non-eligible companies", () => {
    const result = calculateEligibilityScore(
      {
        companyType: "대기업",
        isVenture: false,
        isInnoBiz: false,
        isMainBiz: false,
      },
      {
        target: "중소기업",
      }
    );
    expect(result.score).toBeLessThan(80);
  });
});

describe("Matching - Hard Disqualification", () => {
  it("should disqualify companies missing high-confidence required certifications", () => {
    const result = checkHardDisqualification(
      {
        requiredCerts: {
          value: ["벤처기업"],
          confidence: "high",
        },
      } as any,
      {
        isVenture: false,
        isInnoBiz: false,
        isMainBiz: false,
      }
    );

    expect(result).toContain("벤처기업 인증 필수 (미보유)");
  });

  it("should pass companies with high-confidence required certifications", () => {
    const result = checkHardDisqualification(
      {
        requiredCerts: {
          value: ["벤처기업"],
          confidence: "high",
        },
      } as any,
      {
        isVenture: true,
        isInnoBiz: false,
        isMainBiz: false,
      }
    );

    expect(result).toEqual([]);
  });
});

describe("Matching - Soft Penalty", () => {
  it("should apply medium-confidence industry warning penalty", () => {
    const result = calculateSoftPenalty(
      {
        industryRestriction: {
          value: ["바이오"],
          confidence: "medium",
          type: "include",
        },
      } as any,
      {
        businessCategory: "소프트웨어",
        mainBusiness: "AI 플랫폼",
      }
    );

    expect(result.multiplier).toBe(0.7);
    expect(result.warnings).toContain("업종 조건 확인 필요: 바이오");
  });

  it("should not apply penalty when criteria are missing", () => {
    const result = calculateSoftPenalty(undefined, {
      businessCategory: "소프트웨어",
    });

    expect(result).toEqual({ multiplier: 1.0, warnings: [] });
  });
});
