import { NextResponse } from "next/server";
import { listPublicRegions } from "@/lib/projects/public-service";

export async function GET() {
  const regions = await listPublicRegions();

  return NextResponse.json({
    regions: regions.map((item) => ({ value: item.region, count: item._count })),
  });
}
