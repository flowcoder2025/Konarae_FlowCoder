/** @jest-environment node */

import { load } from "cheerio";
import {
  buildContentAgencyPaginatedUrl,
  parseContentAgencyHtml,
} from "@/lib/crawler/content-agency-parser";

const gconListHtml = `
<table>
  <tbody>
    <tr>
      <td>1992</td>
      <td>접수중</td>
      <td><a href="./view.do?pbancSrnm=11171&menuNo=200061&pageIndex=1">2026년 경기게임제작지원(IP융합 분야) 추가 모집공고</a></td>
      <td>김현정</td>
      <td>2026-04-30</td>
      <td>364</td>
    </tr>
    <tr>
      <td>1991</td>
      <td>접수예정</td>
      <td><a href="./view.do?pbancSrnm=11173&menuNo=200061&pageIndex=1">2026년 대한민국 AI 콘텐츠 어워즈 [백남준 특별상] 출품 공고</a></td>
      <td>우지원</td>
      <td>2026-04-30</td>
      <td>341</td>
    </tr>
  </tbody>
</table>
`;

describe("content agency parser", () => {
  it("builds GCON pagination URLs while preserving menu parameters", () => {
    expect(
      buildContentAgencyPaginatedUrl(
        "https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061",
        3
      )
    ).toBe("https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061&pageIndex=3");
  });

  it("parses GCON business notice table rows", () => {
    const projects = parseContentAgencyHtml(
      load(gconListHtml),
      "https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061",
      24 * 365 * 10
    );

    expect(projects).toEqual([
      expect.objectContaining({
        externalId: "gcon-11171",
        name: "2026년 경기게임제작지원(IP융합 분야) 추가 모집공고",
        organization: "경기콘텐츠진흥원",
        category: "지원사업",
        subCategory: "접수중",
        target: "중소기업",
        region: "경기",
        sourceUrl: "https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061",
        detailUrl: "https://www.gcon.or.kr/gcon/business/gconNotice/view.do?pbancSrnm=11171&menuNo=200061&pageIndex=1",
      }),
      expect.objectContaining({
        externalId: "gcon-11173",
        name: "2026년 대한민국 AI 콘텐츠 어워즈 [백남준 특별상] 출품 공고",
        subCategory: "접수예정",
      }),
    ]);
  });
});
