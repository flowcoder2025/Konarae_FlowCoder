/**
 * @jest-environment node
 */
import {
  MISSING,
  RowCountReadError,
  UsageError,
  compareRowCounts,
  findMismatches,
  loadRowCountsSql,
  mergeRowCounts,
  parseCliArgs,
  parseRowCountRows,
  sanitizeErrorMessage,
} from "../../scripts/db/compare-row-counts";

const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

const SOURCE_URL = "postgresql://user:s3cret-source-pw@source.example:5432/db";
const TARGET_URL = "postgresql://user:s3cret-target-pw@target.example:6432/db";

describe("compare-row-counts merge/diff", () => {
  it("reports no mismatch when all counts are equal", () => {
    const rows = mergeRowCounts(counts({ a: 1, b: 0 }), counts({ a: 1, b: 0 }));
    expect(rows).toEqual([
      { table: "a", source: 1, target: 1 },
      { table: "b", source: 0, target: 0 },
    ]);
    expect(findMismatches(rows)).toEqual([]);
  });

  it("reports a count mismatch", () => {
    const rows = mergeRowCounts(counts({ a: 10, b: 2 }), counts({ a: 9, b: 2 }));
    expect(findMismatches(rows)).toEqual([{ table: "a", source: 10, target: 9 }]);
  });

  it("reports a table that exists only in the source with target -1", () => {
    const rows = mergeRowCounts(counts({ a: 1, only_source: 5 }), counts({ a: 1 }));
    expect(findMismatches(rows)).toEqual([{ table: "only_source", source: 5, target: MISSING }]);
    expect(MISSING).toBe(-1);
  });

  it("reports a table that exists only in the target with source -1", () => {
    const rows = mergeRowCounts(counts({ a: 1 }), counts({ a: 1, only_target: 0 }));
    expect(findMismatches(rows)).toEqual([{ table: "only_target", source: -1, target: 0 }]);
  });

  it("applies the exclude list on both sides, even for mismatching or one-sided tables", () => {
    const rows = mergeRowCounts(
      counts({ a: 1, document_embeddings: 9000, gone: 3 }),
      counts({ a: 1, document_embeddings: 0 }),
      ["document_embeddings", "gone"],
    );
    expect(rows).toEqual([{ table: "a", source: 1, target: 1 }]);
    expect(findMismatches(rows)).toEqual([]);
  });

  it("sorts output by table name in code-unit (C collation) order", () => {
    const rows = mergeRowCounts(
      counts({ user_projects: 1, User: 1, "BusinessPlan": 1, _prisma_migrations: 1 }),
      counts({ credits: 1, User: 1 }),
    );
    expect(rows.map((r) => r.table)).toEqual(["BusinessPlan", "User", "_prisma_migrations", "credits", "user_projects"]);
  });

  it("compareRowCounts reads source and target through the injected reader", async () => {
    const reader = jest.fn(async (url: string) =>
      url === SOURCE_URL ? counts({ a: 2, document_embeddings: 50 }) : counts({ a: 2, document_embeddings: 0 }),
    );
    const rows = await compareRowCounts(SOURCE_URL, TARGET_URL, { exclude: ["document_embeddings"] }, reader);
    expect(reader.mock.calls.map((c) => c[0])).toEqual([SOURCE_URL, TARGET_URL]);
    expect(rows).toEqual([{ table: "a", source: 2, target: 2 }]);
  });

  it("compareRowCounts tags reader failures with the side that failed", async () => {
    const reader = async (url: string) => {
      if (url === TARGET_URL) throw new Error("boom");
      return counts({ a: 1 });
    };
    await expect(compareRowCounts(SOURCE_URL, TARGET_URL, { exclude: [] }, reader)).rejects.toMatchObject({
      side: "target",
    });
    await expect(compareRowCounts(SOURCE_URL, TARGET_URL, { exclude: [] }, reader)).rejects.toBeInstanceOf(
      RowCountReadError,
    );
  });

  it("parses row-counts.sql rows (text counts) and rejects malformed rows", () => {
    expect(parseRowCountRows([{ table_name: "a", row_count: "12" }])).toEqual(counts({ a: 12 }));
    expect(parseRowCountRows([{ table_name: "a", row_count: 12 }, { table_name: "b", row_count: BigInt(3) }])).toEqual(
      counts({ a: 12, b: 3 }),
    );
    expect(() => parseRowCountRows([{ table_name: "a", row_count: "x" }])).toThrow();
    expect(() => parseRowCountRows([{ table_name: "a", row_count: "-1" }])).toThrow();
  });

  it("rejects null / empty / non-numeric counts instead of reading them as 0", () => {
    for (const bad of [null, undefined, "", " ", "1e3", "12.0", "0x10", NaN, 1.5, {}, true]) {
      expect(() => parseRowCountRows([{ table_name: "a", row_count: bad }])).toThrow(/unexpected row/);
    }
    expect(() => parseRowCountRows([{ table_name: null, row_count: "1" }])).toThrow(/unexpected row/);
    expect(() => parseRowCountRows([{ table_name: "", row_count: "1" }])).toThrow(/unexpected row/);
  });

  it("loads the shared row-counts.sql as a single statement without the trailing semicolon", () => {
    const sql = loadRowCountsSql();
    expect(sql).toMatch(/query_to_xml/);
    expect(sql).toMatch(/nspname = 'public'/);
    expect(sql.endsWith(";")).toBe(false);
  });
});

