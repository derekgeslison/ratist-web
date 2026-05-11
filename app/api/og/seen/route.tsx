import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

/**
 * Film Diary share card.
 *
 * Visual hook: a year-of-the-page calendar heatmap (52-week × 7-day grid,
 * GitHub-contributions style) layered with a horizontal monthly bar chart
 * underneath. Together they tell two stories — daily watching cadence
 * and monthly totals — in one composite that's instantly recognizable
 * and visually unusual for a movie service.
 *
 * Scope: ALL watch entries for the user (UserFavoriteMovie + EpisodeSeen)
 * with a watchedDate. Stats are filtered to the current calendar year
 * since the heatmap is a year view; total counts (top-line) span the
 * full diary.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId") ?? "";
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  try {
    const logoSrc = getLogoBase64();
    const userRow = await prisma.user.findFirst({
      where: { OR: [{ id: userIdParam }, { firebaseUid: userIdParam }] },
      select: { id: true, name: true },
    });
    if (!userRow) return new Response("Not found", { status: 404 });

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [movies, episodes, totalMovies, totalEpisodes, ratings] = await Promise.all([
      prisma.userFavoriteMovie.findMany({
        where: { userId: userRow.id, watchedDate: { gte: yearStart, lt: yearEnd } },
        select: { watchedDate: true },
      }),
      prisma.episodeSeen.findMany({
        where: { userId: userRow.id, watchedDate: { gte: yearStart, lt: yearEnd } },
        select: { watchedDate: true },
      }),
      prisma.userFavoriteMovie.count({ where: { userId: userRow.id } }),
      prisma.episodeSeen.count({ where: { userId: userRow.id } }),
      prisma.movieRating.findMany({
        where: {
          userId: userRow.id,
          ratistRating: { not: null },
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        select: { ratistRating: true },
      }),
    ]);

    // Build per-day count map and per-month totals for the year.
    const dayCounts = new Map<string, number>(); // "YYYY-MM-DD" → count
    const monthCounts = new Array(12).fill(0);
    function add(d: Date | null) {
      if (!d) return;
      const iso = d.toISOString().slice(0, 10);
      dayCounts.set(iso, (dayCounts.get(iso) ?? 0) + 1);
      monthCounts[d.getUTCMonth()]++;
    }
    for (const m of movies) add(m.watchedDate);
    for (const e of episodes) add(e.watchedDate);

    const yearMovieCount = movies.length;
    const yearEpisodeCount = episodes.length;
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + (r.ratistRating ?? 0), 0) / ratings.length) * 10) / 10
      : null;

    // ── Heatmap grid build ───────────────────────────────────────
    // 53 columns × 7 rows. Every grid cell renders, including the
    // pre-Jan-1 and post-Dec-31 positions — those get the empty-day
    // gray. Filling the whole rectangle removes the visual "offset"
    // you'd otherwise see when Jan 1 doesn't fall on Sunday.
    const COLS = 53;
    const ROWS = 7;
    const cellSize = 12;
    const cellGap = 3;

    const jan1 = new Date(Date.UTC(year, 0, 1));
    const startDayOfWeek = jan1.getUTCDay(); // 0 = Sun
    const cells: { row: number; col: number; count: number; inYear: boolean }[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const offset = col * 7 + row - startDayOfWeek;
        if (offset < 0) {
          cells.push({ row, col, count: 0, inYear: false });
          continue;
        }
        const d = new Date(jan1.getTime() + offset * dayMs);
        if (d.getUTCFullYear() !== year) {
          cells.push({ row, col, count: 0, inYear: false });
          continue;
        }
        const iso = d.toISOString().slice(0, 10);
        cells.push({ row, col, count: dayCounts.get(iso) ?? 0, inYear: true });
      }
    }

    // Intensity buckets for cell colors. Out-of-year + in-year-empty
    // both use the same gray so the rectangle reads as a single block.
    const maxDay = Math.max(...[...dayCounts.values(), 0], 1);
    function cellColor(count: number): string {
      if (count === 0) return "#1f1f1f";
      const intensity = count / maxDay;
      if (intensity < 0.25) return "#7f0d20";
      if (intensity < 0.5) return "#b3132e";
      if (intensity < 0.75) return "#d91a3c";
      return "#ef3b36";
    }

    // Day-of-week labels on the left (Mon / Wed / Fri — GitHub convention).
    const dowLabelRows = [1, 3, 5];
    const dowLabels: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };
    const heatmapLeftPad = 32;

    const monthAbbr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthMax = Math.max(...monthCounts, 1);

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#666", fontSize: 13 }}>theratist.com</span>
          </div>

          {/* Title row */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ef3b36", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>Film Diary · {year}</span>
              <span style={{ color: "white", fontSize: 38, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>{userRow.name}&apos;s watching year</span>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <Stat value={yearMovieCount} label="Movies" />
              <Stat value={yearEpisodeCount} label="Episodes" />
              {avgRating != null && (
                <Stat value={avgRating.toFixed(1)} label="Avg" color={scoreHex(avgRating)} />
              )}
            </div>
          </div>

          {/* Heatmap */}
          <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#141414", borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>
                Watching activity · {year}
              </span>
              <span style={{ color: "#555", fontSize: 11 }}>
                1 cell = 1 day · brighter = more watched
              </span>
            </div>
            <div style={{ display: "flex", position: "relative", height: ROWS * cellSize + (ROWS - 1) * cellGap }}>
              {/* Day-of-week labels */}
              {dowLabelRows.map((row) => (
                <span
                  key={`dow-${row}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: row * (cellSize + cellGap),
                    width: heatmapLeftPad - 4,
                    height: cellSize,
                    color: "#555",
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: `${cellSize}px`,
                  }}
                >
                  {dowLabels[row]}
                </span>
              ))}
              {cells.map((cell, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: heatmapLeftPad + cell.col * (cellSize + cellGap),
                    top: cell.row * (cellSize + cellGap),
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 2,
                    backgroundColor: cellColor(cell.count),
                  }}
                />
              ))}
            </div>
          </div>

          {/* Monthly bar chart */}
          <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#141414", borderRadius: 14, padding: 18, flex: 1 }}>
            <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>
              By month
            </span>
            <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 6 }}>
              {monthCounts.map((count, i) => {
                // Cap bar at 80% of cell height so the count label above
                // never gets clipped by the tallest bar in the chart.
                const h = (count / monthMax) * 80;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <span style={{ color: count > 0 ? "#fff" : "#555", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>
                      {count > 0 ? count : ""}
                    </span>
                    <div style={{ display: "flex", width: "100%", height: `${Math.max(h, 4)}%`, backgroundColor: count > 0 ? "#ef3b36" : "#1f1f1f", borderRadius: 4 }} />
                    <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, marginTop: 4 }}>
                      {monthAbbr[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer line — total counts to anchor "this is more than just one year" */}
          {(totalMovies > yearMovieCount || totalEpisodes > yearEpisodeCount) && (
            <p style={{ display: "flex", justifyContent: "center", color: "#555", fontSize: 12, marginTop: 12 }}>
              All-time: {totalMovies} movies · {totalEpisodes} episodes
            </p>
          )}
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("OG seen error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "10px 18px", minWidth: 90 }}>
      <span style={{ color: color ?? "white", fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{value}</span>
      <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 6 }}>{label}</span>
    </div>
  );
}
