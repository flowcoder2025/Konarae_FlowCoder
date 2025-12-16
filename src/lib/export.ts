/**
 * Document Export Library (PRD Feature 2 - 내보내기)
 * - PDF 내보내기 (pdf-lib) - 서버리스 환경 완벽 지원
 * - DOCX 내보내기 (docx) - 서버 환경 지원
 * - HWP 내보내기 (외부 서비스)
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatDateKST } from "@/lib/utils";

// Google Fonts Noto Sans KR TTF URL (Regular 400)
const NOTO_SANS_KR_URL = "https://cdn.jsdelivr.net/gh/nickhoo555/noto-sans-korean-webfont@master/fonts/NotoSansKR-Regular.otf";

// 폰트 캐시 (메모리 내 캐싱)
let cachedFontBytes: ArrayBuffer | null = null;

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
 * 한글 폰트 로드 (캐싱 지원)
 */
async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  if (cachedFontBytes) {
    return cachedFontBytes;
  }

  try {
    const response = await fetch(NOTO_SANS_KR_URL);
    if (!response.ok) {
      console.warn("[Export] Failed to load Korean font, using fallback");
      return null;
    }
    cachedFontBytes = await response.arrayBuffer();
    return cachedFontBytes;
  } catch (error) {
    console.warn("[Export] Korean font load error:", error);
    return null;
  }
}

/**
 * 텍스트를 지정된 폭에 맞게 줄바꿈 처리
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let remaining = paragraph;
    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) {
        lines.push(remaining);
        break;
      }

      // 단어 단위로 끊기 시도
      let breakPoint = remaining.lastIndexOf(" ", maxCharsPerLine);
      if (breakPoint === -1 || breakPoint < maxCharsPerLine * 0.5) {
        breakPoint = maxCharsPerLine;
      }

      lines.push(remaining.substring(0, breakPoint));
      remaining = remaining.substring(breakPoint).trimStart();
    }
  }

  return lines;
}

/**
 * PDF 내보내기 (pdf-lib 사용 - 서버리스 환경 완벽 지원)
 * - Vercel 서버리스 환경에서 안정적으로 동작
 * - 한글 폰트 임베딩 지원 (Noto Sans KR)
 */
export async function exportToPDF(
  data: BusinessPlanExportData
): Promise<ExportResult> {
  try {
    // PDF 문서 생성
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // 한글 폰트 로드 시도
    let font;
    const koreanFontBytes = await loadKoreanFont();

    if (koreanFontBytes) {
      try {
        font = await pdfDoc.embedFont(koreanFontBytes);
      } catch (fontError) {
        console.warn("[Export] Korean font embedding failed, using Helvetica:", fontError);
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
    } else {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    // A4 크기 설정
    const pageWidth = 595.28; // A4 width in points
    const pageHeight = 841.89; // A4 height in points
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    const lineHeight = 16;
    const titleSize = 24;
    const headingSize = 16;
    const bodySize = 11;

    // 텍스트 안전 처리 함수
    const safeText = (text: string | null | undefined): string => {
      return (text || "").toString();
    };

    // 최대 문자 수 계산 (대략적)
    const maxCharsPerLine = Math.floor(contentWidth / (bodySize * 0.5));

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - margin;

    // 새 페이지 추가 함수
    const ensureSpace = (requiredSpace: number) => {
      if (yPosition - requiredSpace < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        yPosition = pageHeight - margin;
      }
    };

    // 제목
    ensureSpace(titleSize + lineHeight);
    currentPage.drawText(safeText(data.title) || "사업계획서", {
      x: margin,
      y: yPosition,
      size: titleSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    yPosition -= titleSize + lineHeight;

    // 회사명
    if (data.companyName) {
      ensureSpace(lineHeight * 2);
      currentPage.drawText(`회사명: ${safeText(data.companyName)}`, {
        x: margin,
        y: yPosition,
        size: bodySize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= lineHeight;
    }

    // 프로젝트명
    if (data.projectName) {
      ensureSpace(lineHeight * 2);
      currentPage.drawText(`지원사업: ${safeText(data.projectName)}`, {
        x: margin,
        y: yPosition,
        size: bodySize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= lineHeight;
    }

    yPosition -= lineHeight; // 여백

    // 섹션별 내용
    const sortedSections = [...(data.sections || [])].sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // 섹션 제목
      ensureSpace(headingSize + lineHeight * 2);
      currentPage.drawText(safeText(section.title), {
        x: margin,
        y: yPosition,
        size: headingSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      yPosition -= headingSize + lineHeight * 0.5;

      // 섹션 내용 (줄바꿈 처리)
      const content = safeText(section.content);
      const lines = wrapText(content, maxCharsPerLine);

      for (const line of lines) {
        ensureSpace(lineHeight);
        if (line.length > 0) {
          currentPage.drawText(line, {
            x: margin,
            y: yPosition,
            size: bodySize,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
        yPosition -= lineHeight;
      }

      yPosition -= lineHeight; // 섹션 간 여백
    }

    // 메타데이터 (작성자, 날짜)
    ensureSpace(lineHeight * 3);
    yPosition -= lineHeight;

    if (data.metadata?.author) {
      currentPage.drawText(`작성자: ${safeText(data.metadata.author)}`, {
        x: pageWidth - margin - 150,
        y: yPosition,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPosition -= lineHeight;
    }

    currentPage.drawText(`생성일: ${formatDateKST(data.createdAt)}`, {
      x: pageWidth - margin - 150,
      y: yPosition,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // PDF를 Uint8Array로 저장
    const pdfBytes = await pdfDoc.save();
    // 새 ArrayBuffer로 복사하여 Blob 생성 (타입 호환성)
    const arrayBuffer = new ArrayBuffer(pdfBytes.length);
    new Uint8Array(arrayBuffer).set(pdfBytes);
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
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
    // 안전한 텍스트 추출 함수
    const safeText = (text: string | null | undefined): string => {
      return (text || "").toString();
    };

    const sections = [...(data.sections || [])].sort((a, b) => a.order - b.order);

    // 문서 생성
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // 제목
            new Paragraph({
              text: safeText(data.title) || "사업계획서",
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
                        text: `회사명: ${safeText(data.companyName)}`,
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
                        text: `지원사업: ${safeText(data.projectName)}`,
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
                text: safeText(section.title),
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({
                text: safeText(section.content),
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
                        text: `작성자: ${safeText(data.metadata.author)}`,
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
                  text: `생성일: ${formatDateKST(data.createdAt)}`,
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

    // Buffer로 생성 후 Blob 변환 (서버 환경 호환)
    const buffer = await Packer.toBuffer(doc);
    // Buffer를 Uint8Array로 변환하여 Blob 생성
    const uint8Array = new Uint8Array(buffer);
    const blob = new Blob([uint8Array], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
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
