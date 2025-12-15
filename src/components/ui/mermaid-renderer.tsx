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

        // Render the chart
        const { svg: renderedSvg } = await mermaid.render(id, chart.trim());

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
