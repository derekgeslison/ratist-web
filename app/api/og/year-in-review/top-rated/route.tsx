import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";
import { getYearInReview } from "@/lib/year-in-review/data";

export const dynamic = "force-dynamic";

/**
 * Chapter 2 share card. "Standouts" framing since the card holds
 * top-rated + hidden gem + the disappointing watch — the full range
 * of memorable picks from the year, not just the highest-rated.
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
    if (!data || data.topPicks.length === 0) return new Response("No data", { status: 404 });

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header with site domain on the right */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#666", fontSize: 13 }}>theratist.com</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ef3b36", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>Chapter 2</span>
              <span style={{ color: "white", fontSize: 42, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>My {year} Standouts</span>
            </div>
            <span style={{ color: "#aaa", fontSize: 14, fontWeight: 600 }}>{userRow.name}</span>
          </div>

          {/* Posters row — smaller so sub-insights have breathing room */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {data.topPicks.map((p, i) => {
              const url = p.posterPath ? `https://image.tmdb.org/t/p/w342${p.posterPath}` : null;
              return (
                <div key={`${p.mediaType}-${p.tmdbId}`} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center" }}>
                  {url
                    ? <img src={url} width={140} height={210} style={{ borderRadius: 8 }} />
                    : <div style={{ display: "flex", width: 140, height: 210, backgroundColor: "#222", borderRadius: 8 }} />}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 6 }}>
                    <span style={{ color: "#666", fontSize: 12, fontWeight: 700 }}>#{i + 1}</span>
                    <span style={{ color: scoreHex(p.rating), fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{p.rating.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hidden Gem + Disappointed — with room to breathe now */}
          <div style={{ display: "flex", gap: 14, flex: 1 }}>
            <SubInsight
              tone="emerald"
              label="Hidden Gem"
              title={data.hiddenGem?.title ?? null}
              score={data.hiddenGem?.userRating ?? null}
              sublabel={data.hiddenGem ? `Only ${data.hiddenGem.communityCount} community review${data.hiddenGem.communityCount === 1 ? "" : "s"}` : "No clear hidden gem"}
              posterPath={data.hiddenGem?.posterPath ?? null}
            />
            <SubInsight
              tone="muted"
              label="One That Disappointed"
              title={data.disappointed?.title ?? null}
              score={data.disappointed?.rating ?? null}
              sublabel={data.disappointed ? `You gave it ${data.disappointed.rating.toFixed(1)}` : "No disappointments"}
              posterPath={data.disappointed?.posterPath ?? null}
            />
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("OG top-rated error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function SubInsight({ tone, label, title, score, sublabel, posterPath }: {
  tone: "emerald" | "muted";
  label: string;
  title: string | null;
  score: number | null;
  sublabel: string;
  posterPath: string | null;
}) {
  const accent = tone === "emerald" ? "#34d399" : "#888";
  const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w185${posterPath}` : null;
  return (
    <div style={{ display: "flex", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 16, alignItems: "center", gap: 14, border: `1px solid ${tone === "emerald" ? "rgba(52, 211, 153, 0.3)" : "#222"}` }}>
      {posterUrl
        ? <img src={posterUrl} width={70} height={105} style={{ borderRadius: 8 }} />
        : <div style={{ display: "flex", width: 70, height: 105, backgroundColor: "#222", borderRadius: 8 }} />}
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <span style={{ color: accent, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</span>
        <span style={{ color: "white", fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>
          {title ? (title.length > 28 ? title.slice(0, 28) + "…" : title) : "—"}
        </span>
        <span style={{ color: "#888", fontSize: 13, marginTop: 4 }}>{sublabel}</span>
        {score != null && (
          <span style={{ color: scoreHexLocal(score), fontSize: 24, fontWeight: 900, marginTop: 2 }}>{score.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

function scoreHexLocal(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#eab308";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}
