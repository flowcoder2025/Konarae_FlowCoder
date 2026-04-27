import { parsePublicProjectQuery } from "@/lib/projects/public-query";

describe("parsePublicProjectQuery", () => {
  it("normalizes defaults", () => {
    const query = parsePublicProjectQuery(new URLSearchParams());

    expect(query.page).toBe(1);
    expect(query.limit).toBe(12);
    expect(query.sort).toBe("latest");
  });

  it("clamps pagination", () => {
    const query = parsePublicProjectQuery(new URLSearchParams("page=-10&limit=500"));

    expect(query.page).toBe(1);
    expect(query.limit).toBe(50);
  });

  it("falls back from invalid pagination values", () => {
    const query = parsePublicProjectQuery(new URLSearchParams("page=abc&limit=0"));

    expect(query.page).toBe(1);
    expect(query.limit).toBe(12);
  });

  it("keeps supported filters", () => {
    const query = parsePublicProjectQuery(
      new URLSearchParams(
        "q=R%26D&region=서울&category=기술&target=창업&status=open&benefitMin=1000&benefitMax=5000&deadlineFrom=2026-04-01&deadlineTo=2026-04-30&sort=closingSoon"
      )
    );

    expect(query.q).toBe("R&D");
    expect(query.region).toBe("서울");
    expect(query.category).toBe("기술");
    expect(query.target).toBe("창업");
    expect(query.status).toBe("open");
    expect(query.benefitMin).toBe(1000);
    expect(query.benefitMax).toBe(5000);
    expect(query.deadlineFrom).toBe("2026-04-01");
    expect(query.deadlineTo).toBe("2026-04-30");
    expect(query.sort).toBe("closingSoon");
  });

  it("falls back from unsupported sort to latest", () => {
    const query = parsePublicProjectQuery(new URLSearchParams("sort=random"));

    expect(query.sort).toBe("latest");
  });

  it("drops unsupported status", () => {
    const query = parsePublicProjectQuery(new URLSearchParams("status=active"));

    expect(query.status).toBeUndefined();
  });
});
