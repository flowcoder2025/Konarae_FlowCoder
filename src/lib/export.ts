/**
 * Document Export Library (PRD Feature 2 - 내보내기)
 * - PDF 내보내기 (jsPDF)
 * - DOCX 내보내기 (docx)
 * - HWP 내보내기 (외부 서비스)
 */

import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

export type ExportFormat = "pdf" | "docx" | "hwp";

export interface BusinessPlanExportData {
  title: string;
  companyName?: string;
  projectName?: string;
  createdAt: Date;
  sections: Array<{
    title: string;
    content: string;
    order: number;
  }>;
  metadata?: {
    author?: string;
    tags?: string[];
  };
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  error?: string;
}

/**
 * PDF 내보내기 (jsPDF 사용)
 */
export async function exportToPDF(
  data: BusinessPlanExportData
): Promise<ExportResult> {
  try {
    // jsPDF 한글 폰트 설정 필요 (향후 추가)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    let yPosition = 20;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const lineHeight = 7;

    // 제목
    doc.setFontSize(20);
    doc.text(data.title, margin, yPosition);
    yPosition += lineHeight * 2;

    // 회사명 & 프로젝트명
    if (data.companyName) {
      doc.setFontSize(12);
      doc.text(`Company: ${data.companyName}`, margin, yPosition);
      yPosition += lineHeight;
    }

    if (data.projectName) {
      doc.setFontSize(12);
      doc.text(`Project: ${data.projectName}`, margin, yPosition);
      yPosition += lineHeight;
    }

    yPosition += lineHeight;

    // 섹션별 내용
    const sortedSections = data.sections.sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // 페이지 체크
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }

      // 섹션 제목
      doc.setFontSize(14);
      doc.text(section.title, margin, yPosition);
      yPosition += lineHeight;

      // 섹션 내용 (간단한 줄바꿈 처리)
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(
        section.content,
        doc.internal.pageSize.width - margin * 2
      );

      for (const line of lines) {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += lineHeight;
      }

      yPosition += lineHeight;
    }

    // Blob 생성
    const blob = doc.output("blob");
    const filename = `${sanitizeFilename(data.title)}_${Date.now()}.pdf`;

    return {
      success: true,
      blob,
      filename,
    };
  } catch (error) {
    console.error("[Export] PDF export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "PDF export failed",
    };
  }
}

/**
 * DOCX 내보내기 (docx 라이브러리 사용)
 */
export async function exportToDOCX(
  data: BusinessPlanExportData
): Promise<ExportResult> {
  try {
    const sections = data.sections.sort((a, b) => a.order - b.order);

    // 문서 생성
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // 제목
            new Paragraph({
              text: data.title,
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }), // 빈 줄

            // 회사명
            ...(data.companyName
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `회사명: ${data.companyName}`,
                        bold: true,
                      }),
                    ],
                  }),
                ]
              : []),

            // 프로젝트명
            ...(data.projectName
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `지원사업: ${data.projectName}`,
                        bold: true,
                      }),
                    ],
                  }),
                  new Paragraph({ text: "" }),
                ]
              : []),

            // 섹션별 내용
            ...sections.flatMap((section) => [
              new Paragraph({
                text: section.title,
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({
                text: section.content,
              }),
              new Paragraph({ text: "" }), // 빈 줄
            ]),

            // 메타데이터
            ...(data.metadata?.author
              ? [
                  new Paragraph({ text: "" }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `작성자: ${data.metadata.author}`,
                        italics: true,
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.RIGHT,
                  }),
                ]
              : []),

            new Paragraph({
              children: [
                new TextRun({
                  text: `생성일: ${data.createdAt.toLocaleDateString("ko-KR")}`,
                  italics: true,
                  size: 20,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        },
      ],
    });

    // Blob 생성
    const blob = await Packer.toBlob(doc);
    const filename = `${sanitizeFilename(data.title)}_${Date.now()}.docx`;

    return {
      success: true,
      blob,
      filename,
    };
  } catch (error) {
    console.error("[Export] DOCX export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "DOCX export failed",
    };
  }
}

/**
 * HWP 내보내기 (외부 서비스 필요)
 * 현재는 DOCX로 내보낸 후 사용자에게 변환 안내
 */
export async function exportToHWP(
  data: BusinessPlanExportData
): Promise<ExportResult> {
  try {
    // DOCX로 먼저 내보내기
    const docxResult = await exportToDOCX(data);

    if (!docxResult.success) {
      return docxResult;
    }

    // HWP 변환은 외부 서비스 필요
    // 현재는 DOCX 파일을 반환하고 안내 메시지 추가
    return {
      success: true,
      blob: docxResult.blob,
      filename: docxResult.filename?.replace(".docx", ".hwp"),
      error:
        "HWP 직접 내보내기는 지원되지 않습니다. DOCX 파일을 한글(HWP)에서 열어 저장해주세요.",
    };
  } catch (error) {
    console.error("[Export] HWP export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "HWP export failed",
    };
  }
}

/**
 * 통합 내보내기 함수
 */
export async function exportBusinessPlan(
  data: BusinessPlanExportData,
  format: ExportFormat
): Promise<ExportResult> {
  switch (format) {
    case "pdf":
      return exportToPDF(data);
    case "docx":
      return exportToDOCX(data);
    case "hwp":
      return exportToHWP(data);
    default:
      return {
        success: false,
        error: `Unsupported format: ${format}`,
      };
  }
}

/**
 * 파일명 sanitize (특수문자 제거)
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9가-힣_\-\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

/**
 * 브라우저에서 파일 다운로드 트리거
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
