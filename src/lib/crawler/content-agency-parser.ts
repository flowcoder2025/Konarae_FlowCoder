export interface ContentAgencyProject {
  externalId?: string;
  name: string;
  organization: string;
  category: string;
  subCategory?: string;
  target: string;
  region: string;
  summary: string;
  sourceUrl: string;
  detailUrl?: string;
}

export function buildContentAgencyPaginatedUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);
  url.searchParams.delete("page");
  url.searchParams.delete("cpage");
  url.searchParams.set("pageIndex", pageIndex.toString());
  return url.toString();
}

export function parseContentAgencyHtml(
  $: ReturnType<typeof import("cheerio")["load"]>,
  sourceUrl: string,
  hoursFilter: number
): ContentAgencyProject[] {
  if (!sourceUrl.includes("gcon.or.kr")) {
    return [];
  }

  const projects: ContentAgencyProject[] = [];

  $("tbody tr, table tr").each((_index, element) => {
    const $row = $(element);
    const $link = $row.find('a[href*="view.do"], a[href*="pbancSrnm"]').first();
    const href = $link.attr("href");
    const name = normalizeText($link.text());

    if (!href || !name) {
      return;
    }

    const cells = $row.find("td").map((_cellIndex, cell) => normalizeText($(cell).text())).get();
    const postedDate = cells.find((cell) => /\d{4}[-.]\d{2}[-.]\d{2}/.test(cell)) ?? "";

    if (!isWithinTimeFilter(postedDate, hoursFilter)) {
      return;
    }

    const detailUrl = new URL(href, sourceUrl).toString();
    const pbancSrnm = new URL(detailUrl).searchParams.get("pbancSrnm");

    projects.push({
      externalId: pbancSrnm ? `gcon-${pbancSrnm}` : undefined,
      name,
      organization: "경기콘텐츠진흥원",
      category: "지원사업",
      subCategory: cells[1] || undefined,
      target: "중소기업",
      region: "경기",
      summary: name,
      sourceUrl,
      detailUrl,
    });
  });

  return projects;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isWithinTimeFilter(dateStr: string, hoursFilter: number): boolean {
  if (!dateStr) {
    return true;
  }

  const normalizedDate = dateStr
    .trim()
    .replace(/(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3")
    .replace(/^(\d{2})\.(\d{2})\.(\d{2})$/, "20$1-$2-$3")
    .replace(/^(\d{2})-(\d{2})-(\d{2})$/, "20$1-$2-$3");
  const dateMatch = normalizedDate.match(/\d{4}-\d{2}-\d{2}/);

  if (!dateMatch) {
    return true;
  }

  const uploadDate = new Date(dateMatch[0]);

  if (Number.isNaN(uploadDate.getTime())) {
    return true;
  }

  const diffHours = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60);
  return diffHours <= hoursFilter;
}
