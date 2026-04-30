import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { ParseResult } from "@/lib/document-parser";

interface HwpDocumentLike {
  pageCount(): number;
  getPageTextLayout(page: number): string;
  renderPageSvg(page: number): string;
  free?: () => void;
}

interface RhwpCoreLike {
  default: (options?: { module_or_path?: Uint8Array | Buffer }) => Promise<unknown> | unknown;
  HwpDocument: new (data: Uint8Array) => HwpDocumentLike;
}

export interface RhwpParserOptions {
  loadCore?: () => Promise<RhwpCoreLike>;
}

type LayoutRun = {
  text?: unknown;
  secIdx?: unknown;
  paraIdx?: unknown;
  parentParaIdx?: unknown;
  cellIdx?: unknown;
  cellParaIdx?: unknown;
};

type TextRun = {
  text: string;
  key: string;
};

const requireFromHere = createRequire(import.meta.url);
let initPromise: Promise<void> | null = null;

function ensureMeasureTextWidth() {
  const globalMeasure = globalThis as typeof globalThis & {
    measureTextWidth?: (font: string, text: string) => number;
  };

  if (typeof globalMeasure.measureTextWidth !== "function") {
    globalMeasure.measureTextWidth = (_font: string, text: string) => text.length * 8;
  }
}

async function loadDefaultCore(): Promise<RhwpCoreLike> {
  return import("@rhwp/core") as Promise<RhwpCoreLike>;
}

async function initializeCore(core: RhwpCoreLike, useDefaultLoader: boolean) {
  ensureMeasureTextWidth();

  if (!useDefaultLoader) {
    await core.default();
    return;
  }

  initPromise ??= (async () => {
    const wasmPath = requireFromHere.resolve("@rhwp/core/rhwp_bg.wasm");
    const wasmBytes = await readFile(wasmPath);
    await core.default({ module_or_path: wasmBytes });
  })();

  await initPromise;
}

function parseLayoutRuns(layout: string): TextRun[] {
  const parsed = JSON.parse(layout) as { runs?: LayoutRun[] };
  const runs = Array.isArray(parsed.runs) ? parsed.runs : [];

  return runs
    .map((run) => {
      const text = typeof run.text === "string" ? run.text : "";
      const paragraph = run.cellParaIdx ?? run.paraIdx ?? 0;
      const key = [run.secIdx ?? 0, run.parentParaIdx ?? "", run.cellIdx ?? "", paragraph].join(":");
      return { text, key };
    })
    .filter((run) => run.text.trim().length > 0);
}

function renderRuns(runs: TextRun[]): string {
  const lines: string[] = [];
  let currentKey: string | null = null;
  let currentLine = "";

  for (const run of runs) {
    if (currentKey !== null && run.key !== currentKey) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = "";
    }

    currentKey = run.key;
    currentLine += run.text;
  }

  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractSvgText(svg: string): string[] {
  return Array.from(svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g))
    .map((match) =>
      match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim()
    )
    .filter(Boolean);
}

export async function parseHwpWithRhwp(
  buffer: Buffer,
  options: RhwpParserOptions = {}
): Promise<ParseResult> {
  try {
    const useDefaultLoader = !options.loadCore;
    const core = await (options.loadCore ?? loadDefaultCore)();
    await initializeCore(core, useDefaultLoader);

    const document = new core.HwpDocument(new Uint8Array(buffer));
    const pageCount = document.pageCount();
    const runs: TextRun[] = [];
    const svgText: string[] = [];

    try {
      for (let page = 0; page < pageCount; page += 1) {
        try {
          runs.push(...parseLayoutRuns(document.getPageTextLayout(page)));
        } catch {
          svgText.push(...extractSvgText(document.renderPageSvg(page)));
        }
      }
    } finally {
      document.free?.();
    }

    const text = renderRuns(runs) || svgText.join("\n").trim();

    return {
      success: text.length > 0,
      text,
      metadata: { pages: pageCount },
      error: text.length > 0 ? undefined : "No text extracted",
    };
  } catch (error) {
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "rhwp parse failed",
    };
  }
}
