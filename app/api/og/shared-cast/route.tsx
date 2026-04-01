import { ImageResponse } from "next/og";
import { getLogoBase64 } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const TMDB_KEY = process.env.TMDB_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "movies-to-people";
  const names = searchParams.get("names") ?? "";
  const ids = searchParams.get("ids") ?? "";
  const count = searchParams.get("count") ?? "0";
  const overlap = searchParams.get("overlap") ?? "";
  const total = searchParams.get("total") ?? "";

  try {
    const logoSrc = getLogoBase64();
    const nameList = names.split("|").filter(Boolean);
    const idList = ids.split(",").filter(Boolean);
    const isPeopleMode = mode === "people-to-movies";
    const overlapNum = parseInt(overlap);
    const totalNum = parseInt(total);
    const hasPartialOverlap = !isNaN(overlapNum) && !isNaN(totalNum) && overlapNum < totalNum;

    // For people-to-movies, try to get person images from TMDB
    const personImages: (string | null)[] = [];
    if (isPeopleMode && TMDB_KEY) {
      for (const id of idList.slice(0, 4)) {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/person/${id}?api_key=${TMDB_KEY}`);
          if (res.ok) {
            const data = await res.json();
            personImages.push(data.profile_path ? `https://image.tmdb.org/t/p/w185${data.profile_path}` : null);
          } else personImages.push(null);
        } catch { personImages.push(null); }
      }
    }

    const resultLabel = isPeopleMode
      ? `shared movie${count !== "1" ? "s" : ""}`
      : `shared cast & crew`;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40, alignItems: "center" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
          </div>

          <span style={{ color: "#555", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 24 }}>
            Shared Cast &amp; Crew
          </span>

          {/* People images (for people-to-movies mode) */}
          {isPeopleMode && personImages.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {personImages.map((img, i) => (
                img ? (
                  <img key={i} src={img} width={64} height={64} style={{ borderRadius: 32, objectFit: "cover" }} />
                ) : (
                  <div key={i} style={{ display: "flex", width: 64, height: 64, borderRadius: 32, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "white", fontSize: 24, fontWeight: 900 }}>{nameList[i]?.[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Names */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 20, maxWidth: 550 }}>
            {nameList.map((name, i) => (
              <div key={i} style={{ display: "flex", backgroundColor: "#1a1a1a", borderRadius: 8, padding: "5px 12px" }}>
                <span style={{ color: "#ccc", fontSize: 14, fontWeight: 600 }}>{name}</span>
              </div>
            ))}
          </div>

          {/* Result count */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 16, padding: "18px 36px", marginBottom: 12 }}>
            <span style={{ color: "#ef3b36", fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{count}</span>
            <span style={{ color: "#888", fontSize: 13, marginTop: 6 }}>{resultLabel}</span>
          </div>

          {hasPartialOverlap && (
            <span style={{ color: "#666", fontSize: 12 }}>
              appearing in at least {overlapNum} of {totalNum} selections
            </span>
          )}

          <div style={{ display: "flex", marginTop: "auto" }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 700, height: isPeopleMode && personImages.length > 0 ? 480 : 420 }
    );
  } catch (err) {
    console.error("OG shared-cast error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
