/**
 * Matching Algorithm Unit Tests
 * Testing score calculation functions
 * NOTE: Integration tests with DB/AI are in __tests__/integration/
 */

import { describe, it, expect } from "@jest/globals";
import {
  calculateCategoryScore,
  calculateEligibilityScore,
  calculateTimelinessScore,
  calculateAmountScore,
} from "@/lib/matching";

describe("Matching - Category Score", () => {
  it("should score 60 for direct category match", () => {
    const score = calculateCategoryScore(
      ["기술개발", "R&D"],
      "기술개발"
    );
    expect(score).toBe(60);
  });

  it("should score 100 for category + subcategory match", () => {
    const score = calculateCategoryScore(
      ["기술개발", "소프트웨어"],
      "기술개발",
      "소프트웨어"
    );
    expect(score).toBe(100);
  });

  it("should score 30 for partial match", () => {
    const score = calculateCategoryScore(
      ["기술"],
      "기술개발"
    );
    expect(score).toBe(30);
  });

  it("should score 0 for no match", () => {
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

describe("Matching - Timeliness Score", () => {
  it("should score 100 for permanent recruitment", () => {
    const result = calculateTimelinessScore(undefined, true);
    expect(result.score).toBe(100);
    expect(result.reasons).toContain("상시모집");
  });

  it("should score 60 for 2 months deadline", () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 60); // 60 days from now

    const result = calculateTimelinessScore(deadline, false);
    expect(result.score).toBe(60);
  });

  it("should score 100 for approaching deadlines (7 days or less)", () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5); // 5 days from now

    const result = calculateTimelinessScore(deadline, false);
    expect(result.score).toBe(100);
    expect(result.reasons).toContain("마감 임박 (7일 이내)");
  });

  it("should score 0 for expired deadlines", () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 1); // expired
    
    const result = calculateTimelinessScore(deadline, false);
    expect(result.score).toBe(0);
  });
});

describe("Matching - Amount Score", () => {
  it("should score 100 for sweet spot (10-50% of revenue)", () => {
    const revenue = BigInt(1000000000); // 10억원
    const maxAmount = BigInt(300000000); // 3억원 (30% of revenue)

    const result = calculateAmountScore(revenue, undefined, maxAmount);
    expect(result.score).toBe(100);
  });

  it("should score 50 for no amount info", () => {
    const result = calculateAmountScore();
    expect(result.score).toBe(50);
  });

  it("should score 70 for适합한 지원 규모 (5-100% of revenue)", () => {
    const revenue = BigInt(1000000000); // 10억원
    const maxAmount = BigInt(700000000); // 7억원 (70% of revenue)

    const result = calculateAmountScore(revenue, undefined, maxAmount);
    expect(result.score).toBe(70);
  });

  it("should score 60 for 대규모 지원 (>100% of revenue)", () => {
    const revenue = BigInt(500000000); // 5억원
    const maxAmount = BigInt(1000000000); // 10억원 (200% of revenue)

    const result = calculateAmountScore(revenue, undefined, maxAmount);
    expect(result.score).toBe(60);
  });
});
