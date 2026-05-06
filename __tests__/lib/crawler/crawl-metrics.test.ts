import {
  buildCrawlJobMetrics,
  type CrawlMetricAttachment,
  type CrawlJobMetrics,
} from "@/lib/crawler/crawl-metrics";

describe("buildCrawlJobMetrics", () => {
  it("computes all fields correctly for the canonical example", () => {
    const attachments: CrawlMetricAttachment[] = [
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: true, parseError: null },
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: false, parseError: "No text extracted" },
      { projectId: "project-2", downloaded: false, shouldParse: false, isParsed: false, parseError: null },
    ];

    const result: CrawlJobMetrics = buildCrawlJobMetrics({
      listItemsFound: 10,
      detailPagesFetched: 8,
      projectsCreated: 3,
      projectsUpdated: 5,
      attachments,
    });

    expect(result).toEqual({
      listItemsFound: 10,
      detailPagesFetched: 8,
      projectsCreated: 3,
      projectsUpdated: 5,
      attachmentLinksFound: 3,
      attachmentsDownloaded: 2,
      attachmentsParsed: 1,
      parseFailures: 1,
      analysisReadyProjects: 1,
    });
  });

  it("counts distinct analysis-ready projects, not parsed attachment rows", () => {
    const attachments: CrawlMetricAttachment[] = [
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: true, parseError: null },
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: true, parseError: null },
      { projectId: "project-2", downloaded: true, shouldParse: true, isParsed: true, parseError: null },
      { projectId: "project-3", downloaded: true, shouldParse: true, isParsed: false, parseError: "timeout" },
    ];

    const result = buildCrawlJobMetrics({
      listItemsFound: 4,
      detailPagesFetched: 4,
      projectsCreated: 4,
      projectsUpdated: 0,
      attachments,
    });

    expect(result.attachmentsParsed).toBe(3);
    expect(result.parseFailures).toBe(1);
    expect(result.analysisReadyProjects).toBe(2);
  });

  it("returns zero counts when attachments is empty", () => {
    const result = buildCrawlJobMetrics({
      listItemsFound: 5,
      detailPagesFetched: 3,
      projectsCreated: 2,
      projectsUpdated: 1,
      attachments: [],
    });

    expect(result.attachmentLinksFound).toBe(0);
    expect(result.attachmentsDownloaded).toBe(0);
    expect(result.attachmentsParsed).toBe(0);
    expect(result.parseFailures).toBe(0);
    expect(result.analysisReadyProjects).toBe(0);
  });

  it("counts all parsed attachments without parse failures when every parseable download succeeds", () => {
    const attachments: CrawlMetricAttachment[] = [
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: true, parseError: null },
      { projectId: "project-2", downloaded: true, shouldParse: true, isParsed: true, parseError: null },
      { projectId: "project-3", downloaded: true, shouldParse: false, isParsed: false, parseError: null },
    ];

    const result = buildCrawlJobMetrics({
      listItemsFound: 3,
      detailPagesFetched: 3,
      projectsCreated: 3,
      projectsUpdated: 0,
      attachments,
    });

    expect(result.attachmentsDownloaded).toBe(3);
    expect(result.attachmentsParsed).toBe(2);
    expect(result.parseFailures).toBe(0);
    expect(result.analysisReadyProjects).toBe(2);
  });

  it("returns analysisReadyProjects=0 when no attachment was successfully parsed", () => {
    const attachments: CrawlMetricAttachment[] = [
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: false, parseError: "timeout" },
      { projectId: "project-2", downloaded: false, shouldParse: false, isParsed: false, parseError: null },
    ];

    const result = buildCrawlJobMetrics({
      listItemsFound: 2,
      detailPagesFetched: 2,
      projectsCreated: 1,
      projectsUpdated: 0,
      attachments,
    });

    expect(result.attachmentsParsed).toBe(0);
    expect(result.analysisReadyProjects).toBe(0);
  });

  it("counts parseFailures for shouldParse=true entries that have parseError even if isParsed=true", () => {
    const attachments: CrawlMetricAttachment[] = [
      { projectId: "project-1", downloaded: true, shouldParse: true, isParsed: true, parseError: "partial failure" },
    ];

    const result = buildCrawlJobMetrics({
      listItemsFound: 1,
      detailPagesFetched: 1,
      projectsCreated: 1,
      projectsUpdated: 0,
      attachments,
    });

    expect(result.attachmentsParsed).toBe(0);
    expect(result.parseFailures).toBe(1);
    expect(result.analysisReadyProjects).toBe(0);
  });
});
