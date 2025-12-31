/**
 * Document Export Library (PRD Feature 2 - 내보내기)
 * - PDF 내보내기 (pdf-lib) - 서버리스 환경 완벽 지원
 * - DOCX 내보내기 (docx + 마크다운 파싱) - 완전한 마크다운 지원
 * - HWP 내보내기 (외부 서비스)
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageOrientation,
  convertInchesToTwip,
  Footer,
  PageNumber,
  NumberFormat,
  Header,
} from "docx";
import {
  markdownToDocxElements,
  convertSectionsToDocx,
  NUMBERING_CONFIG,
  STYLES,
} from "./markdown-to-docx";
import type { MermaidImage } from "./mermaid-to-image";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatDateKST } from "@/lib/utils";
import { readFile } from "fs/promises";
import { join } from "path";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "export" });

// 로컬 폰트 파일 경로 (public/fonts에 포함) - TTF 형식 사용
const LOCAL_FONT_PATH = join(process.cwd(), "public", "fonts", "NotoSansKR-Regular.ttf");

// CDN 폴백 URL - TTF 형식
const NOTO_SANS_KR_CDN = "https://github.com/googlefonts/noto-cjk/raw/main/Sans/TTF/Korean/NotoSansKR-Regular.ttf";

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
  /** Mermaid 다이어그램 이미지 배열 (클라이언트에서 캡처) */
  mermaidImages?: MermaidImage[];
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  error?: string;
}

/**
 * 한글 폰트 로드 (로컬 파일 우선, CDN 폴백, 캐싱 지원)
 * pdf-lib에 전달할 Uint8Array 반환
 */
async function loadKoreanFont(): Promise<Uint8Array | null> {
  if (cachedFontBytes) {
    return new Uint8Array(cachedFontBytes);
  }

  // 1. 로컬 파일 시도 (가장 안정적)
  try {
    const buffer = await readFile(LOCAL_FONT_PATH);
    // Buffer를 새 Uint8Array로 복사 (정확한 바이트 보장)
    const uint8Array = new Uint8Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      uint8Array[i] = buffer[i];
    }
    cachedFontBytes = uint8Array.buffer as ArrayBuffer;
    logger.info(`Korean font loaded from local file, size: ${buffer.length}`);
    return uint8Array;
  } catch (localError) {
    logger.warn("Local font not found, trying CDN", { error: localError });
  }

  // 2. CDN 폴백
  try {
    const response = await fetch(NOTO_SANS_KR_CDN);
    if (!response.ok) {
      throw new Error(`CDN response: ${response.status}`);
    }
    cachedFontBytes = await response.arrayBuffer();
    logger.info(`Korean font loaded from CDN, size: ${cachedFontBytes.byteLength}`);
    return new Uint8Array(cachedFontBytes);
  } catch (cdnError) {
    logger.error("Failed to load Korean font from all sources", { error: cdnError });
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

// ============================================================================
// PDF 마크다운 파싱 타입
// ============================================================================

interface PDFContentBlock {
  type: "heading" | "paragraph" | "list" | "code" | "mermaid" | "table";
  level?: number; // heading level (1-6)
  content: string;
  items?: string[]; // list items
  ordered?: boolean; // ordered list
  rows?: string[][]; // table rows
}

/**
 * 마크다운 콘텐츠를 PDF용 블록으로 파싱
 */
function parseMarkdownForPDF(content: string): PDFContentBlock[] {
  const blocks: PDFContentBlock[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 빈 줄 건너뛰기
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Mermaid 코드 블록
    if (line.trim().startsWith("```mermaid")) {
      let mermaidContent = "";
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        mermaidContent += lines[i] + "\n";
        i++;
      }
      blocks.push({ type: "mermaid", content: mermaidContent.trim() });
      i++; // 닫는 ``` 건너뛰기
      continue;
    }

    // 일반 코드 블록
    if (line.trim().startsWith("```")) {
      let codeContent = "";
      const lang = line.trim().slice(3);
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeContent += lines[i] + "\n";
        i++;
      }
      blocks.push({ type: "code", content: codeContent.trimEnd(), level: lang ? 1 : 0 });
      i++; // 닫는 ``` 건너뛰기
      continue;
    }

    // 헤딩 (# ~ ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // 순서 없는 리스트
    if (line.match(/^[\s]*[-*+]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+]\s+/)) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: false });
      continue;
    }

    // 순서 있는 리스트
    if (line.match(/^[\s]*\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s+/)) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered: true });
      continue;
    }

    // 테이블 (| 로 시작)
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i]
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell && !cell.match(/^[-:]+$/));
        if (row.length > 0) {
          rows.push(row);
        }
        i++;
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", content: "", rows });
      }
      continue;
    }

    // 일반 문단 (여러 줄 수집)
    let paragraphContent = line;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^[\s]*[-*+]\s+/) &&
      !lines[i].match(/^[\s]*\d+\.\s+/) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("|")
    ) {
      paragraphContent += " " + lines[i];
      i++;
    }
    blocks.push({ type: "paragraph", content: paragraphContent });
  }

  return blocks;
}

