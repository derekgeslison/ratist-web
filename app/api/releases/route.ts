import { NextRequest, NextResponse } from "next/server";
import { getReleases } from "@/lib/releases";

export const dynamic = "force-dynamic";

const HORIZON_TO_DAYS: Record<string, number> = {
  "30": 30,
  "90": 90,
  "180": 180,
};

const RELEASE_TYPE_MAP: Record<string, number[]> = {
  all: [2, 3, 4],
  theatrical: [2, 3],
  digital: [4],
};

/**
 * GET /api/releases
 *
 * Backs the /releases client-side filter UI. Same filter shape as
 * `getReleases` plus a couple of UX-friendly aliases:
 *   - horizon=30|90|180  → fromDate/toDate based on today + N days
 *   - type=all|theatrical|digital  → release_type ids
 *
 * The source of truth for filter parsing lives here so the client
 * doesn't have to keep parallel logic in sync with the helper's
 * field shape — it just URL-encodes its UI state.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const horizon = sp.get("horizon") ?? "90";
  const days = HORIZON_TO_DAYS[horizon] ?? 90;
  const fromDate = new Date().toISOString().slice(0, 10);
  const toDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const region = sp.get("region") ?? "US";
  const releaseTypes = RELEASE_TYPE_MAP[sp.get("type") ?? "all"] ?? RELEASE_TYPE_MAP.all;
  const genres = (sp.get("genres") ?? "").split(",")
    .map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n));
  const certifications = (sp.get("mpa") ?? "").split(",").filter(Boolean);

  try {
    const data = await getReleases({
      fromDate,
      toDate,
      region,
      releaseTypes,
      genres: genres.length > 0 ? genres : undefined,
      certifications: certifications.length > 0 ? certifications : undefined,
      sortBy: "primary_release_date.asc",
    });
    return NextResponse.json({
      results: data.results,
      total_results: data.total_results,
    });
  } catch (err) {
    console.error("Releases API error:", err);
    return NextResponse.json({ results: [], total_results: 0 });
  }
}
