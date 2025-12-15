"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "inherit",
});

interface MermaidRendererProps {
  chart: string;
  className?: string;
}

export function MermaidRenderer({ chart, className }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderChart = async () => {
      if (!chart || !containerRef.current) return;

      try {
        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // Render the chart
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        console.error("[Mermaid] Render error:", err);
        setError(err instanceof Error ? err.message : "Mermaid 렌더링 실패");
        setSvg("");
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 p-4 bg-muted rounded-lg border border-border">
        <div className="text-sm text-muted-foreground mb-2">Mermaid 다이어그램</div>
        <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
          <code>{chart}</code>
        </pre>
        <div className="text-xs text-destructive mt-2">{error}</div>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 p-4 bg-muted rounded-lg animate-pulse">
        <div className="h-32 bg-muted-foreground/10 rounded" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`my-4 p-4 bg-background rounded-lg border border-border overflow-x-auto ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
