/**
 * @jest-environment node
 */
import { rateLimit } from "@/lib/cache";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

jest.mock("@/lib/cache", () => ({
  rateLimit: jest.fn(),
}));

const mockedRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;

describe("enforcePublicApiRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("allows requests and returns rate-limit headers", async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 119, reset: 1777344000000 });

    const result = await enforcePublicApiRateLimit(
      new Request("https://example.com/api/v1/projects", {
        headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
      })
    );

    expect(mockedRateLimit).toHaveBeenCalledWith("public-api:203.0.113.10", 120, 60);
    expect(result.response).toBeNull();
    expect(result.headers).toEqual({
      "X-RateLimit-Limit": "120",
      "X-RateLimit-Remaining": "119",
      "X-RateLimit-Reset": "1777344000",
    });
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 10, reset: 1777344000000 });

    await enforcePublicApiRateLimit(
      new Request("https://example.com/api/v1/categories", {
        headers: { "x-real-ip": "198.51.100.20" },
      }),
      { limit: 20, windowSeconds: 30 }
    );

    expect(mockedRateLimit).toHaveBeenCalledWith("public-api:198.51.100.20", 20, 30);
  });

  it("uses unknown identifier when no client IP headers exist", async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 10, reset: 1777344000000 });

    await enforcePublicApiRateLimit(new Request("https://example.com/api/v1/regions"));

    expect(mockedRateLimit).toHaveBeenCalledWith("public-api:unknown", 120, 60);
  });

  it("returns 429 response with Retry-After and X-RateLimit headers when blocked", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1777343990000);
    mockedRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 1777344000000 });

    const result = await enforcePublicApiRateLimit(new Request("https://example.com/api/v1/projects"));

    expect(result.response).not.toBeNull();
    expect(result.headers).toEqual({
      "X-RateLimit-Limit": "120",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "1777344000",
    });
    expect(result.response!.status).toBe(429);
    expect(result.response!.headers.get("Retry-After")).toBe("10");
    expect(result.response!.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(result.response!.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(result.response!.headers.get("X-RateLimit-Reset")).toBe("1777344000");
    await expect(result.response!.json()).resolves.toEqual({
      error: "Too many requests",
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      retryAfter: 10,
    });
  });
});
