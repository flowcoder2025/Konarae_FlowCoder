/**
 * Crawl job metrics — pure aggregation helpers.
 * No I/O; all functions are deterministic given their inputs.
 */

export interface CrawlMetricAttachment {
  projectId: string;
  downloaded: boolean;
  shouldParse: boolean;
  isParsed: boolean;
  parseError?: string | null;
}

export interface BuildCrawlJobMetricsInput {
  listItemsFound: number;
  detailPagesFetched: number;
  projectsCreated: number;
  projectsUpdated: number;
  attachments: CrawlMetricAttachment[];
}

export interface CrawlJobMetrics {
  listItemsFound: number;
  detailPagesFetched: number;
  projectsCreated: number;
  projectsUpdated: number;
  attachmentLinksFound: number;
  attachmentsDownloaded: number;
  attachmentsParsed: number;
  parseFailures: number;
  analysisReadyProjects: number;
}

/**
 * Build structured metrics for a completed crawl job.
 *
 * Definitions:
 *   - attachmentLinksFound     = all attachment records returned by file processing
 *   - attachmentsDownloaded    = records where a file buffer was successfully downloaded
 *   - attachmentsParsed        = records where shouldParse && isParsed && no parseError
 *   - parseFailures            = records where shouldParse && (!isParsed || parseError present)
 *   - analysisReadyProjects    = distinct projects with at least one successfully parsed attachment
 */
export function buildCrawlJobMetrics(
  input: BuildCrawlJobMetricsInput
): CrawlJobMetrics {
  const { listItemsFound, detailPagesFetched, projectsCreated, projectsUpdated, attachments } = input;

  const downloaded = attachments.filter((a) => a.downloaded);
  const parsed = attachments.filter((a) => a.shouldParse && a.isParsed && !a.parseError);
  const failures = attachments.filter((a) => a.shouldParse && (!a.isParsed || !!a.parseError));
  const analysisReadyProjectIds = new Set(parsed.map((a) => a.projectId));

  return {
    listItemsFound,
    detailPagesFetched,
    projectsCreated,
    projectsUpdated,
    attachmentLinksFound: attachments.length,
    attachmentsDownloaded: downloaded.length,
    attachmentsParsed: parsed.length,
    parseFailures: failures.length,
    analysisReadyProjects: analysisReadyProjectIds.size,
  };
}
