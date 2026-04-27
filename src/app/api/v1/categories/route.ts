import { NextResponse } from "next/server";
import { listPublicCategories } from "@/lib/projects/public-service";

export async function GET() {
  const categories = await listPublicCategories();

  return NextResponse.json({
    categories: categories.map((item) => ({ value: item.category, count: item._count })),
  });
}
