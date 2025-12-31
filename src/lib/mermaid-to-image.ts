/**
 * Mermaid to Image Converter (Client-side)
 *
 * 브라우저에서 렌더링된 Mermaid 다이어그램을 PNG 이미지로 캡처합니다.
 * SVG를 직접 Canvas로 변환하여 "Unable to find element in cloned iframe" 에러를 회피합니다.
 */

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
// SVG를 Canvas로 직접 변환 (html2canvas 없이)
// ============================================================================

/**
 * foreignObject 내의 HTML 콘텐츠를 SVG 텍스트로 변환
 * 브라우저 보안 제한으로 foreignObject가 포함된 SVG는 이미지로 로드 불가
 */
function convertForeignObjectToText(svg: SVGElement): void {
  const foreignObjects = svg.querySelectorAll("foreignObject");

  foreignObjects.forEach((fo) => {
    const parent = fo.parentNode;
    if (!parent) return;

    // foreignObject의 위치 정보 가져오기
    const x = parseFloat(fo.getAttribute("x") || "0");
    const y = parseFloat(fo.getAttribute("y") || "0");
    const width = parseFloat(fo.getAttribute("width") || "100");
    const height = parseFloat(fo.getAttribute("height") || "50");

    // 내부 텍스트 추출
    const textContent = fo.textContent?.trim() || "";
    if (!textContent) {
      parent.removeChild(fo);
      return;
    }

    // foreignObject 내부의 스타일 정보 추출
    const divElement = fo.querySelector("div");
    let fontSize = "14";
    let fill = "#000000";
    const textAnchor = "middle";

    if (divElement) {
      const computedStyle = window.getComputedStyle(divElement);
      fontSize = computedStyle.fontSize?.replace("px", "") || "14";
      fill = computedStyle.color || "#000000";
      // RGB to hex 변환
      if (fill.startsWith("rgb")) {
        const rgbMatch = fill.match(/\d+/g);
        if (rgbMatch) {
          fill = `#${rgbMatch.map((n) => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
        }
      }
    }

    // SVG 텍스트 요소 생성
    const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textElement.setAttribute("x", String(x + width / 2));
    textElement.setAttribute("y", String(y + height / 2));
    textElement.setAttribute("text-anchor", textAnchor);
    textElement.setAttribute("dominant-baseline", "middle");
    textElement.setAttribute("font-size", fontSize);
    textElement.setAttribute("fill", fill);
    textElement.setAttribute("font-family", "Arial, sans-serif");
    textElement.textContent = textContent;

    // foreignObject를 텍스트로 교체
    parent.replaceChild(textElement, fo);
  });
}

/**
 * SVG 요소를 PNG 이미지로 변환
 * html2canvas의 iframe 복제 문제를 회피하기 위해 직접 변환 사용
 */
async function svgToImage(
  svgElement: SVGElement,
  options: CaptureOptions = {}
): Promise<{ imageData: string; width: number; height: number } | null> {
  const {
    scale = 2,
    backgroundColor = "#ffffff",
    maxWidth = 800,
  } = options;

  try {
    // SVG 크기 가져오기
    const bbox = svgElement.getBoundingClientRect();
    const svgWidth = bbox.width || svgElement.clientWidth || 400;
    const svgHeight = bbox.height || svgElement.clientHeight || 300;

    // SVG 복제 및 스타일 인라인화
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;

    // SVG에 명시적 크기 설정
    clonedSvg.setAttribute("width", String(svgWidth));
    clonedSvg.setAttribute("height", String(svgHeight));

    // viewBox가 없으면 추가
    if (!clonedSvg.getAttribute("viewBox")) {
      clonedSvg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    }

    // 인라인 스타일 추출 및 적용
    inlineStyles(clonedSvg);

    // foreignObject를 SVG 텍스트로 변환 (브라우저 보안 제한 우회)
    // foreignObject가 포함된 SVG는 이미지로 로드 시 렌더링되지 않음
    convertForeignObjectToText(clonedSvg);

    // SVG를 문자열로 직렬화
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);

    // SVG namespace 추가 (더 정확한 체크)
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // xlink namespace 추가 (use 요소 등에서 필요)
    if (!svgString.includes("xmlns:xlink") && svgString.includes("xlink:")) {
      svgString = svgString.replace(
        'xmlns="http://www.w3.org/2000/svg"',
        'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
      );
    }

    // Data URL 방식 사용 (Blob URL보다 더 안정적)
    const base64Svg = btoa(unescape(encodeURIComponent(svgString)));
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;

    // 이미지로 로드
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Image load timeout"));
      }, 5000);

      img.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      img.onerror = (e) => {
        clearTimeout(timeout);
        console.error("SVG image load error:", e);
        reject(new Error(`Image load failed`));
      };
      img.src = dataUrl;
    });

    // 캔버스 생성
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context not available");
    }

    // 스케일 적용된 크기
    const scaledWidth = svgWidth * scale;
    const scaledHeight = svgHeight * scale;

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    // 배경색 채우기
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, scaledWidth, scaledHeight);

    // 이미지 그리기
    ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

    // PNG로 변환
    const pngDataUrl = canvas.toDataURL("image/png");
    const imageData = pngDataUrl.replace(/^data:image\/png;base64,/, "");

    // 출력 크기 계산
    const outputWidth = Math.min(svgWidth, maxWidth);
    const outputHeight = svgHeight * (outputWidth / svgWidth);

    return {
      imageData,
      width: Math.round(outputWidth),
      height: Math.round(outputHeight),
    };
  } catch (error) {
    console.error("SVG to image conversion failed:", error);
    return null;
  }
}

/**
 * 요소의 계산된 스타일을 인라인으로 적용
 */
function inlineStyles(element: Element): void {
  const computedStyle = window.getComputedStyle(element);

  // 중요한 스타일 속성들만 인라인화
  const importantStyles = [
    "fill", "stroke", "stroke-width", "font-family", "font-size",
    "font-weight", "text-anchor", "dominant-baseline", "opacity",
    "transform", "color", "background-color"
  ];

  if (element instanceof SVGElement || element instanceof HTMLElement) {
    importantStyles.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== "none" && value !== "normal" && value !== "auto") {
        (element as SVGElement).style.setProperty(prop, value);
      }
    });
  }

  // 자식 요소들에도 적용
  Array.from(element.children).forEach(child => {
    inlineStyles(child);
  });
}

// ============================================================================
// 이미지 캡처 함수
// ============================================================================

/**
 * 단일 Mermaid SVG 요소를 PNG로 캡처
 */
async function captureElement(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<{ imageData: string; width: number; height: number } | null> {
  try {
    // SVG 요소 찾기
    const svgElement = element.querySelector("svg") ||
                       (element.tagName === "svg" ? element : null);

    if (svgElement && svgElement instanceof SVGElement) {
      // SVG 직접 변환 시도 (더 안정적)
      const result = await svgToImage(svgElement, options);
      if (result) {
        return result;
      }
    }

    // SVG가 없거나 변환 실패 시 html2canvas 폴백
    console.warn("SVG direct conversion failed, trying html2canvas fallback...");

    const { default: html2canvas } = await import("html2canvas");

    const {
      scale = 2,
      backgroundColor = "#ffffff",
      maxWidth = 800,
    } = options;

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
      foreignObjectRendering: true,
      onclone: (clonedDoc, clonedElement) => {
        const svgs = clonedElement.querySelectorAll("svg");
        svgs.forEach((svg) => {
          svg.style.overflow = "visible";
        });
      },
    });

    const dataUrl = canvas.toDataURL("image/png");
    const imageData = dataUrl.replace(/^data:image\/png;base64,/, "");

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

    console.log(`[Mermaid Capture] Found ${allElements.size} elements to capture`);

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
        // SVG 요소 확인
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

        console.log(`[Mermaid Capture] Capturing element ${index}...`);

        // SVG 직접 변환 시도
        const result = await svgToImage(svgElement as SVGElement, options);

        if (result) {
          images.push({
            code: mermaidCode,
            imageData: result.imageData,
            width: result.width,
            height: result.height,
          });
          console.log(`[Mermaid Capture] Element ${index} captured successfully`);
        } else {
          // 폴백: captureElement 사용
          const fallbackResult = await captureElement(element as HTMLElement, options);
          if (fallbackResult) {
            images.push({
              code: mermaidCode,
              imageData: fallbackResult.imageData,
              width: fallbackResult.width,
              height: fallbackResult.height,
            });
            console.log(`[Mermaid Capture] Element ${index} captured via fallback`);
          } else {
            errors.push(`Failed to capture element ${index}`);
          }
        }
      } catch (err) {
        errors.push(`Error capturing element ${index}: ${err}`);
        console.error(`[Mermaid Capture] Error on element ${index}:`, err);
      }

      index++;
    }

    console.log(`[Mermaid Capture] Complete: ${images.length} images, ${errors.length} errors`);

    return {
      success: true,
      images,
      errors,
    };
  } catch (error) {
    console.error("[Mermaid Capture] Fatal error:", error);
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
        "div:has(> svg), .mermaid-container"
      );

      for (const mermaidContainer of mermaidContainers) {
        const svg = mermaidContainer.querySelector("svg");
        if (!svg) continue;

        // SVG ID에서 Mermaid 여부 확인
        const svgId = svg.getAttribute("id") || "";
        if (!svgId.includes("mermaid")) continue;

        try {
          const result = await svgToImage(svg as SVGElement, options);

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
