/**
 * Markdown to DOCX Converter
 *
 * 마크다운 텍스트를 docx 라이브러리 요소로 변환합니다.
 * unified + remark-parse + remark-gfm을 사용하여 AST로 파싱 후
 * docx 요소로 변환합니다.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type {
  Root,
  Content,
  Heading,
  Paragraph as MdParagraph,
  Text,
  Strong,
  Emphasis,
  InlineCode,
  Code,
  List,
  ListItem,
  Table as MdTable,
  TableRow as MdTableRow,
  TableCell as MdTableCell,
  Link,
  Blockquote,
  ThematicBreak,
  Image,
  Delete,
  Break,
  PhrasingContent,
} from "mdast";
import {
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  ExternalHyperlink,
  BorderStyle,
  WidthType,
  ShadingType,
  convertInchesToTwip,
  INumberingOptions,
  LevelFormat,
  IParagraphOptions,
  IRunOptions,
  FileChild,
  TableOfContents,
  PageBreak,
} from "docx";

// ============================================================================
// 스타일 설정
// ============================================================================

const STYLES = {
  font: {
    heading: "맑은 고딕",
    body: "맑은 고딕",
    code: "Consolas",
  },
  // docx size는 half-points (1pt = 2 half-points)
  size: {
    title: 48, // 24pt
    heading1: 36, // 18pt
    heading2: 32, // 16pt
    heading3: 28, // 14pt
    heading4: 26, // 13pt
    heading5: 24, // 12pt
    heading6: 22, // 11pt
    body: 22, // 11pt
    code: 20, // 10pt
    small: 18, // 9pt
  },
  color: {
    heading: "1a1a1a",
    body: "333333",
    code: "c7254e", // 인라인 코드 색상
    codeBlock: "2d3748",
    link: "0066cc",
    blockquote: "555555",
  },
  shading: {
    code: "f9f2f4", // 인라인 코드 배경
    codeBlock: "f5f5f5", // 코드 블록 배경
    blockquote: "f9f9f9",
    tableHeader: "f0f0f0",
    tableAlt: "fafafa",
  },
  spacing: {
    paragraph: { after: 200 }, // 10pt after
    heading: { before: 240, after: 120 }, // 12pt before, 6pt after
    list: { after: 80 }, // 4pt after
    codeBlock: { before: 120, after: 120 }, // 6pt before/after
  },
  indent: {
    blockquote: convertInchesToTwip(0.5),
    listLevel: convertInchesToTwip(0.25),
  },
} as const;

// ============================================================================
// 번호 매기기 설정
// ============================================================================

export const NUMBERING_CONFIG: INumberingOptions = {
  config: [
    {
      reference: "bullet-list",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
            },
          },
        },
        {
          level: 1,
          format: LevelFormat.BULLET,
          text: "◦",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(1), hanging: convertInchesToTwip(0.25) },
            },
          },
        },
        {
          level: 2,
          format: LevelFormat.BULLET,
          text: "▪",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) },
            },
          },
        },
      ],
    },
    {
      reference: "numbered-list",
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
            },
          },
        },
        {
          level: 1,
          format: LevelFormat.LOWER_LETTER,
          text: "%2)",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(1), hanging: convertInchesToTwip(0.25) },
            },
          },
        },
        {
          level: 2,
          format: LevelFormat.LOWER_ROMAN,
          text: "%3.",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) },
            },
          },
        },
      ],
    },
  ],
};

// ============================================================================
// 타입 정의
// ============================================================================

interface InlineContext {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
}

interface ListContext {
  ordered: boolean;
  level: number;
}

// ============================================================================
// 마크다운 파싱
// ============================================================================

// <br> 태그 플레이스홀더 (유니코드 LINE SEPARATOR)
const BR_PLACEHOLDER = "\u2028";

/**
 * HTML <br> 태그를 플레이스홀더로 전처리
 * 마크다운 줄바꿈으로 변환하면 테이블이 깨지므로 플레이스홀더 사용
 */
