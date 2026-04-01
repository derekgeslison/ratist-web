import { ImageResponse } from "next/og";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

const TMDB_KEY = process.env.TMDB_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const personId = searchParams.get("personId") ?? "";
  const personName = searchParams.get("name") ?? "Unknown";
  const movieCount = searchParams.get("count") ?? "0";
  const avgRating = searchParams.get("avg") ?? "";
  const userName = searchParams.get("userName") ?? "";

  try {
    const logoSrc = getLogoBase64();

    // Try to get person image from TMDB
    let personImgSrc: string | null = null;
    if (personId && TMDB_KEY) {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_KEY}`);
        if (res.ok) {
          const data = await res.json();
          if (data.profile_path) personImgSrc = `https://image.tmdb.org/t/p/w185${data.profile_path}`;
        }
      } catch { /* skip */ }
    }

    const avg = avgRating ? parseFloat(avgRating) : null;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40, alignItems: "center" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
          </div>

          <span style={{ color: "#555", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 24 }}>
            What Else Do I Know Them From?
          </span>

          {/* Person */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
            {personImgSrc ? (
              <img src={personImgSrc} width={80} height={80} style={{ borderRadius: 40, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", width: 80, height: 80, borderRadius: 40, backgroundColor: "#ef3b36", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontSize: 32, fontWeight: 900 }}>{personName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "white", fontSize: 28, fontWeight: 800 }}>{personName}</span>
              {userName && <span style={{ color: "#888", fontSize: 14 }}>{userName}&apos;s watchlist overlap</span>}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "16px 28px" }}>
              <span style={{ color: "white", fontSize: 36, fontWeight: 900 }}>{movieCount}</span>
              <span style={{ color: "#666", fontSize: 13 }}>Movies Seen</span>
            </div>
            {avg != null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 12, padding: "16px 28px" }}>
                <span style={{ color: scoreHex(avg), fontSize: 36, fontWeight: 900 }}>{avg.toFixed(1)}</span>
                <span style={{ color: "#666", fontSize: 13 }}>Avg Rating</span>
              </div>
            )}
          </div>

          <span style={{ color: "#333", fontSize: 13 }}>theratist.com</span>
        </div>
      ),
      { width: 700, height: 420 }
    );
  } catch (err) {
    console.error("OG actor-lookup error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
