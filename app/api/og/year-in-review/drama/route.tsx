import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";
import { getYearInReview } from "@/lib/year-in-review/data";

export const dynamic = "force-dynamic";

/**
 * Chapter 5 — The Drama. Top-left: most-controversial poster + scores.
 * Top-right: per-movie 5 category bars (user's scores when present,
 * falls back to community averages for the same title when the user
 * only did a quick rating). Bottom: vs-last-year deltas.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId") ?? "";
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString(), 10);

  try {
    const logoSrc = getLogoBase64();
    const userRow = await prisma.user.findFirst({
      where: { OR: [{ id: userIdParam }, { firebaseUid: userIdParam }] },
      select: { id: true, name: true },
    });
    if (!userRow) return new Response("Not found", { status: 404 });

    const data = await getYearInReview(userRow.id, year);
    if (!data) return new Response("No data", { status: 404 });

    const c = data.controversial;
    const v = data.vsLastYear;
    const cc = data.controversialCategories;
    const cposter = c?.posterPath ? `https://image.tmdb.org/t/p/w342${c.posterPath}` : null;

    function fmt(n: number | null, decimal = false): { value: string; color: string } {
      if (n == null) return { value: "—", color: "#666" };
      const formatted = decimal ? Math.abs(n).toFixed(1) : Math.abs(n).toString();
      const sign = n > 0 ? "+" : n < 0 ? "−" : "";
      const color = n > 0 ? "#22c55e" : n < 0 ? "#ef4444" : "#aaa";
      return { value: `${sign}${formatted}`, color };
    }

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 36 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#666", fontSize: 13 }}>theratist.com</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>Chapter 5</span>
              <span style={{ color: "white", fontSize: 38, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>Where You Stood</span>
            </div>
            <span style={{ color: "#aaa", fontSize: 14, fontWeight: 600 }}>{userRow.name} · {year}</span>
          </div>

          {/* TOP ROW: Controversial poster+scores (left) + per-movie bars (right).
              flex: 2 so this row gets ~2/3 of the body, bottom gets ~1/3. */}
          <div style={{ display: "flex", gap: 13, marginBottom: 13, flex: 2 }}>
            {/* LEFT */}
            {c && (
              <div style={{ display: "flex", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 16, gap: 14, border: "1px solid rgba(251, 191, 36, 0.3)" }}>
                {cposter && <img src={cposter} width={123} height={184} style={{ borderRadius: 10 }} />}
                <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
                  <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 3 }}>Most Controversial</span>
                  <span style={{ color: "white", fontSize: 22, fontWeight: 900, lineHeight: 1.1, marginBottom: 11 }}>
                    {c.title.length > 23 ? c.title.slice(0, 23) + "…" : c.title}
                  </span>
                  <div style={{ display: "flex", gap: 10, marginBottom: 9 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                      <span style={{ color: "#888", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Community</span>
                      <span style={{ color: scoreHex(c.communityAvg), fontSize: 37, fontWeight: 900, lineHeight: 1, marginTop: 3 }}>{c.communityAvg.toFixed(1)}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                      <span style={{ color: "#888", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>You</span>
                      <span style={{ color: scoreHex(c.userRating), fontSize: 37, fontWeight: 900, lineHeight: 1, marginTop: 3 }}>{c.userRating.toFixed(1)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, paddingTop: 8, borderTop: "1px solid #222" }}>
                    <span style={{ color: "#888", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Off by</span>
                    <span style={{ color: "#fbbf24", fontSize: 25, fontWeight: 900, lineHeight: 1 }}>{c.diff.toFixed(1)} pts</span>
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT — per-movie category bars */}
            {cc && cc.scores.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 16, justifyContent: "center" }}>
                <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>
                  {cc.isUserScored ? "Your Scores for This Title" : "Community Averages for This Title"}
                </span>
                {!cc.isUserScored && (
                  <span style={{ color: "#666", fontSize: 11, fontStyle: "italic", marginBottom: 6 }}>You did a quick rating — community averages shown.</span>
                )}
                {cc.scores.map(({ label, avg }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ color: "#aaa", fontSize: 12, width: 130 }}>{label}</span>
                    <div style={{ display: "flex", flex: 1, height: 8, backgroundColor: "#0a0a0a", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ display: "flex", width: `${(avg / 10) * 100}%`, height: "100%", backgroundColor: scoreHex(avg), borderRadius: 999 }} />
                    </div>
                    <span style={{ color: scoreHex(avg), fontSize: 13, fontWeight: 800, width: 28, textAlign: "right" }}>{avg.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 16, alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#666", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>No category breakdown available.</span>
              </div>
            )}
          </div>

          {/* BOTTOM: vs-last-year deltas — flex: 1 (so ~1/3 of body). */}
          {v && (
            <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#141414", borderRadius: 14, padding: 16, flex: 1 }}>
              <span style={{ color: "#888", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>
                How {year} compares to {v.year}
              </span>
              <div style={{ display: "flex", gap: 10, flex: 1 }}>
                {[
                  { label: "Movies", ...fmt(v.movieDelta) },
                  { label: "Shows", ...fmt(v.showDelta) },
                  { label: "Hours", ...fmt(v.hoursDelta) },
                  { label: "Avg Rating", ...fmt(v.avgRatingDelta, true) },
                ].map((cell) => (
                  <div key={cell.label} style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#0a0a0a", borderRadius: 10, padding: "10px 6px", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: cell.color, fontSize: 40, fontWeight: 900, lineHeight: 1 }}>{cell.value}</span>
                    <span style={{ color: "#888", fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, marginTop: 8 }}>{cell.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("OG drama error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