function preprocessBrTags(markdown: string): string {
  // <br>, <br/>, <br /> 모든 형태를 플레이스홀더로 변환
  return markdown.replace(/<br\s*\/?>/gi, BR_PLACEHOLDER);
}

/**
 * 마크다운 텍스트를 AST로 파싱
 */
function parseMarkdown(markdown: string): Root {
  const preprocessed = preprocessBrTags(markdown);
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(preprocessed);
}

// ============================================================================
// 인라인 노드 변환
// ============================================================================

type InlineElement = TextRun | ExternalHyperlink;

/**
 * 인라인 노드들을 TextRun/ExternalHyperlink 배열로 변환
 */
function convertInlineNodes(
  nodes: PhrasingContent[],
  context: InlineContext = {}
): InlineElement[] {
  const result: InlineElement[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        // 플레이스홀더가 있으면 줄바꿈으로 분리
        if (node.value.includes(BR_PLACEHOLDER)) {
          const parts = node.value.split(BR_PLACEHOLDER);
          parts.forEach((part, index) => {
            if (part) {
              result.push(createTextRun(part, context));
            }
            // 마지막이 아니면 줄바꿈 추가
            if (index < parts.length - 1) {
              result.push(new TextRun({ break: 1 }));
            }
          });
        } else {
          result.push(createTextRun(node.value, context));
        }
        break;

      case "strong":
        result.push(...convertInlineNodes(node.children, { ...context, bold: true }));
        break;

      case "emphasis":
        result.push(...convertInlineNodes(node.children, { ...context, italics: true }));
        break;

      case "delete":
        result.push(...convertInlineNodes(node.children, { ...context, strike: true }));
        break;

      case "inlineCode":
        result.push(createInlineCodeRun(node.value));
        break;

      case "link":
        result.push(createHyperlink(node));
        break;

      case "break":
        result.push(new TextRun({ break: 1 }));
        break;

      case "image":
        // 이미지는 텍스트로 대체
        result.push(
          new TextRun({
            text: `[이미지: ${node.alt || node.url}]`,
            italics: true,
            color: STYLES.color.blockquote,
            size: STYLES.size.small,
          })
        );
        break;

      default:
        // 기타 노드는 텍스트로 변환 시도
        if ("value" in node && typeof node.value === "string") {
          result.push(createTextRun(node.value, context));
        }
        break;
    }
  }

  return result;
}

/**
 * 일반 텍스트 TextRun 생성
 */
function createTextRun(text: string, context: InlineContext = {}): TextRun {
  return new TextRun({
    text,
    font: STYLES.font.body,
    size: STYLES.size.body,
    color: STYLES.color.body,
    bold: context.bold || undefined,
    italics: context.italics || undefined,
    strike: context.strike || undefined,
  });
}

/**
 * 인라인 코드 TextRun 생성
 */
function createInlineCodeRun(code: string): TextRun {
  return new TextRun({
    text: code,
    font: STYLES.font.code,
    size: STYLES.size.code,
    color: STYLES.color.code,
    shading: {
      type: ShadingType.CLEAR,
      color: "auto",
      fill: STYLES.shading.code,
    },
  });
}

/**
 * 하이퍼링크 생성
 */
function createHyperlink(node: Link): ExternalHyperlink {
  const children = convertInlineNodes(node.children as PhrasingContent[]);

  // 링크 텍스트에 스타일 적용
  const styledChildren = children.map((child) => {
    if (child instanceof TextRun) {
      return new TextRun({
        text: (child as unknown as { root: { text: string }[] }).root?.[0]?.text || "",
        color: STYLES.color.link,
        underline: { type: "single" },
        font: STYLES.font.body,
        size: STYLES.size.body,
      });
    }
    return child;
  });

  return new ExternalHyperlink({
    children:
      styledChildren.length > 0
        ? styledChildren
        : [
            new TextRun({
              text: node.url,
              color: STYLES.color.link,
              underline: { type: "single" },
            }),
          ],
    link: node.url,
  });
}

// ============================================================================
// 블록 노드 변환
// ============================================================================

