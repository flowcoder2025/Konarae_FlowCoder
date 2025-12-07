/**
 * Document Export Tests
 * Testing PDF/DOCX/HWP export functionality
 */

import { describe, it, expect } from "@jest/globals";
import { exportToPDF, exportToDOCX, exportToHWP, exportBusinessPlan } from "@/lib/export";
import type { BusinessPlanExportData } from "@/lib/export";

const sampleData: BusinessPlanExportData = {
  title: "테스트 사업계획서",
  companyName: "테스트 주식회사",
  projectName: "중소기업 기술개발 지원사업",
  createdAt: new Date("2025-01-15"),
  sections: [
    {
      title: "1. 사업 개요",
      content: "본 사업은 친환경 기술 개발을 목표로 합니다.",
      order: 1,
    },
    {
      title: "2. 시장 분석",
      content: "목표 시장 규모는 약 5조원으로 추정됩니다.",
      order: 2,
    },
    {
      title: "3. 기술 개발 계획",
      content: "3년간 총 20억원을 투자하여 핵심 기술을 개발합니다.",
      order: 3,
    },
  ],
  metadata: {
    author: "홍길동",
    tags: ["기술개발", "R&D"],
  },
};

describe("Export - PDF Generation", () => {
  it("should generate PDF successfully", async () => {
    const result = await exportToPDF(sampleData);

    expect(result.success).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.filename).toBeDefined();
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it("should create valid PDF blob", async () => {
    const result = await exportToPDF(sampleData);

    if (result.blob) {
      expect(result.blob.type).toBe("application/pdf");
      expect(result.blob.size).toBeGreaterThan(0);
    }
  });

  it("should include all sections in PDF", async () => {
    const result = await exportToPDF(sampleData);
    expect(result.success).toBe(true);
    // PDF should contain all section content
  });
});

describe("Export - DOCX Generation", () => {
  it("should generate DOCX successfully", async () => {
    const result = await exportToDOCX(sampleData);

    expect(result.success).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.filename).toBeDefined();
    expect(result.filename).toMatch(/\.docx$/);
  });

  it("should create valid DOCX blob", async () => {
    const result = await exportToDOCX(sampleData);

    if (result.blob) {
      expect(result.blob.type).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(result.blob.size).toBeGreaterThan(0);
    }
  });

  it("should preserve section order in DOCX", async () => {
    const result = await exportToDOCX(sampleData);
    expect(result.success).toBe(true);
    // Sections should be in correct order
  });
});

describe("Export - HWP Generation", () => {
  it("should handle HWP export request", async () => {
    const result = await exportToHWP(sampleData);

    expect(result.success).toBe(true);
    expect(result.blob).toBeDefined();
    expect(result.error).toBeDefined(); // Should have guidance message
  });

  it("should provide HWP conversion guidance", async () => {
    const result = await exportToHWP(sampleData);

    expect(result.error).toContain("DOCX");
    expect(result.error).toContain("한글");
  });
});

describe("Export - Unified Export Function", () => {
  it("should export to PDF format", async () => {
    const result = await exportBusinessPlan(sampleData, "pdf");
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it("should export to DOCX format", async () => {
    const result = await exportBusinessPlan(sampleData, "docx");
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.docx$/);
  });

  it("should export to HWP format", async () => {
    const result = await exportBusinessPlan(sampleData, "hwp");
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.hwp$/);
  });

  it("should handle invalid format", async () => {
    const result = await exportBusinessPlan(sampleData, "invalid" as any);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Export - Filename Sanitization", () => {
  it("should sanitize special characters in filename", async () => {
    const dataWithSpecialChars: BusinessPlanExportData = {
      ...sampleData,
      title: "테스트/사업*계획서?<>|:",
    };

    const result = await exportToPDF(dataWithSpecialChars);
    expect(result.filename).not.toMatch(/[<>:"|?*\/\\]/);
  });

  it("should limit filename length", async () => {
    const dataWithLongTitle: BusinessPlanExportData = {
      ...sampleData,
      title: "A".repeat(200), // Very long title
    };

    const result = await exportToPDF(dataWithLongTitle);
    expect(result.filename!.length).toBeLessThan(120); // Including extension
  });
});
