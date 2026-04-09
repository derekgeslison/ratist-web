import { NextResponse } from "next/server";
import { getAllBadgeDefs, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/badges";

// GET: Return all badge definitions (public, no auth required)
export async function GET() {
  return NextResponse.json({
    badges: getAllBadgeDefs(),
    categories: CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
  });
}
