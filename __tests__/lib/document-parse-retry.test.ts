import {
  buildParseRetryReport,
  classifyParseRetryError,
  isParseableFileType,
  selectParseRetryCandidates,
} from "@/lib/document-parse-retry";

const file = (
  fileName: string,
  fileSize: number,
  parseError: string | null = "Retry failed"
) => ({
  id: fileName,
  fileName,
  fileType: fileName.split(".").pop() || "unknown",
  fileSize,
  parseError,
});

describe("document parse retry helper", () => {
  it("detects parseable file types", () => {
    expect(isParseableFileType("pdf")).toBe(true);
    expect(isParseableFileType("hwp")).toBe(true);
    expect(isParseableFileType("hwpx")).toBe(true);
    expect(isParseableFileType("xlsx")).toBe(false);
  });

  it("classifies recoverable transport failures as retryable", () => {
    expect(classifyParseRetryError("Download failed")).toMatchObject({
      category: "download",
      disposition: "retryable",
      label: "Download Failed",
    });
    expect(classifyParseRetryError("timeout of 60000ms exceeded")).toMatchObject({
      category: "timeout",
      disposition: "retryable",
      label: "Timeout",
    });
    expect(classifyParseRetryError("unable to verify the first certificate")).toMatchObject({
      category: "ssl",
      disposition: "retryable",
      label: "SSL Error",
    });
    expect(classifyParseRetryError("ECONNRESET socket hang up")).toMatchObject({
      category: "network",
      disposition: "retryable",
      label: "Network Error",
    });
  });

  it("classifies no-text, empty, and unsupported failures as terminal", () => {
    expect(classifyParseRetryError("No text extracted")).toMatchObject({
      category: "no_text",
      disposition: "terminal",
      label: "No Text Extracted",
    });

    expect(classifyParseRetryError("0 bytes empty file")).toMatchObject({
      category: "empty_file",
      disposition: "terminal",
      label: "Empty File",
    });

    expect(classifyParseRetryError("Unknown file type is not allowed for security")).toMatchObject({
      category: "unsupported",
      disposition: "terminal",
      label: "Unsupported File",
    });
  });

  it("classifies unmatched or blank errors as unknown", () => {
    expect(classifyParseRetryError(null)).toMatchObject({
      category: "unknown",
      disposition: "unknown",
      label: "Other",
    });
    expect(classifyParseRetryError("Some new parser error")).toMatchObject({
      category: "unknown",
      disposition: "unknown",
      label: "Other",
    });
  });

  it("prioritizes recoverable error category before pure size sorting", () => {
    const candidates = selectParseRetryCandidates([
      file("small-parse.pdf", 10_000, "Parse failed: 500 Internal Server Error"),
      file("large-download.hwp", 5_000_000, "Download failed"),
      file("medium-timeout.hwpx", 500_000, "timeout of 60000ms exceeded"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual([
      "large-download.hwp",
      "medium-timeout.hwpx",
      "small-parse.pdf",
    ]);
  });

  it("excludes terminal, unsupported, zero-byte, and unsupported type files from retry candidates", () => {
    const candidates = selectParseRetryCandidates([
      file("empty-content.hwpx", 3_486, "No text extracted"),
      file("empty-file.pdf", 0, "Download failed"),
      file("spreadsheet.xlsx", 256_000, "Download failed"),
      file("download-failed.pdf", 400_000, "Download failed"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual([
      "download-failed.pdf",
    ]);
  });

  it("excludes archive or spreadsheet filename mismatches even when fileType is parseable", () => {
    const candidates = selectParseRetryCandidates([
      {
        ...file("2. 신청서 서식 모음_2025년 원포인트 신속지원.zip", 310_161, "unable to verify the first certificate"),
        fileType: "hwpx",
      },
      {
        ...file("3. (제출서류 서식3) 참여기업 및 품목 정보(국문 영문).xlsx", 19_911, "Upload failed"),
        fileType: "hwpx",
      },
      file("recoverable.hwp", 40_000, "unable to verify the first certificate"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual(["recoverable.hwp"]);
  });

  it("treats rhwp parse failed and restricted Supabase upload errors as terminal", () => {
    expect(classifyParseRetryError("rhwp parse failed")).toMatchObject({
      category: "terminal_parse",
      disposition: "terminal",
      label: "Terminal Parse Failed",
    });

    expect(
      classifyParseRetryError(
        "Upload failed: Service for this project is restricted due to the following violations: exceed_storage_size_quota."
      )
    ).toMatchObject({
      category: "restricted_upload",
      disposition: "terminal",
      label: "Restricted Upload",
    });

    const candidates = selectParseRetryCandidates([
      file("failed.hwpx", 310_161, "rhwp parse failed"),
      file(
        "restricted.hwp",
        15_872,
        "Upload failed: Service for this project is restricted due to the following violations: exceed_storage_size_quota."
      ),
      file("recoverable.hwp", 40_000, "Upload failed"),
    ]);

    expect(candidates.map((candidate) => candidate.fileName)).toEqual(["recoverable.hwp"]);
  });

  it("can include unknown errors only when explicitly requested", () => {
    const candidates = selectParseRetryCandidates(
      [file("unknown.hwpx", 400_000, "Some new parser error")],
      { includeUnknownErrors: true }
    );

    expect(candidates.map((candidate) => candidate.fileName)).toEqual(["unknown.hwpx"]);
  });

  it("builds a dry-run report with retryable, terminal, and unknown counts", () => {
    const report = buildParseRetryReport([
      file("download.pdf", 400_000, "Download failed"),
      file("notext.hwp", 400_000, "No text extracted"),
      file("mystery.hwpx", 400_000, "Some new parser error"),
    ]);

    expect(report.totalScanned).toBe(3);
    expect(report.retryableCount).toBe(1);
    expect(report.terminalCount).toBe(1);
    expect(report.unknownCount).toBe(1);
    expect(report.retryableByCategory).toEqual({ download: 1 });
    expect(report.terminalByCategory).toEqual({ no_text: 1 });
    expect(report.unknownByCategory).toEqual({ unknown: 1 });
    expect(report.candidates.map((candidate) => candidate.fileName)).toEqual(["download.pdf"]);
  });
});
