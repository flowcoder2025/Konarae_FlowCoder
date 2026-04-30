import { selectParseRetryCandidates } from "../../scripts/retry-parsing-selection";

const file = (fileName: string, fileSize: number, parseError: string | null = "Retry failed") => ({
  id: fileName,
  fileName,
  fileType: fileName.split(".").pop() || "unknown",
  fileSize,
  storagePath: null,
  sourceUrl: "https://example.com/file",
  parseError,
  project: {
    id: `${fileName}-project`,
    name: "지원사업",
    detailUrl: "https://example.com/project",
  },
});

describe("retry parsing candidate selection", () => {
  it("selects the smallest retryable files first for preflight runs", () => {
    const candidates = selectParseRetryCandidates([
      file("large.pdf", 34_860_090, "Upload failed"),
      file("small.hwp", 512_000, "timeout of 60000ms exceeded"),
      file("medium.hwpx", 2_000_000, "unable to verify the first certificate"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual([
      "small.hwp",
      "medium.hwpx",
      "large.pdf",
    ]);
  });

  it("ignores zero-byte or unsupported files before selecting a preflight candidate", () => {
    const candidates = selectParseRetryCandidates([
      file("empty.txt", 0, "Unknown file type is not allowed for security"),
      file("small.pdf", 256_000, "Upload failed"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual(["small.pdf"]);
  });

  it("excludes no-text failures from preflight retry candidates", () => {
    const candidates = selectParseRetryCandidates([
      file("empty-content.hwpx", 3_486, "No text extracted"),
      file("download-failed.pdf", 400_000, "Download failed"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual(["download-failed.pdf"]);
  });
});
