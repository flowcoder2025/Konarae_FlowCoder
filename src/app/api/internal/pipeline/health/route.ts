import { NextResponse } from "next/server";
import { isValidInternalRequest, unauthorizedInternalResponse } from "@/lib/internal-api";

export async function GET(request: Request) {
  if (!isValidInternalRequest(request)) return unauthorizedInternalResponse();

  return NextResponse.json({ ok: true, service: "flowmate-internal", checkedAt: new Date().toISOString() });
}
