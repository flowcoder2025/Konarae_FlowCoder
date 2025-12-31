/**
 * Document Export Library (PRD Feature 2 - 내보내기)
 * - PDF 내보내기 (Puppeteer + HTML/CSS) - 완벽한 스타일링 지원
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
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { formatDateKST } from "@/lib/utils";
import { join } from "path";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ lib: "export" });

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

// ============================================================================
// PDF HTML 템플릿 생성
// ============================================================================

/**
 * 마크다운을 HTML로 변환 (PDF용)
 * - 헤딩, 리스트, 테이블, 코드 블록 지원
 * - Mermaid 다이어그램은 이미지로 대체
 */
function markdownToHtml(content: string, mermaidImages: MermaidImage[], mermaidIndex: { current: number }): string {
  const lines = content.split("\n");
  let html = "";
  let i = 0;
  let inList = false;
  let listType = "";

  const closeList = () => {
    if (inList) {
      html += listType === "ul" ? "</ul>" : "</ol>";
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Mermaid 코드 블록 → 이미지로 대체
    // 대소문자 무시, 공백 허용
    const trimmedLine = line.trim().toLowerCase();
    if (trimmedLine.startsWith("```mermaid") || trimmedLine === "```mermaid") {
      closeList();
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        i++;
      }
      i++; // 닫는 ``` 건너뛰기

      // Mermaid 이미지 삽입
      if (mermaidImages && mermaidIndex.current < mermaidImages.length) {
        const img = mermaidImages[mermaidIndex.current];
        mermaidIndex.current++;
        html += `<div class="mermaid-image"><img src="data:image/png;base64,${img.imageData}" alt="Mermaid Diagram" /></div>`;
      } else {
        // 이미지가 없으면 placeholder 표시
        html += `<div class="mermaid-placeholder">[다이어그램 ${mermaidIndex.current + 1}]</div>`;
        mermaidIndex.current++; // 인덱스는 증가시켜 다음 블록과 매칭되도록
      }
      continue;
    }

    // 일반 코드 블록
    if (line.trim().startsWith("```")) {
      closeList();
      const lang = line.trim().slice(3);
      let codeContent = "";
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeContent += escapeHtml(lines[i]) + "\n";
        i++;
      }
      i++; // 닫는 ``` 건너뛰기
      html += `<pre class="code-block"><code>${codeContent.trimEnd()}</code></pre>`;
      continue;
    }

    // 헤딩
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const text = parseInlineMarkdown(headingMatch[2]);
      html += `<h${level}>${text}</h${level}>`;
      i++;
      continue;
    }

    // 테이블
    if (line.trim().startsWith("|")) {
      closeList();
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0 && !cell.match(/^[-:]+$/));
        if (cells.length > 0) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        html += `<table><thead><tr>`;
        for (const cell of tableRows[0]) {
          html += `<th>${parseInlineMarkdown(cell)}</th>`;
        }
        html += `</tr></thead><tbody>`;
        for (let r = 1; r < tableRows.length; r++) {
          html += `<tr>`;
          for (const cell of tableRows[r]) {
            html += `<td>${parseInlineMarkdown(cell)}</td>`;
          }
          html += `</tr>`;
        }
        html += `</tbody></table>`;
      }
      continue;
    }

    // 순서 없는 리스트
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        closeList();
        html += "<ul>";
        inList = true;
        listType = "ul";
      }
      html += `<li>${parseInlineMarkdown(ulMatch[2])}</li>`;
      i++;
      continue;
    }

    // 순서 있는 리스트
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        closeList();
        html += "<ol>";
        inList = true;
        listType = "ol";
      }
      html += `<li>${parseInlineMarkdown(olMatch[2])}</li>`;
      i++;
      continue;
    }

    // 빈 줄
    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    // 일반 문단
    closeList();
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
    html += `<p>${parseInlineMarkdown(paragraphContent)}</p>`;
  }

  closeList();
  return html;
}

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 마크다운 인라인 스타일을 HTML로 변환
 */
function parseInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") // 볼드
    .replace(/\*([^*]+)\*/g, "<em>$1</em>") // 이탤릭
    .replace(/__([^_]+)__/g, "<strong>$1</strong>") // 볼드
    .replace(/_([^_]+)_/g, "<em>$1</em>") // 이탤릭
    .replace(/`([^`]+)`/g, "<code>$1</code>") // 인라인 코드
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>') // 링크
    .replace(/<br>/g, "<br/>"); // BR 태그 정규화
}

/**
 * PDF용 HTML 문서 생성
 */
function generatePdfHtml(data: BusinessPlanExportData): string {
  const mermaidIndex = { current: 0 };
  const sortedSections = [...(data.sections || [])].sort((a, b) => a.order - b.order);

  // Mermaid 이미지 처리 로깅
  if (data.mermaidImages && data.mermaidImages.length > 0) {
    logger.info("PDF export: Mermaid images embedded", {
      count: data.mermaidImages.length,
      sizes: data.mermaidImages.map(img => img.imageData?.length || 0),
    });
  }

  let sectionsHtml = "";
  for (const section of sortedSections) {
    sectionsHtml += `
      <div class="section">
        <h2 class="section-title">${escapeHtml(section.title)}</h2>
        <div class="section-content">
          ${markdownToHtml(section.content || "", data.mermaidImages || [], mermaidIndex)}
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title || "사업계획서")}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      background: white;
      padding: 40px 50px;
    }

    /* 표지 */
    .cover {
      text-align: center;
      padding: 60px 0 40px;
      border-bottom: 2px solid #e0e0e0;
      margin-bottom: 40px;
    }

    .cover h1 {
      font-size: 28pt;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 20px;
    }

    .cover .company-name {
      font-size: 14pt;
      font-weight: 500;
      color: #333;
      margin-bottom: 8px;
    }

    .cover .project-name {
      font-size: 12pt;
      color: #666;
      margin-bottom: 8px;
    }

    .cover .date {
      font-size: 10pt;
      color: #888;
      font-style: italic;
    }

    /* 섹션 */
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 16pt;
      font-weight: 700;
      color: #1a1a1a;
      border-bottom: 2px solid #0ea5e9;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }

    .section-content {
      font-size: 11pt;
    }

    /* 헤딩 */
    h1 { font-size: 20pt; font-weight: 700; margin: 24px 0 12px; color: #1a1a1a; }
    h2 { font-size: 16pt; font-weight: 700; margin: 20px 0 10px; color: #1a1a1a; }
    h3 { font-size: 14pt; font-weight: 600; margin: 16px 0 8px; color: #333; }
    h4 { font-size: 12pt; font-weight: 600; margin: 14px 0 6px; color: #333; }
    h5 { font-size: 11pt; font-weight: 600; margin: 12px 0 4px; color: #444; }
    h6 { font-size: 10pt; font-weight: 600; margin: 10px 0 4px; color: #555; }

    /* 문단 */
    p {
      margin: 8px 0;
      text-align: justify;
    }

    /* 리스트 */
    ul, ol {
      margin: 8px 0 8px 24px;
    }

    li {
      margin: 4px 0;
    }

    /* 테이블 */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 10pt;
    }

    th, td {
      border: 1px solid #d0d0d0;
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background-color: #f5f5f5;
      font-weight: 600;
      color: #333;
    }

    tr:nth-child(even) td {
      background-color: #fafafa;
    }

    /* 코드 블록 */
    .code-block {
      background-color: #f8f8f8;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 12px 0;
      overflow-x: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 9pt;
      line-height: 1.4;
    }

    code {
      font-family: 'Consolas', 'Monaco', monospace;
      background-color: #f0f0f0;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 9pt;
    }

    .code-block code {
      background: none;
      padding: 0;
    }

    /* 강조 */
    strong {
      font-weight: 700;
      color: #1a1a1a;
    }

    em {
      font-style: italic;
    }

    /* Mermaid 이미지 */
    .mermaid-image {
      text-align: center;
      margin: 20px 0;
      page-break-inside: avoid;
    }

    .mermaid-image img {
      max-width: 100%;
      height: auto;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 10px;
      background: white;
    }

    .mermaid-placeholder {
      background: #f5f5f5;
      border: 1px dashed #ccc;
      padding: 20px;
      text-align: center;
      color: #888;
      margin: 16px 0;
    }

    /* 메타데이터 */
    .metadata {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: right;
      font-size: 9pt;
      color: #888;
    }

    /* 인쇄 설정 */
    @media print {
      body {
        padding: 0;
      }

      .section {
        page-break-inside: avoid;
      }

      .mermaid-image {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${escapeHtml(data.title || "사업계획서")}</h1>
    ${data.companyName ? `<div class="company-name">회사명: ${escapeHtml(data.companyName)}</div>` : ""}
    ${data.projectName ? `<div class="project-name">지원사업: ${escapeHtml(data.projectName)}</div>` : ""}
    <div class="date">생성일: ${formatDateKST(data.createdAt)}</div>
  </div>

  ${sectionsHtml}

  <div class="metadata">
    ${data.metadata?.author ? `<div>작성자: ${escapeHtml(data.metadata.author)}</div>` : ""}
    ${data.metadata?.tags?.length ? `<div>태그: ${data.metadata.tags.map(escapeHtml).join(", ")}</div>` : ""}
  </div>
</body>
</html>`;
}

/**
 * PDF 내보내기 (Puppeteer + HTML/CSS - 완벽한 스타일링 지원)
 * - HTML/CSS 기반으로 DOCX와 동일한 품질의 PDF 생성
 * - Mermaid 다이어그램 이미지 삽입 지원
 * - 완전한 마크다운 스타일링
 * - Vercel 서버리스 환경 지원 (@sparticuz/chromium)
 */
export async function exportToPDF(
  data: BusinessPlanExportData
): Promise<ExportResult> {
  let browser = null;

  try {
    // HTML 생성
    const html = generatePdfHtml(data);

    // Puppeteer 브라우저 시작 (환경에 따라 다른 설정)
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction) {
      // Vercel 서버리스 환경
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
        defaultViewport: { width: 1200, height: 800 },
      });
    } else {
      // 로컬 개발 환경 - 시스템 Chrome 사용
      const executablePath = process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : process.platform === "win32"
          ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
          : "/usr/bin/google-chrome";

      browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();

    // HTML 로드 (waitUntil로 폰트 로딩 대기)
    await page.setContent(html, {
      waitUntil: ["load", "networkidle0"],
    });

    // 폰트 로딩을 위한 추가 대기
    await page.evaluate(() => {
      return document.fonts.ready;
    });

    // PDF 생성 (A4 크기, 여백 설정)
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 9px; color: #888; width: 100%; text-align: right; padding-right: 15mm;">
          ${escapeHtml(data.title || "사업계획서")}
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 9px; color: #888; width: 100%; text-align: center;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
    });

    await browser.close();
    browser = null;

    // Buffer를 Blob으로 변환 (타입 호환성 보장)
    const arrayBuffer = new ArrayBuffer(pdfBuffer.length);
    new Uint8Array(arrayBuffer).set(pdfBuffer);
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    const filename = generateExportFilename(data.title, data.companyName, "pdf");

    return {
      success: true,
      blob,
      filename,
    };
  } catch (error) {
    logger.error("PDF export error", { error });

    if (browser) {
      try {
        await browser.close();
      } catch {
        // 무시
      }
    }

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
