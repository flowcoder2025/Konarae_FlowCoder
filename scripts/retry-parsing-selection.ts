const PARSEABLE_FILE_TYPES = new Set(["pdf", "hwp", "hwpx"]);
const RETRYABLE_ERROR_PATTERNS = ["download", "timeout", "upload", "certificate", "parse failed", "retry error"];

export type RetryParsingCandidate = {
  fileName: string;
  fileType: string;
  fileSize: number;
  parseError: string | null;
};

export function selectParseRetryCandidates<T extends RetryParsingCandidate>(files: T[]): T[] {
  return files
    .filter((file) => {
      const parseError = file.parseError?.toLowerCase() ?? "";

      return (
        file.fileSize > 0 &&
        PARSEABLE_FILE_TYPES.has(file.fileType) &&
        RETRYABLE_ERROR_PATTERNS.some((pattern) => parseError.includes(pattern))
      );
    })
    .sort((a, b) => a.fileSize - b.fileSize);
}
