"use client";

import { useEffect, useState, useId } from "react";
import mermaid from "mermaid";

// Initialize mermaid once
let mermaidInitialized = false;

function initializeMermaid() {
  if (mermaidInitialized) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "inherit",
  });

  mermaidInitialized = true;
}

/**
 * Mermaid 다이어그램 코드를 파싱 에러 없이 렌더링할 수 있도록 정제
 * 주요 문제: 노드 라벨 내 괄호(), HTML 태그, 특수문자가 파싱 에러 유발
 */
function sanitizeMermaid(code: string): string {
  let sanitized = code;

  // 1. <br> 태그를 공백으로 변환 (가장 먼저 처리)
  sanitized = sanitized.replace(/<br\s*\/?>/gi, " ");

  // 2. 노드 라벨 [...]  내의 괄호 처리
  // 패턴: 대괄호 안의 내용에서 소괄호를 대괄호로 변환
  // 예: [시제품 제작실(3D프린터)] → [시제품 제작실 - 3D프린터]
  sanitized = sanitized.replace(
    /\[([^\]]*)\(([^)]*)\)([^\]]*)\]/g,
    (match, before, inside, after) => {
      // 괄호 내용이 있으면 " - " 또는 공백으로 연결
      const parenContent = inside.trim();
      if (parenContent) {
        return `[${before.trim()} - ${parenContent}${after}]`;
      }
      return `[${before}${after}]`;
    }
  );

  // 3. 반복적으로 처리 (중첩 괄호 대응)
  let prevSanitized = "";
  let iterations = 0;
  while (prevSanitized !== sanitized && iterations < 5) {
    prevSanitized = sanitized;
    sanitized = sanitized.replace(
      /\[([^\]]*)\(([^)]*)\)([^\]]*)\]/g,
      (match, before, inside, after) => {
        const parenContent = inside.trim();
        if (parenContent) {
          return `[${before.trim()} - ${parenContent}${after}]`;
        }
        return `[${before}${after}]`;
      }
    );
    iterations++;
  }

  // 4. subgraph 라벨 처리: subgraph ID[라벨] 또는 subgraph ID ["라벨"]
  // 괄호가 있는 라벨을 따옴표로 감싸기
  sanitized = sanitized.replace(
    /subgraph\s+(\w+)\s*\[([^\]]+)\]/g,
    (match, id, label) => {
      // 라벨 내 특수문자가 있으면 따옴표로 감싸기
      const cleanLabel = label.replace(/[()]/g, "").trim();
      return `subgraph ${id}["${cleanLabel}"]`;
    }
  );

  // 5. timeline 다이어그램 괄호 처리
  // 예: "2024 : 시제품 개발 (Phase 1)" → "2024 : 시제품 개발 - Phase 1"
  sanitized = sanitized.replace(
    /^(\s*)(section|\d{4}|\w+)\s*:\s*(.+)\(([^)]+)\)(.*)$/gm,
    (match, indent, prefix, before, inside, after) => {
      return `${indent}${prefix} : ${before.trim()} - ${inside}${after}`;
    }
  );

  // 6. flowchart 노드 ID에 특수문자가 있으면 제거
  // 예: A-1[라벨] → A1[라벨] (하이픈은 Mermaid에서 화살표와 혼동)
  sanitized = sanitized.replace(
    /([A-Za-z])[-](\d+)\[/g,
    (match, letter, num) => `${letter}${num}[`
  );

  // 7. 콜론(:) 뒤 공백 확보 (일부 다이어그램에서 필요)
  sanitized = sanitized.replace(/:(?=[^\s])/g, ": ");

  // 8. 빈 괄호 제거
  sanitized = sanitized.replace(/\(\s*\)/g, "");

  // 9. 연속 공백 정리
  sanitized = sanitized.replace(/  +/g, " ");

  // 10. 라인 끝 공백 제거
  sanitized = sanitized
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  return sanitized;
}

interface MermaidRendererProps {
  chart: string;
  className?: string;
}

export function MermaidRenderer({ chart, className }: MermaidRendererProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!chart?.trim()) {
        setError("빈 다이어그램");
        setIsLoading(false);
        return;
      }

      try {
        initializeMermaid();

        // Generate unique ID for this diagram
        const id = `mermaid-${uniqueId}-${Date.now()}`;

        // Sanitize the chart code before rendering
        const sanitizedChart = sanitizeMermaid(chart.trim());

        // Render the sanitized chart
        const { svg: renderedSvg } = await mermaid.render(id, sanitizedChart);

        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[Mermaid] Render error:", err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Mermaid 렌더링 실패");
          setSvg("");
          setIsLoading(false);
        }
      }
    };

    // Small delay to ensure component is mounted
    const timeoutId = setTimeout(renderChart, 50);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [chart, uniqueId]);

  // Error state - show code with error message
  if (error) {
    return (
      <div className="my-4 p-4 bg-muted rounded-lg border border-border">
        <div className="text-sm text-muted-foreground mb-2">Mermaid 다이어그램</div>
        <pre className="text-xs bg-background p-3 rounded overflow-x-auto whitespace-pre-wrap">
          <code>{chart}</code>
        </pre>
        <div className="text-xs text-destructive mt-2">{error}</div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="my-4 p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          다이어그램 로딩 중...
        </div>
      </div>
    );
  }

  // Success state - render SVG
  return (
    <div
      className={`my-4 p-4 bg-background rounded-lg border border-border overflow-x-auto ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
