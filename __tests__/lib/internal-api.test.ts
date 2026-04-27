import { Request } from "node-fetch";
import { isValidInternalRequest } from "@/lib/internal-api";

describe("internal API auth", () => {
  const original = process.env.INTERNAL_API_KEY;

  afterEach(() => {
    process.env.INTERNAL_API_KEY = original;
  });

  it("rejects missing configured key", () => {
    process.env.INTERNAL_API_KEY = "secret";
    const request = new Request("http://localhost/api/internal/pipeline/health");

    expect(isValidInternalRequest(request)).toBe(false);
  });

  it("rejects invalid key", () => {
    process.env.INTERNAL_API_KEY = "secret";
    const request = new Request("http://localhost/api/internal/pipeline/health", { headers: { "X-Internal-Key": "wrong" } });

    expect(isValidInternalRequest(request)).toBe(false);
  });

  it("accepts matching key", () => {
    process.env.INTERNAL_API_KEY = "secret";
    const request = new Request("http://localhost/api/internal/pipeline/health", { headers: { "X-Internal-Key": "secret" } });

    expect(isValidInternalRequest(request)).toBe(true);
  });
});
