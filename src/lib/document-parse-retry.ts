export const PARSEABLE_FILE_TYPES = ["pdf", "hwp", "hwpx"] as const;

export type ParseableFileType = (typeof PARSEABLE_FILE_TYPES)[number];

export type ParseRetryCategory =
  | "download"
  | "timeout"
  | "network"
  | "ssl"
  | "upload"
  | "transient_parse"
  | "no_text"
  | "empty_file"
  | "unsupported"
  | "unknown";

export type ParseRetryDisposition = "retryable" | "terminal" | "unknown";

export interface ParseRetryClassification {
  category: ParseRetryCategory;
  label: string;
  disposition: ParseRetryDisposition;
  priority: number;
}

export interface ParseRetryCandidateInput {
  fileName: string;
  fileType: string;
  fileSize: number;
  parseError: string | null;
}

export interface SelectParseRetryCandidatesOptions {
  maxFileSizeBytes?: number;
  includeUnknownErrors?: boolean;
}

export interface ParseRetryReport<T extends ParseRetryCandidateInput> {
  totalScanned: number;
  retryableCount: number;
  terminalCount: number;
  unknownCount: number;
  retryableByCategory: Record<string, number>;
  terminalByCategory: Record<string, number>;
  unknownByCategory: Record<string, number>;
  candidates: T[];
}

const PARSEABLE_FILE_TYPE_SET = new Set<string>(PARSEABLE_FILE_TYPES);

const CLASSIFICATIONS: Record<ParseRetryCategory, ParseRetryClassification> = {
  download: {
    category: "download",
    label: "Download Failed",
    disposition: "retryable",
    priority: 10,
  },
  timeout: {
    category: "timeout",
    label: "Timeout",
    disposition: "retryable",
    priority: 20,
  },
  network: {
    category: "network",
    label: "Network Error",
    disposition: "retryable",
    priority: 30,
  },
  ssl: {
    category: "ssl",
    label: "SSL Error",
    disposition: "retryable",
    priority: 40,
  },
  upload: {
    category: "upload",
    label: "Upload Failed",
    disposition: "retryable",
    priority: 50,
  },
  transient_parse: {
    category: "transient_parse",
    label: "Parse Failed",
    disposition: "retryable",
    priority: 60,
  },
  no_text: {
    category: "no_text",
    label: "No Text Extracted",
    disposition: "terminal",
    priority: 900,
  },
  empty_file: {
    category: "empty_file",
    label: "Empty File",
    disposition: "terminal",
    priority: 910,
  },
  unsupported: {
    category: "unsupported",
    label: "Unsupported File",
    disposition: "terminal",
    priority: 920,
  },
  unknown: {
    category: "unknown",
    label: "Other",
    disposition: "unknown",
    priority: 999,
  },
};

export function isParseableFileType(fileType: string): fileType is ParseableFileType {
  return PARSEABLE_FILE_TYPE_SET.has(fileType.toLowerCase());
}

export function classifyParseRetryError(
  parseError: string | null | undefined
): ParseRetryClassification {
  const normalized = parseError?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return CLASSIFICATIONS.unknown;
  }

  if (
    normalized.includes("no text") ||
    normalized.includes("텍스트 없음") ||
    normalized.includes("text extraction failed")
  ) {
    return CLASSIFICATIONS.no_text;
  }

  if (
    normalized.includes("empty") ||
    normalized.includes("0 bytes") ||
    normalized.includes("zero-byte") ||
    normalized.includes("비어")
  ) {
    return CLASSIFICATIONS.empty_file;
  }

  if (
    normalized.includes("unknown file type") ||
    normalized.includes("unsupported") ||
    normalized.includes("not allowed for security") ||
    normalized.includes("알 수 없는 파일")
  ) {
    return CLASSIFICATIONS.unsupported;
  }

  if (normalized.includes("download") || normalized.includes("다운로드")) {
    return CLASSIFICATIONS.download;
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("시간 초과") ||
    normalized.includes("시간")
  ) {
    return CLASSIFICATIONS.timeout;
  }

  if (
    normalized.includes("certificate") ||
    normalized.includes("ssl") ||
    normalized.includes("tls") ||
    normalized.includes("unable to verify")
  ) {
    return CLASSIFICATIONS.ssl;
  }

  if (
    normalized.includes("network") ||
    normalized.includes("connect") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("socket") ||
    normalized.includes("네트워크")
  ) {
    return CLASSIFICATIONS.network;
  }

  if (normalized.includes("upload") || normalized.includes("업로드")) {
    return CLASSIFICATIONS.upload;
  }

  if (
    normalized.includes("parse failed") ||
    normalized.includes("parser failed") ||
    normalized.includes("retry error") ||
    normalized.includes("파싱 실패")
  ) {
    return CLASSIFICATIONS.transient_parse;
  }

  return CLASSIFICATIONS.unknown;
}

export function selectParseRetryCandidates<T extends ParseRetryCandidateInput>(
  files: T[],
  options: SelectParseRetryCandidatesOptions = {}
): T[] {
  return files
    .filter((file) => {
      const classification = classifyParseRetryError(file.parseError);

      if (file.fileSize <= 0) {
        return false;
      }

      if (options.maxFileSizeBytes && file.fileSize > options.maxFileSizeBytes) {
        return false;
      }

      if (!isParseableFileType(file.fileType)) {
        return false;
      }

      if (classification.disposition === "retryable") {
        return true;
      }

      return options.includeUnknownErrors === true && classification.disposition === "unknown";
    })
    .sort((a, b) => {
      const aClassification = classifyParseRetryError(a.parseError);
      const bClassification = classifyParseRetryError(b.parseError);
      const priorityDiff = aClassification.priority - bClassification.priority;

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const sizeDiff = a.fileSize - b.fileSize;
      if (sizeDiff !== 0) {
        return sizeDiff;
      }

      return a.fileName.localeCompare(b.fileName);
    });
}

export function buildParseRetryReport<T extends ParseRetryCandidateInput>(
  files: T[],
  options: SelectParseRetryCandidatesOptions = {}
): ParseRetryReport<T> {
  const retryableByCategory: Record<string, number> = {};
  const terminalByCategory: Record<string, number> = {};
  const unknownByCategory: Record<string, number> = {};
  let retryableCount = 0;
  let terminalCount = 0;
  let unknownCount = 0;

  for (const file of files) {
    const classification = classifyParseRetryError(file.parseError);

    if (classification.disposition === "retryable") {
      retryableCount++;
      increment(retryableByCategory, classification.category);
    } else if (classification.disposition === "terminal") {
      terminalCount++;
      increment(terminalByCategory, classification.category);
    } else {
      unknownCount++;
      increment(unknownByCategory, classification.category);
    }
  }

  return {
    totalScanned: files.length,
    retryableCount,
    terminalCount,
    unknownCount,
    retryableByCategory,
    terminalByCategory,
    unknownByCategory,
    candidates: selectParseRetryCandidates(files, options),
  };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}
