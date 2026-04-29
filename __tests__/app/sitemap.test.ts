import { parseSitemapProjectLimit } from "@/lib/projects/sitemap";

describe("parseSitemapProjectLimit", () => {
  it("uses default for missing, blank, invalid, negative, or decimal values", () => {
    expect(parseSitemapProjectLimit(undefined)).toBe(5000);
    expect(parseSitemapProjectLimit("")).toBe(5000);
    expect(parseSitemapProjectLimit("abc")).toBe(5000);
    expect(parseSitemapProjectLimit("-1")).toBe(5000);
    expect(parseSitemapProjectLimit("12.5")).toBe(5000);
  });

  it("treats zero as disabling project sitemap entries", () => {
    expect(parseSitemapProjectLimit("0")).toBe(0);
  });

  it("clamps positive values into the allowed range", () => {
    expect(parseSitemapProjectLimit("1")).toBe(1);
    expect(parseSitemapProjectLimit("4999")).toBe(4999);
    expect(parseSitemapProjectLimit("50000")).toBe(50000);
    expect(parseSitemapProjectLimit("50001")).toBe(50000);
  });
});