/**
 * 제목 변환
 */
function convertHeading(node: Heading): Paragraph {
  const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };

  const sizeMap: Record<number, number> = {
    1: STYLES.size.heading1,
    2: STYLES.size.heading2,
    3: STYLES.size.heading3,
    4: STYLES.size.heading4,
    5: STYLES.size.heading5,
    6: STYLES.size.heading6,
  };

  const children = convertInlineNodes(node.children as PhrasingContent[]);
  const styledChildren = children.map((child) => {
    if (child instanceof TextRun) {
      return new TextRun({
        text: extractTextFromRun(child),
        bold: true,
        font: STYLES.font.heading,
        size: sizeMap[node.depth] || STYLES.size.body,
        color: STYLES.color.heading,
      });
    }
    return child;
  });

  return new Paragraph({
    children: styledChildren,
    heading: headingMap[node.depth] || HeadingLevel.HEADING_1,
    spacing: STYLES.spacing.heading,
  });
}

/**
 * 단락 변환
 */
function convertParagraph(node: MdParagraph): Paragraph {
  const children = convertInlineNodes(node.children as PhrasingContent[]);

  return new Paragraph({
    children,
    spacing: STYLES.spacing.paragraph,
  });
}

/**
 * 코드 블록 변환
 */
function convertCodeBlock(node: Code): Paragraph[] {
  const lines = node.value.split("\n");
  const paragraphs: Paragraph[] = [];

  // 언어 라벨 (있는 경우)
  if (node.lang) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `[${node.lang}]`,
            font: STYLES.font.code,
            size: STYLES.size.small,
            color: STYLES.color.blockquote,
            italics: true,
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }

  // 코드 라인들
  for (let i = 0; i < lines.length; i++) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: lines[i] || " ", // 빈 줄은 공백으로 대체
            font: STYLES.font.code,
            size: STYLES.size.code,
            color: STYLES.color.codeBlock,
          }),
        ],
        shading: {
          type: ShadingType.CLEAR,
          color: "auto",
          fill: STYLES.shading.codeBlock,
        },
        spacing: i === lines.length - 1 ? STYLES.spacing.codeBlock : { after: 0 },
        indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
      })
    );
  }

  return paragraphs;
}

/**
 * 리스트 변환
 */
function convertList(node: List, level: number = 0): FileChild[] {
  const elements: FileChild[] = [];
  const listType = node.ordered ? "numbered-list" : "bullet-list";

  for (const item of node.children) {
    if (item.type === "listItem") {
      elements.push(...convertListItem(item, listType, level));
    }
  }

  return elements;
}

/**
 * 리스트 아이템 변환
 */
function convertListItem(node: ListItem, listType: string, level: number): FileChild[] {
  const elements: FileChild[] = [];

  for (const child of node.children) {
    if (child.type === "paragraph") {
      const inlineChildren = convertInlineNodes(child.children as PhrasingContent[]);
      elements.push(
        new Paragraph({
          children: inlineChildren,
          numbering: {
            reference: listType,
            level: level,
          },
          spacing: STYLES.spacing.list,
        })
      );
    } else if (child.type === "list") {
      // 중첩 리스트
      elements.push(...convertList(child, level + 1));
    } else {
      // 기타 블록 요소
      elements.push(...convertBlockNode(child));
    }
  }

  return elements;
}

/**
 * 테이블 변환
 */
function convertTable(node: MdTable): Table {
  const rows: TableRow[] = [];
  let isHeader = true;

  for (const row of node.children) {
    if (row.type === "tableRow") {
      rows.push(convertTableRow(row, isHeader));
      isHeader = false; // 첫 번째 행 이후는 헤더가 아님
    }
  }

  return new Table({
    rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });
}

/**
 * 테이블 행 변환
 */
function convertTableRow(node: MdTableRow, isHeader: boolean): TableRow {
  const cells: TableCell[] = [];

  for (const cell of node.children) {
    if (cell.type === "tableCell") {
      cells.push(convertTableCell(cell, isHeader));
    }
  }

  return new TableRow({
    children: cells,
    tableHeader: isHeader,
  });
}