describe("compare-row-counts CLI args", () => {
  const env = { SRC_URL: SOURCE_URL, TGT_URL: TARGET_URL, EMPTY_URL: "" };

  it("reads URLs from the named env vars and parses --exclude", () => {
    expect(
      parseCliArgs(["--source-env", "SRC_URL", "--target-env=TGT_URL", "--exclude", "document_embeddings,b"], env),
    ).toEqual({
      sourceEnv: "SRC_URL",
      targetEnv: "TGT_URL",
      sourceUrl: SOURCE_URL,
      targetUrl: TARGET_URL,
      exclude: ["document_embeddings", "b"],
    });
  });

  it("missing env var is a usage error that names the variable but echoes no value", () => {
    let error: unknown;
    try {
      parseCliArgs(["--source-env", "SRC_URL", "--target-env", "NOT_SET_URL"], env);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(UsageError);
    const message = (error as Error).message;
    expect(message).toContain("NOT_SET_URL");
    expect(message).not.toContain("s3cret");
    expect(message).not.toContain("example");
    expect(() => parseCliArgs(["--source-env", "SRC_URL", "--target-env", "EMPTY_URL"], env)).toThrow(UsageError);
  });

  it("never echoes an argument value that is not a valid env var name (e.g. a pasted URL)", () => {
    for (const argv of [
      ["--source-env", SOURCE_URL, "--target-env", "TGT_URL"],
      ["--source-env", "SRC_URL", "--target-env", "TGT_URL", SOURCE_URL],
    ]) {
      let message = "";
      try {
        parseCliArgs(argv, env);
      } catch (err) {
        expect(err).toBeInstanceOf(UsageError);
        message = (err as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toContain("s3cret");
      expect(message).not.toContain("postgresql://");
    }
  });

  it("requires both env names", () => {
    expect(() => parseCliArgs(["--source-env", "SRC_URL"], env)).toThrow(UsageError);
  });
});

describe("compare-row-counts error sanitizing", () => {
  it("removes URLs and passwords from driver errors", () => {
    const err = Object.assign(
      new Error(`Can't reach ${SOURCE_URL} (password s3cret-source-pw) at\n  target.example:6432`),
      { code: "P1001" },
    );
    const msg = sanitizeErrorMessage(err, [SOURCE_URL, TARGET_URL]);
    expect(msg.startsWith("P1001: ")).toBe(true);
    expect(msg).not.toContain("s3cret");
    expect(msg).not.toContain("postgresql://");
    expect(msg).not.toContain("\n");
  });
});
