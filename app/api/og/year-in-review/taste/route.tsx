import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";
import { getYearInReview } from "@/lib/year-in-review/data";

export const dynamic = "force-dynamic";

/**
 * Chapter 3 — Your Taste. Cinephile type + category bars + top genres
 * + decade bars + a couple of clarifying metrics.
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

    const archetype = data.cinephile.archetype;
    const archetypeFontSize = archetype.length > 22 ? 28 : archetype.length > 16 ? 34 : 40;
    const maxDecade = Math.max(...data.decades.map((d) => d.count), 1);
    const totalGenres = data.topGenres.length;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#666", fontSize: 13 }}>theratist.com</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ef3b36", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>Chapter 3</span>
              <span style={{ color: "white", fontSize: 42, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>Your Taste in {year}</span>
            </div>
            <span style={{ color: "#aaa", fontSize: 14, fontWeight: 600 }}>{userRow.name}</span>
          </div>

          {/* Archetype banner */}
          <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#141414", borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 4 }}>Your Type</span>
            <span style={{ color: "white", fontSize: archetypeFontSize, fontWeight: 900, lineHeight: 1.05 }}>{archetype}</span>
            <span style={{ color: "#aaa", fontSize: 14, marginTop: 6 }}>{data.cinephile.tagline}</span>
          </div>

          {/* Bottom: 3 columns — category bars, top genres, decade bars */}
          <div style={{ display: "flex", gap: 12, flex: 1 }}>
            {/* Category bars */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1.3, backgroundColor: "#141414", borderRadius: 14, padding: 14 }}>
              <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>How you rated</span>
              {data.categoryAvgs.map(({ label, avg }) => {
                const isBest = data.bestCategory?.label === label;
                const isWorst = data.worstCategory?.label === label && data.bestCategory?.label !== label;
                const labelColor = isBest ? "#34d399" : isWorst ? "#f87171" : "#aaa";
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ color: labelColor, fontSize: 11, fontWeight: isBest || isWorst ? 700 : 500, width: 110 }}>{label}</span>
                    <div style={{ display: "flex", flex: 1, height: 7, backgroundColor: "#0a0a0a", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ display: "flex", width: `${(avg / 10) * 100}%`, height: "100%", backgroundColor: scoreHex(avg), borderRadius: 999 }} />
                    </div>
                    <span style={{ color: scoreHex(avg), fontSize: 11, fontWeight: 800, width: 26, textAlign: "right" }}>{avg.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>

            {/* Top Genres */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 14 }}>
              <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>Top Genres</span>
              {data.topGenres.slice(0, 5).map((g) => (
                <div key={g.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "white", fontSize: 13 }}>{g.name}</span>
                  <span style={{ color: "#888", fontSize: 13, fontWeight: 700 }}>{g.count}</span>
                </div>
              ))}
              {data.guiltyPleasure && (
                <div style={{ display: "flex", flexDirection: "column", marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2a2a" }}>
                  <span style={{ color: "#888", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Guilty Pleasure</span>
                  <span style={{ color: "#eab308", fontSize: 16, fontWeight: 900, marginTop: 2 }}>{data.guiltyPleasure.name}</span>
                  <span style={{ color: "#666", fontSize: 11 }}>You watch a lot · only rate it {data.guiltyPleasure.avg.toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* By Decade */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 14 }}>
              <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>By Decade</span>
              {data.decades.slice(0, 5).map(({ decade, count }) => (
                <div key={decade} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <span style={{ color: "#aaa", fontSize: 11, width: 42 }}>{decade}</span>
                  <div style={{ display: "flex", flex: 1, height: 6, backgroundColor: "#0a0a0a", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ display: "flex", width: `${(count / maxDecade) * 100}%`, height: "100%", backgroundColor: "#ef3b36", borderRadius: 999 }} />
                  </div>
                  <span style={{ color: "white", fontSize: 11, fontWeight: 700, width: 22, textAlign: "right" }}>{count}</span>
                </div>
              ))}
              {data.avgMovieAge != null && (
                <div style={{ display: "flex", flexDirection: "column", marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2a2a" }}>
                  <span style={{ color: "#888", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const }}>Avg Movie Age</span>
                  <span style={{ color: "white", fontSize: 18, fontWeight: 900, marginTop: 2 }}>{data.avgMovieAge} years old</span>
                  <span style={{ color: "#666", fontSize: 11 }}>across {totalGenres} genres</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("OG taste error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