/**
 * 테이블 셀 변환
 */
function convertTableCell(node: MdTableCell, isHeader: boolean): TableCell {
  // 헤더 셀은 처음부터 볼드 컨텍스트로 변환
  const context: InlineContext = isHeader ? { bold: true } : {};
  const inlineChildren = convertInlineNodes(node.children as PhrasingContent[], context);

  return new TableCell({
    children: [
      new Paragraph({
        children: inlineChildren,
      }),
    ],
    shading: isHeader
      ? {
          type: ShadingType.CLEAR,
          color: "auto",
          fill: STYLES.shading.tableHeader,
        }
      : undefined,
  });
}

/**
 * 인용구 변환
 */
function convertBlockquote(node: Blockquote): FileChild[] {
  const elements: FileChild[] = [];

  for (const child of node.children) {
    if (child.type === "paragraph") {
      const inlineChildren = convertInlineNodes(child.children as PhrasingContent[]);
      const styledChildren = inlineChildren.map((c) => {
        if (c instanceof TextRun) {
          return new TextRun({
            text: extractTextFromRun(c),
            italics: true,
            color: STYLES.color.blockquote,
            font: STYLES.font.body,
            size: STYLES.size.body,
          });
        }
        return c;
      });

      elements.push(
        new Paragraph({
          children: styledChildren,
          indent: { left: STYLES.indent.blockquote },
          shading: {
            type: ShadingType.CLEAR,
            color: "auto",
            fill: STYLES.shading.blockquote,
          },
          spacing: STYLES.spacing.paragraph,
          border: {
            left: {
              color: "999999",
              style: BorderStyle.SINGLE,
              size: 24,
              space: 10,
            },
          },
        })
      );
    } else {
      // 중첩된 blockquote 등
      elements.push(...convertBlockNode(child));
    }
  }

  return elements;
}

/**
 * 수평선 변환
 */
function convertThematicBreak(): Paragraph {
  return new Paragraph({
    children: [],
    border: {
      bottom: {
        color: "cccccc",
        style: BorderStyle.SINGLE,
        size: 6,
        space: 1,
      },
    },
    spacing: { before: 200, after: 200 },
  });
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * TextRun에서 텍스트 추출
 */
function extractTextFromRun(run: TextRun): string {
  // TextRun 내부 구조에서 텍스트 추출
  // docx 라이브러리의 TextRun 내부 구조: { root: [{ _attr: {...}, children: [...] }] }
  const runAny = run as unknown as Record<string, unknown>;

  // 방법 1: root[0].children에서 텍스트 찾기
  if (runAny.root && Array.isArray(runAny.root)) {
    for (const item of runAny.root) {
      // item이 객체이고 children이 있는 경우
      if (item && typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        // children 배열에서 텍스트 요소 찾기
        if (itemObj.children && Array.isArray(itemObj.children)) {
          for (const child of itemObj.children) {
            if (child && typeof child === "object") {
              const childObj = child as Record<string, unknown>;
              // _text 속성이 있는 경우
              if ("_text" in childObj && typeof childObj._text === "string") {
                return childObj._text;
              }
              // text 속성이 있는 경우
              if ("text" in childObj && typeof childObj.text === "string") {
                return childObj.text;
              }
            }
          }
        }
        // item 자체에 text 속성이 있는 경우
        if ("text" in itemObj && typeof itemObj.text === "string") {
          return itemObj.text;
        }
        if ("_text" in itemObj && typeof itemObj._text === "string") {
          return itemObj._text;
        }
      }
    }
  }

  // 방법 2: options에서 텍스트 찾기 (생성 시점에 저장된 원본 옵션)
  if (runAny.options && typeof runAny.options === "object") {
    const options = runAny.options as Record<string, unknown>;
    if (typeof options.text === "string") {
      return options.text;
    }
  }

  return "";
}

/**
 * Mermaid 코드 블록인지 확인
 */
function isMermaidBlock(node: Code): boolean {
  return node.lang?.toLowerCase() === "mermaid";
}

/**
 * Mermaid 블록을 설명 텍스트로 변환
 */
function convertMermaidBlock(node: Code): Paragraph[] {
  // Mermaid 다이어그램 타입 추출
  const firstLine = node.value.split("\n")[0].trim();
  const diagramType = firstLine.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline)/)?.[1] || "diagram";

  const typeNames: Record<string, string> = {
    graph: "플로우차트",
    flowchart: "플로우차트",
    sequenceDiagram: "시퀀스 다이어그램",
    classDiagram: "클래스 다이어그램",
    stateDiagram: "상태 다이어그램",
    erDiagram: "ER 다이어그램",
    gantt: "간트 차트",
    pie: "파이 차트",
    mindmap: "마인드맵",
    timeline: "타임라인",
    diagram: "다이어그램",
  };

  return [
    new Paragraph({
      children: [
        new TextRun({
          text: `📊 [${typeNames[diagramType] || "다이어그램"}]`,
          italics: true,
          color: STYLES.color.blockquote,
          size: STYLES.size.small,
        }),
      ],
      shading: {
        type: ShadingType.CLEAR,
        color: "auto",
        fill: STYLES.shading.blockquote,
      },
      spacing: STYLES.spacing.paragraph,
      alignment: AlignmentType.CENTER,
    }),
  ];
}

