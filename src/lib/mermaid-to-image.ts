/**
 * Mermaid to Image Converter (Client-side)
 *
 * 브라우저에서 렌더링된 Mermaid 다이어그램을 PNG 이미지로 캡처합니다.
 * html2canvas를 사용하여 SVG를 포함한 DOM 요소를 캡처합니다.
 */

import html2canvas from "html2canvas";

// ============================================================================
// 타입 정의
// ============================================================================

export interface MermaidImage {
  /** Mermaid 코드 (식별용 해시 생성) */
  code: string;
  /** Base64 인코딩된 PNG 이미지 데이터 (data URL 제외) */
  imageData: string;
  /** 이미지 너비 (픽셀) */
  width: number;
  /** 이미지 높이 (픽셀) */
  height: number;
}

export interface CaptureOptions {
  /** 캡처 스케일 (기본값: 2, 고해상도) */
  scale?: number;
  /** 배경색 (기본값: #ffffff) */
  backgroundColor?: string;
  /** 최대 너비 (픽셀, 기본값: 800) */
  maxWidth?: number;
}

export interface CaptureResult {
  success: boolean;
  images: MermaidImage[];
  errors: string[];
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 문자열에서 간단한 해시 생성 (Mermaid 코드 식별용)
 */
export function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * 마크다운에서 Mermaid 코드 블록 추출
 */
export function extractMermaidCodes(markdown: string): string[] {
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/gi;
  const codes: string[] = [];
  let match;

  while ((match = mermaidRegex.exec(markdown)) !== null) {
    codes.push(match[1].trim());
  }

  return codes;
}

// ============================================================================
// 이미지 캡처 함수
// ============================================================================

/**
 * 단일 Mermaid 요소를 PNG로 캡처
 */
async function captureElement(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<{ imageData: string; width: number; height: number } | null> {
  const {
    scale = 2,
    backgroundColor = "#ffffff",
    maxWidth = 800,
  } = options;

  try {
    // 요소가 화면에 보이도록 스크롤
    element.scrollIntoView({ behavior: "instant", block: "center" });

    // 약간의 딜레이 후 캡처 (렌더링 완료 대기)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(element, {
      scale,
      backgroundColor,
      useCORS: true,
      allowTaint: true,
      logging: false,
      // foreignObject 렌더링 문제 해결
      onclone: (clonedDoc, clonedElement) => {
        // SVG 내부의 foreignObject 스타일 보정
        const svgs = clonedElement.querySelectorAll("svg");
        svgs.forEach((svg) => {
          svg.style.overflow = "visible";
        });
      },
    });

    // PNG로 변환
    const dataUrl = canvas.toDataURL("image/png");
    // "data:image/png;base64," 접두사 제거
    const imageData = dataUrl.replace(/^data:image\/png;base64,/, "");

    // 실제 크기 계산 (스케일 적용 전)
    const width = Math.min(canvas.width / scale, maxWidth);
    const height = (canvas.height / scale) * (width / (canvas.width / scale));

    return {
      imageData,
      width: Math.round(width),
      height: Math.round(height),
    };
  } catch (error) {
    console.error("Mermaid element capture failed:", error);
    return null;
  }
}

/**
 * 페이지 내 모든 Mermaid 다이어그램 캡처
 *
 * @param containerSelector - Mermaid 다이어그램을 포함하는 컨테이너 선택자 (기본: body)
 * @param options - 캡처 옵션
 * @returns 캡처된 이미지 배열
 */
