import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { computeAccuracyReport } from "@/lib/prediction-accuracy";

export const dynamic = "force-dynamic";
// Leave-one-out across every rating can take a while as data grows.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { isAdmin: true } });
  if (!dbUser?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const report = await computeAccuracyReport();
  // Trim the heavy fields off the worst-N table response so the JSON
  // payload doesn't carry every sample to the client. The dashboard only
  // needs aggregates + the top 25 worst predictions for the diagnostic
  // table.
  const worst = [...report.samples].sort((a, b) => b.absError - a.absError).slice(0, 25);
  return NextResponse.json({
    totalRatings: report.totalRatings,
    evaluable: report.samples.length,
    unevaluable: report.unevaluable,
    mae: report.mae,
    pctWithinHalf: report.pctWithinHalf,
    pctWithinOne: report.pctWithinOne,
    histogram: report.histogram,
    monthly: report.monthly,
    worst: worst.map((s) => ({
      ratingId: s.ratingId,
      mediaType: s.mediaType,
      tmdbId: s.tmdbId,
      title: s.title,
      predicted: s.predicted,
      actual: s.actual,
      absError: s.absError,
      createdAt: s.createdAt,
    })),
  });
}