// ============================================================================
// 블록 노드 라우터
// ============================================================================

/**
 * 단일 블록 노드를 docx 요소로 변환
 */
function convertBlockNode(node: Content): FileChild[] {
  switch (node.type) {
    case "heading":
      return [convertHeading(node)];

    case "paragraph":
      return [convertParagraph(node)];

    case "code":
      if (isMermaidBlock(node)) {
        return convertMermaidBlock(node);
      }
      return convertCodeBlock(node);

    case "list":
      return convertList(node);

    case "table":
      return [convertTable(node)];

    case "blockquote":
      return convertBlockquote(node);

    case "thematicBreak":
      return [convertThematicBreak()];

    default:
      // 알 수 없는 노드 타입은 무시
      return [];
  }
}

// ============================================================================
// 메인 Export 함수
// ============================================================================

/**
 * 마크다운 텍스트를 docx 요소 배열로 변환
 */
export function markdownToDocxElements(markdown: string): {
  elements: FileChild[];
  numbering: INumberingOptions;
} {
  // 빈 문자열 처리
  if (!markdown || markdown.trim() === "") {
    return {
      elements: [
        new Paragraph({
          children: [new TextRun({ text: "" })],
        }),
      ],
      numbering: NUMBERING_CONFIG,
    };
  }

  // AST로 파싱
  const ast = parseMarkdown(markdown);

  // AST 노드들을 docx 요소로 변환
  const elements: FileChild[] = [];

  for (const node of ast.children) {
    elements.push(...convertBlockNode(node));
  }

  // 빈 결과 방지
  if (elements.length === 0) {
    elements.push(
      new Paragraph({
        children: [new TextRun({ text: markdown })],
        spacing: STYLES.spacing.paragraph,
      })
    );
  }

  return {
    elements,
    numbering: NUMBERING_CONFIG,
  };
}

/**
 * 마크다운 섹션들을 docx 요소로 일괄 변환
 */
export function convertSectionsToDocx(
  sections: Array<{ title: string; content: string; order: number }>
): FileChild[] {
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const elements: FileChild[] = [];

  for (const section of sortedSections) {
    // 섹션 제목
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title,
            bold: true,
            font: STYLES.font.heading,
            size: STYLES.size.heading1,
            color: STYLES.color.heading,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: STYLES.spacing.heading,
      })
    );

    // 섹션 내용 (마크다운 파싱)
    const { elements: contentElements } = markdownToDocxElements(section.content);
    elements.push(...contentElements);

    // 섹션 간 여백
    elements.push(new Paragraph({ children: [] }));
  }

  return elements;
}

export { STYLES };
