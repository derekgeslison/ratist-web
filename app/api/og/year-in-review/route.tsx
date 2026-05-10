import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";
import { getYearInReview } from "@/lib/year-in-review/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId") ?? "";
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString(), 10);

  try {
    const logoSrc = getLogoBase64();
    const userRow = await prisma.user.findFirst({
      where: { OR: [{ id: userIdParam }, { firebaseUid: userIdParam }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!userRow) return new Response("Not found", { status: 404 });

    const data = await getYearInReview(userRow.id, year);
    if (!data) return new Response("No data", { status: 404 });

    const archetype = data.cinephile.archetype;
    const archetypeFontSize = archetype.length > 24 ? 56 : archetype.length > 18 ? 68 : 80;

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex", flexDirection: "column", width: "100%", height: "100%",
            backgroundColor: "#0a0a0a",
            backgroundImage: "radial-gradient(ellipse at top, rgba(239, 59, 54, 0.25) 0%, rgba(10, 10, 10, 0) 60%)",
            padding: 40,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#aaa", fontSize: 16, fontWeight: 600 }}>{userRow.name}</span>
          </div>

          {/* Year + IN FILM */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 18, marginBottom: 4 }}>
            <span style={{ color: "#ef3b36", fontSize: 22, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase" as const }}>In Film</span>
            <span style={{ color: "white", fontSize: 80, fontWeight: 900, lineHeight: 1, letterSpacing: -3 }}>{year}</span>
          </div>

          {/* Archetype + tagline as the hook */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24, paddingLeft: 30, paddingRight: 30 }}>
            <span style={{ color: "#888", fontSize: 16, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase" as const, marginBottom: 8 }}>You Were</span>
            <span style={{ color: "white", fontSize: archetypeFontSize, fontWeight: 900, lineHeight: 1.02, textAlign: "center", letterSpacing: -1.5 }}>{archetype}</span>
            <span style={{ color: "#bbb", fontSize: 24, lineHeight: 1.3, textAlign: "center", marginTop: 14, maxWidth: 980 }}>{data.cinephile.tagline}</span>
          </div>

          {/* Headline stats */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 16 }}>
            <StatTile value={data.movieCount} label="Movies" />
            <StatTile value={data.showCount} label={data.showCount === 1 ? "Show" : "Shows"} />
            <StatTile value={data.totalHours} label="Hours" />
            {data.avgRating != null && (
              <StatTile value={data.avgRating.toFixed(1)} label="Avg Rating" color={scoreHex(data.avgRating)} />
            )}
          </div>

          {/* Pills row */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            {data.topGenres[0] && (
              <Pill color="#eab308" text={`Top genre: ${data.topGenres[0].name}`} />
            )}
            {data.busiestMonth && (
              <Pill color="#ccc" text={`Busiest: ${data.busiestMonth.name}`} />
            )}
            {data.episodeCount > 0 && (
              <Pill color="#ccc" text={`${data.episodeCount} episodes`} />
            )}
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("OG year-in-review cover error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function StatTile({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 14, padding: "16px 28px", minWidth: 130 }}>
      <span style={{ color: color ?? "white", fontSize: 52, fontWeight: 900, lineHeight: 1 }}>{value}</span>
      <span style={{ color: "#888", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 8 }}>{label}</span>
    </div>
  );
}

function Pill({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ color, fontSize: 16, backgroundColor: "#141414", borderRadius: 999, padding: "8px 18px", fontWeight: 600 }}>{text}</span>
  );
}
