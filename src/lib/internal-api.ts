export function isValidInternalRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false;
  return request.headers.get("X-Internal-Key") === expected;
}

export function unauthorizedInternalResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