/**
 * 마크다운 인라인 스타일 제거 (볼드, 이탤릭 등)
 * PDF에서는 단순 텍스트로 표시
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // 볼드
    .replace(/\*([^*]+)\*/g, "$1") // 이탤릭
    .replace(/__([^_]+)__/g, "$1") // 볼드
    .replace(/_([^_]+)_/g, "$1") // 이탤릭
    .replace(/`([^`]+)`/g, "$1") // 인라인 코드
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // 링크
}

/**
 * PDF 내보내기 (pdf-lib 사용 - 서버리스 환경 완벽 지원)
 * - Vercel 서버리스 환경에서 안정적으로 동작
 * - 한글 폰트 임베딩 지원 (Noto Sans KR)
 * - Mermaid 다이어그램 이미지 삽입 지원
 * - 마크다운 스타일링 (헤딩, 리스트, 코드 블록, 테이블)
 */
export async function exportToPDF(
  data: BusinessPlanExportData
): Promise<ExportResult> {
  try {
    // PDF 문서 생성
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // 한글 폰트 로드 (필수)
    const koreanFontBytes = await loadKoreanFont();

    if (!koreanFontBytes) {
      logger.error("Korean font not available");
      return {
        success: false,
        error: "PDF 생성에 필요한 한글 폰트를 로드할 수 없습니다. DOCX 형식을 사용해주세요.",
      };
    }

    let font;
    try {
      font = await pdfDoc.embedFont(koreanFontBytes);
    } catch (fontError) {
      logger.error("Korean font embedding failed", { error: fontError });
      return {
        success: false,
        error: "한글 폰트 임베딩에 실패했습니다. DOCX 형식을 사용해주세요.",
      };
    }

    // A4 크기 설정
    const pageWidth = 595.28; // A4 width in points
    const pageHeight = 841.89; // A4 height in points
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    const lineHeight = 16;
    const titleSize = 24;
    const headingSize = 16;
    const subHeadingSize = 14;
    const bodySize = 11;
    const codeSize = 10;
    const listIndent = 20;

    // 텍스트 안전 처리 함수
    const safeText = (text: string | null | undefined): string => {
      return (text || "").toString();
    };

    // 최대 문자 수 계산 (대략적)
    const maxCharsPerLine = Math.floor(contentWidth / (bodySize * 0.5));
    const maxCodeCharsPerLine = Math.floor(contentWidth / (codeSize * 0.5));

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - margin;

    // Mermaid 이미지 인덱스 (섹션 순서대로 매칭)
    let mermaidImageIndex = 0;

    // 새 페이지 추가 함수
    const ensureSpace = (requiredSpace: number) => {
      if (yPosition - requiredSpace < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        yPosition = pageHeight - margin;
      }
    };

    // 텍스트 그리기 헬퍼
    const drawTextLine = (
      text: string,
      x: number,
      size: number,
      color: { r: number; g: number; b: number } = { r: 0.2, g: 0.2, b: 0.2 }
    ) => {
      ensureSpace(lineHeight);
      if (text.length > 0) {
        currentPage.drawText(text, {
          x,
          y: yPosition,
          size,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }
      yPosition -= lineHeight;
    };

    // Mermaid 이미지 그리기
    const drawMermaidImage = async () => {
      if (!data.mermaidImages || mermaidImageIndex >= data.mermaidImages.length) {
        // 이미지가 없으면 플레이스홀더 텍스트
        drawTextLine("[Mermaid 다이어그램]", margin, bodySize, { r: 0.5, g: 0.5, b: 0.5 });
        return;
      }

      const mermaidImage = data.mermaidImages[mermaidImageIndex];
      mermaidImageIndex++;

      try {
        // Base64를 Uint8Array로 변환
        const imageBytes = Uint8Array.from(atob(mermaidImage.imageData), (c) =>
          c.charCodeAt(0)
        );

        // PNG 이미지 임베드
        const pngImage = await pdfDoc.embedPng(imageBytes);

        // 이미지 크기 계산 (contentWidth에 맞게 조정)
        const aspectRatio = mermaidImage.width / mermaidImage.height;
        let drawWidth = Math.min(mermaidImage.width, contentWidth);
        let drawHeight = drawWidth / aspectRatio;

        // 최대 높이 제한 (페이지의 60%)
        const maxHeight = pageHeight * 0.6;
        if (drawHeight > maxHeight) {
          drawHeight = maxHeight;
          drawWidth = drawHeight * aspectRatio;
        }

        // 페이지 공간 확보
        ensureSpace(drawHeight + lineHeight);

        // 이미지 그리기 (중앙 정렬)
        const imageX = margin + (contentWidth - drawWidth) / 2;
        currentPage.drawImage(pngImage, {
          x: imageX,
          y: yPosition - drawHeight,
          width: drawWidth,
          height: drawHeight,
        });

        yPosition -= drawHeight + lineHeight;
      } catch (imgError) {
        logger.warn("Failed to embed Mermaid image", { error: imgError });
        drawTextLine("[이미지 로드 실패]", margin, bodySize, { r: 0.7, g: 0.3, b: 0.3 });
      }
    };

    // 코드 블록 그리기
    const drawCodeBlock = (content: string) => {
      const codeLines = content.split("\n");
      const blockHeight = (codeLines.length + 1) * lineHeight + 10;

      ensureSpace(blockHeight);

      // 배경 그리기
      const bgY = yPosition - blockHeight + lineHeight;
      currentPage.drawRectangle({
        x: margin - 5,
        y: bgY,
        width: contentWidth + 10,
        height: blockHeight,
        color: rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
      });

      yPosition -= 5; // 상단 패딩

      for (const codeLine of codeLines) {
        const wrappedLines = wrapText(codeLine, maxCodeCharsPerLine);
        for (const wrappedLine of wrappedLines) {
          drawTextLine(wrappedLine, margin + 5, codeSize, { r: 0.3, g: 0.3, b: 0.3 });
        }
      }

      yPosition -= 5; // 하단 패딩
    };

    // 테이블 그리기
    const drawTable = (rows: string[][]) => {
      if (rows.length === 0) return;

      const colCount = Math.max(...rows.map((r) => r.length));
      const colWidth = contentWidth / colCount;
      const rowHeight = lineHeight * 1.5;
      const tableHeight = rows.length * rowHeight;

      ensureSpace(tableHeight + lineHeight);

      // 테이블 그리기
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const rowY = yPosition - rowHeight;
        const isHeader = rowIdx === 0;

        // 헤더 배경
        if (isHeader) {
          currentPage.drawRectangle({
            x: margin,
            y: rowY,
            width: contentWidth,
            height: rowHeight,
            color: rgb(0.9, 0.9, 0.9),
          });
        }

        // 셀 텍스트
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cellX = margin + colIdx * colWidth + 5;
          const cellText = stripInlineMarkdown(row[colIdx]).substring(0, 30); // 30자 제한
          currentPage.drawText(cellText, {
            x: cellX,
            y: rowY + rowHeight / 3,
            size: bodySize,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
        }

        // 행 테두리
        currentPage.drawLine({
          start: { x: margin, y: rowY },
          end: { x: margin + contentWidth, y: rowY },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });

        yPosition = rowY;
      }

      yPosition -= lineHeight / 2;
    };

    // 리스트 그리기
    const drawList = (items: string[], ordered: boolean) => {
      for (let i = 0; i < items.length; i++) {
        const bullet = ordered ? `${i + 1}.` : "•";
        const itemText = stripInlineMarkdown(items[i]);
        const wrappedLines = wrapText(itemText, maxCharsPerLine - 5);

        for (let j = 0; j < wrappedLines.length; j++) {
          ensureSpace(lineHeight);
          if (j === 0) {
            // 첫 줄에 불릿/번호 추가
            currentPage.drawText(bullet, {
              x: margin + listIndent - 15,
              y: yPosition,
              size: bodySize,
              font,
              color: rgb(0.3, 0.3, 0.3),
            });
          }
          currentPage.drawText(wrappedLines[j], {
            x: margin + listIndent,
            y: yPosition,
            size: bodySize,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight;
        }
      }
    };

    // =====================================================
    // 문서 헤더 렌더링
    // =====================================================

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

    // =====================================================
    // 섹션별 내용 렌더링 (마크다운 파싱 적용)
    // =====================================================
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

      // 섹션 내용 파싱
      const blocks = parseMarkdownForPDF(safeText(section.content));

      for (const block of blocks) {
        switch (block.type) {
          case "heading": {
            const hSize =
              block.level === 1
                ? headingSize
                : block.level === 2
                  ? subHeadingSize
                  : bodySize + 1;
            ensureSpace(hSize + lineHeight);
            yPosition -= lineHeight / 2;
            currentPage.drawText(stripInlineMarkdown(block.content), {
              x: margin,
              y: yPosition,
              size: hSize,
              font,
              color: rgb(0.15, 0.15, 0.15),
            });
            yPosition -= hSize + lineHeight / 2;
            break;
          }

          case "paragraph": {
            const paraText = stripInlineMarkdown(block.content);
            const wrappedLines = wrapText(paraText, maxCharsPerLine);
            for (const line of wrappedLines) {
              drawTextLine(line, margin, bodySize);
            }
            yPosition -= lineHeight / 2;
            break;
          }

          case "list": {
            if (block.items && block.items.length > 0) {
              drawList(block.items, block.ordered || false);
            }
            yPosition -= lineHeight / 2;
            break;
          }

          case "code": {
            drawCodeBlock(block.content);
            yPosition -= lineHeight / 2;
            break;
          }

          case "mermaid": {
            await drawMermaidImage();
            break;
          }

          case "table": {
            if (block.rows && block.rows.length > 0) {
              drawTable(block.rows);
            }
            yPosition -= lineHeight / 2;
            break;
          }
        }
      }

      yPosition -= lineHeight; // 섹션 간 여백
    }

    // =====================================================
    // 메타데이터 (작성자, 날짜)
    // =====================================================
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
    const filename = generateExportFilename(data.title, data.companyName, "pdf");

    return {
      success: true,
      blob,
      filename,
    };
  } catch (error) {
    logger.error("PDF export error", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "PDF export failed",
    };
  }
}

/**
 * DOCX 내보내기 (docx 라이브러리 + 마크다운 파싱)
 * - 마크다운 문법 완전 지원 (제목, 볼드, 리스트, 테이블, 코드 등)
 * - 전문적인 문서 스타일링
 * - 한글 폰트 지원
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

    // 마크다운 섹션들을 docx 요소로 변환 (Mermaid 이미지 포함)
    const contentElements = convertSectionsToDocx(
      sections.map((s) => ({
        title: safeText(s.title),
        content: safeText(s.content),
        order: s.order,
      })),
      data.mermaidImages // Mermaid 이미지 전달
    );

    // 문서 생성 (마크다운 파싱 + 전문적 스타일링)
    const doc = new Document({
      numbering: NUMBERING_CONFIG,
      styles: {
        default: {
          document: {
            run: {
              font: STYLES.font.body,
              size: STYLES.size.body,
            },
            paragraph: {
              spacing: { after: 200 },
            },
          },
          heading1: {
            run: {
              font: STYLES.font.heading,
              size: STYLES.size.heading1,
              bold: true,
              color: STYLES.color.heading,
            },
            paragraph: {
              spacing: { before: 240, after: 120 },
            },
          },
          heading2: {
            run: {
              font: STYLES.font.heading,
              size: STYLES.size.heading2,
              bold: true,
              color: STYLES.color.heading,
            },
            paragraph: {
              spacing: { before: 200, after: 100 },
            },
          },
          heading3: {
            run: {
              font: STYLES.font.heading,
              size: STYLES.size.heading3,
              bold: true,
              color: STYLES.color.heading,
            },
            paragraph: {
              spacing: { before: 160, after: 80 },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
              },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: safeText(data.title) || "사업계획서",
                      size: 18,
                      color: "999999",
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 18,
                      color: "999999",
                    }),
                    new TextRun({
                      text: " / ",
                      size: 18,
                      color: "999999",
                    }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      size: 18,
                      color: "999999",
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children: [
            // ===== 표지 섹션 =====
            // 제목
            new Paragraph({
              children: [
                new TextRun({
                  text: safeText(data.title) || "사업계획서",
                  bold: true,
                  font: STYLES.font.heading,
                  size: STYLES.size.title,
                  color: STYLES.color.heading,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 600, after: 400 },
            }),

            // 회사명
            ...(data.companyName
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `회사명: ${safeText(data.companyName)}`,
                        bold: true,
                        font: STYLES.font.body,
                        size: STYLES.size.body,
                        color: STYLES.color.body,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
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
                        font: STYLES.font.body,
                        size: STYLES.size.body,
                        color: STYLES.color.blockquote,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                  }),
                ]
              : []),

            // 생성일
            new Paragraph({
              children: [
                new TextRun({
                  text: `생성일: ${formatDateKST(data.createdAt)}`,
                  font: STYLES.font.body,
                  size: STYLES.size.small,
                  color: STYLES.color.blockquote,
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 600 },
            }),

            // 구분선
            new Paragraph({
              children: [],
              border: {
                bottom: {
                  color: "cccccc",
                  style: "single" as const,
                  size: 6,
                  space: 1,
                },
              },
              spacing: { after: 400 },
            }),

            // ===== 본문 섹션 (마크다운 파싱된 내용) =====
            ...contentElements,

            // ===== 메타데이터 섹션 =====
            new Paragraph({ children: [] }), // 여백

            ...(data.metadata?.author
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `작성자: ${safeText(data.metadata.author)}`,
                        italics: true,
                        font: STYLES.font.body,
                        size: STYLES.size.small,
                        color: STYLES.color.blockquote,
                      }),
                    ],
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 400 },
                  }),
                ]
              : []),

            ...(data.metadata?.tags && data.metadata.tags.length > 0
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `태그: ${data.metadata.tags.join(", ")}`,
                        italics: true,
                        font: STYLES.font.body,
                        size: STYLES.size.small,
                        color: STYLES.color.blockquote,
                      }),
                    ],
                    alignment: AlignmentType.RIGHT,
                  }),
                ]
              : []),
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
    const filename = generateExportFilename(data.title, data.companyName, "docx");

    return {
      success: true,
      blob,
      filename,
    };
  } catch (error) {
    logger.error("DOCX export error", { error });
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
    logger.error("HWP export error", { error });
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
 * 파일명용 날짜 포맷 (YYYY-MM-DD)
 */
function formatDateForFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 파일명 sanitize (특수문자 제거, 공백 정리)
 * - 영문, 숫자, 한글(AC00-D7AF), 언더스코어, 하이픈, 공백만 허용
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9\uAC00-\uD7AF_\-\s]/g, "") // 특수문자 제거 (한글 유니코드 범위 사용)
    .replace(/\s+/g, "_") // 공백을 언더스코어로
    .replace(/_+/g, "_") // 연속 언더스코어 정리
    .replace(/^_|_$/g, "") // 시작/끝 언더스코어 제거
    .substring(0, 50); // 각 부분 50자 제한
}

/**
 * 내보내기 파일명 생성
 * 형식: {회사명}_{제목}_{날짜}.{확장자} 또는 {제목}_{날짜}.{확장자}
 */
function generateExportFilename(
  title: string,
  companyName?: string,
  extension: string = "docx"
): string {
  const safeTitle = sanitizeFilename(title) || "사업계획서";
  const dateStr = formatDateForFilename();

  if (companyName) {
    const safeCompany = sanitizeFilename(companyName);
    if (safeCompany) {
      return `${safeCompany}_${safeTitle}_${dateStr}.${extension}`;
    }
  }

  return `${safeTitle}_${dateStr}.${extension}`;
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
