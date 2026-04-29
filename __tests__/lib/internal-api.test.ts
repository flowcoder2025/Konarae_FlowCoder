import { Request } from "node-fetch";

describe("internal API auth", () => {
  let original: string | undefined;
  let warnMock: jest.Mock;

  beforeEach(() => {
    original = process.env.INTERNAL_API_KEY;
    jest.resetModules();
    warnMock = jest.fn();
    jest.doMock("@/lib/logger", () => ({
      createLogger: jest.fn(() => ({ warn: warnMock })),
    }));
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.INTERNAL_API_KEY;
    } else {
      process.env.INTERNAL_API_KEY = original;
    }
  });

  it("rejects missing request key when internal key is configured", async () => {
    process.env.INTERNAL_API_KEY = "secret";
    const { isValidInternalRequest } = await import("@/lib/internal-api");
    const request = new Request("http://localhost/api/internal/pipeline/health");

    expect(isValidInternalRequest(request)).toBe(false);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("rejects and logs when internal key is not configured — warns only once across multiple calls", async () => {
    delete process.env.INTERNAL_API_KEY;
    const { isValidInternalRequest } = await import("@/lib/internal-api");
    const request = new Request("http://localhost/api/internal/pipeline/health");

    expect(isValidInternalRequest(request)).toBe(false);
    expect(isValidInternalRequest(request)).toBe(false);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith("INTERNAL_API_KEY is not configured");
  });

  it("rejects invalid key", async () => {
    process.env.INTERNAL_API_KEY = "secret";
    const { isValidInternalRequest } = await import("@/lib/internal-api");
    const request = new Request("http://localhost/api/internal/pipeline/health", { headers: { "X-Internal-Key": "wrong" } });

    expect(isValidInternalRequest(request)).toBe(false);
  });

  it("accepts matching key", async () => {
    process.env.INTERNAL_API_KEY = "secret";
    const { isValidInternalRequest } = await import("@/lib/internal-api");
    const request = new Request("http://localhost/api/internal/pipeline/health", { headers: { "X-Internal-Key": "secret" } });

    expect(isValidInternalRequest(request)).toBe(true);
  });
});
