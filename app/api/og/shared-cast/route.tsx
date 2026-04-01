import { ImageResponse } from "next/og";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

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
  const avgRating = searchParams.get("avg") ?? "";

  try {
    const logoSrc = getLogoBase64();
    const nameList = names.split("|").filter(Boolean);
    const idList = ids.split(",").filter(Boolean);
    const isPeopleMode = mode === "people-to-movies";
    const overlapNum = parseInt(overlap);
    const totalNum = parseInt(total);
    const hasPartialOverlap = !isNaN(overlapNum) && !isNaN(totalNum) && overlapNum < totalNum;
    const avg = avgRating ? parseFloat(avgRating) : null;
    const MAX_IMAGES = 6;

    // Fetch images from TMDB
    const images: (string | null)[] = [];
    if (TMDB_KEY) {
      for (const id of idList.slice(0, MAX_IMAGES)) {
        try {
          const endpoint = isPeopleMode
            ? `https://api.themoviedb.org/3/person/${id}?api_key=${TMDB_KEY}`
            : `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            const path = isPeopleMode ? data.profile_path : data.poster_path;
            images.push(path ? `https://image.tmdb.org/t/p/w185${path}` : null);
          } else images.push(null);
        } catch { images.push(null); }
      }
    }

    const overflow = idList.length > MAX_IMAGES ? idList.length - MAX_IMAGES : 0;
    const resultLabel = isPeopleMode
      ? `shared movie${count !== "1" ? "s" : ""}`
      : `shared cast & crew`;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 36, alignItems: "center" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <img src={logoSrc} width={28} height={28} style={{ borderRadius: 5 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>THE RATIST</span>
            <span style={{ color: "#555", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" as const, marginLeft: 8 }}>Shared Cast &amp; Crew</span>
          </div>

          {/* Images row */}
          {images.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: isPeopleMode ? 10 : 8, marginBottom: 16 }}>
              {images.map((img, i) => (
                isPeopleMode ? (
                  // Circular for people
                  img ? (
                    <img key={i} src={img} width={56} height={56} style={{ borderRadius: 28, objectFit: "cover" }} />
                  ) : (
                    <div key={i} style={{ display: "flex", width: 56, height: 56, borderRadius: 28, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "white", fontSize: 22, fontWeight: 900 }}>{nameList[i]?.[0]?.toUpperCase() ?? "?"}</span>
                    </div>
                  )
                ) : (
                  // Rectangular for movies
                  img ? (
                    <img key={i} src={img} width={48} height={72} style={{ borderRadius: 6, objectFit: "cover" }} />
                  ) : (
                    <div key={i} style={{ display: "flex", width: 48, height: 72, borderRadius: 6, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#555", fontSize: 14 }}>?</span>
                    </div>
                  )
                )
              ))}
              {overflow > 0 && (
                <div style={{ display: "flex", width: isPeopleMode ? 56 : 48, height: isPeopleMode ? 56 : 72, borderRadius: isPeopleMode ? 28 : 6, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#888", fontSize: 16, fontWeight: 700 }}>+{overflow}</span>
                </div>
              )}
            </div>
          )}

          {/* Names */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5, marginBottom: 16, maxWidth: 580 }}>
            {nameList.map((name, i) => (
              <div key={i} style={{ display: "flex", backgroundColor: "#1a1a1a", borderRadius: 6, padding: "4px 10px" }}>
                <span style={{ color: "#ccc", fontSize: 13, fontWeight: 600 }}>{name}</span>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "14px 28px" }}>
              <span style={{ color: "#ef3b36", fontSize: 38, fontWeight: 900, lineHeight: 1 }}>{count}</span>
              <span style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{resultLabel}</span>
            </div>
            {avg != null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "14px 28px" }}>
                <span style={{ color: scoreHex(avg), fontSize: 38, fontWeight: 900, lineHeight: 1 }}>{avg.toFixed(1)}</span>
                <span style={{ color: "#888", fontSize: 12, marginTop: 4 }}>avg rating</span>
              </div>
            )}
          </div>

          {hasPartialOverlap && (
            <span style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>
              {isPeopleMode ? "featuring" : "appearing in"} at least {overlapNum} of {totalNum} selections
            </span>
          )}

          <div style={{ display: "flex", marginTop: "auto" }}>
            <span style={{ color: "#333", fontSize: 12 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 700, height: 480 }
    );
  } catch (err) {
    console.error("OG shared-cast error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