export async function captureMermaidDiagrams(
  containerSelector: string = "body",
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const images: MermaidImage[] = [];
  const errors: string[] = [];

  try {
    const container = document.querySelector(containerSelector);
    if (!container) {
      return {
        success: false,
        images: [],
        errors: [`Container not found: ${containerSelector}`],
      };
    }

    // Mermaid 렌더링된 요소들 찾기
    // MermaidRenderer 컴포넌트는 SVG를 포함한 div를 생성
    const mermaidElements = container.querySelectorAll(
      ".mermaid-container, [data-mermaid], .mermaid"
    );

    // SVG가 직접 렌더링된 경우도 찾기
    const mermaidSvgContainers = container.querySelectorAll(
      "div:has(> svg[id^='mermaid'])"
    );

    // 모든 Mermaid 요소 수집 (중복 제거)
    const allElements = new Set<Element>([
      ...Array.from(mermaidElements),
      ...Array.from(mermaidSvgContainers),
    ]);

    if (allElements.size === 0) {
      return {
        success: true,
        images: [],
        errors: [],
      };
    }

    let index = 0;
    for (const element of allElements) {
      try {
        // SVG 요소 또는 부모 컨테이너 확인
        const svgElement = element.querySelector("svg");
        if (!svgElement) {
          errors.push(`No SVG found in element ${index}`);
          index++;
          continue;
        }

        // Mermaid 코드 추출 시도 (data 속성 또는 원본 코드 저장)
        const mermaidCode =
          element.getAttribute("data-mermaid-code") ||
          svgElement.getAttribute("data-mermaid") ||
          `mermaid-diagram-${index}`;

        // 캡처 대상 요소 결정 (SVG의 부모 div)
        const captureTarget = svgElement.parentElement as HTMLElement || element as HTMLElement;

        const result = await captureElement(captureTarget, options);

        if (result) {
          images.push({
            code: mermaidCode,
            imageData: result.imageData,
            width: result.width,
            height: result.height,
          });
        } else {
          errors.push(`Failed to capture element ${index}`);
        }
      } catch (err) {
        errors.push(`Error capturing element ${index}: ${err}`);
      }

      index++;
    }

    return {
      success: true,
      images,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      images: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * 특정 마크다운 콘텐츠에 대해 렌더링된 Mermaid 이미지 수집
 * (SectionEditor에서 렌더링된 Mermaid들을 캡처)
 */
export async function captureMermaidFromSections(
  sectionContainerSelector: string = ".business-plan-sections",
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const images: MermaidImage[] = [];
  const errors: string[] = [];

  try {
    const container = document.querySelector(sectionContainerSelector);
    if (!container) {
      // 컨테이너가 없으면 body에서 찾기
      return captureMermaidDiagrams("body", options);
    }

    // 각 섹션에서 Mermaid 요소 찾기
    const sections = container.querySelectorAll("[data-section-content]");

    for (const section of sections) {
      // 섹션 내 Mermaid 컨테이너들 찾기
      const mermaidContainers = section.querySelectorAll(
        "div:has(> svg), .my-4.p-4.bg-background"
      );

      for (const mermaidContainer of mermaidContainers) {
        const svg = mermaidContainer.querySelector("svg");
        if (!svg) continue;

        // SVG ID에서 Mermaid 여부 확인
        const svgId = svg.getAttribute("id") || "";
        if (!svgId.includes("mermaid")) continue;

        try {
          const result = await captureElement(
            mermaidContainer as HTMLElement,
            options
          );

          if (result) {
            // 코드 식별자 생성 (SVG ID 기반)
            const codeId = svgId || `mermaid-${images.length}`;
            images.push({
              code: codeId,
              imageData: result.imageData,
              width: result.width,
              height: result.height,
            });
          }
        } catch (err) {
          errors.push(`Capture error: ${err}`);
        }
      }
    }

    return {
      success: true,
      images,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      images: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * 마크다운 내 Mermaid 코드 블록 수 확인
 */
export function countMermaidBlocks(markdown: string): number {
  const mermaidRegex = /```mermaid/gi;
  return (markdown.match(mermaidRegex) || []).length;
}

/**
 * 섹션들에서 총 Mermaid 블록 수 계산
 */
export function countMermaidInSections(
  sections: Array<{ content: string }>
): number {
  return sections.reduce(
    (count, section) => count + countMermaidBlocks(section.content || ""),
    0
  );
}
