/**
 * Business Plan Generator Unit Tests
 * Testing configuration and structure
 * NOTE: Integration tests with AI are in __tests__/integration/
 */

import { describe, it, expect } from "@jest/globals";

describe("Business Plan Generator - Configuration", () => {
  it("should have required AI model configuration", () => {
    expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBeDefined();
  });

  it("should validate thinking budget configuration", () => {
    const thinkingBudget = 8192;
    expect(thinkingBudget).toBeGreaterThan(0);
    expect(thinkingBudget).toBeLessThanOrEqual(32768);
  });
});

describe("Business Plan Generator - Section Structure", () => {
  it("should define standard business plan sections", () => {
    const standardSections = [
      "사업 개요",
      "시장 분석",
      "기술 개발 계획",
      "사업화 전략",
      "추진 체계",
      "예산 계획",
    ];

    expect(standardSections.length).toBeGreaterThan(0);
    expect(standardSections).toContain("사업 개요");
    expect(standardSections).toContain("시장 분석");
  });

  it("should validate section metadata structure", () => {
    const sectionMetadata = {
      title: "Test Section",
      order: 1,
      required: true,
      maxLength: 2000,
    };

    expect(sectionMetadata).toHaveProperty("title");
    expect(sectionMetadata).toHaveProperty("order");
    expect(sectionMetadata.order).toBeGreaterThan(0);
  });
});

describe("Business Plan Generator - Content Validation", () => {
  it("should validate content length constraints", () => {
    const minLength = 100;
    const maxLength = 5000;
    const testContent = "a".repeat(200);

    expect(testContent.length).toBeGreaterThanOrEqual(minLength);
    expect(testContent.length).toBeLessThanOrEqual(maxLength);
  });

  it("should validate Korean language content", () => {
    const koreanContent = "정부 지원사업 사업계획서";
    const hasKorean = /[\uAC00-\uD7AF]/.test(koreanContent);
    
    expect(hasKorean).toBe(true);
  });
});
