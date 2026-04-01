import { ImageResponse } from "next/og";
import { getLogoBase64 } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "movies-to-people";
  const names = searchParams.get("names") ?? "";
  const count = searchParams.get("count") ?? "0";

  try {
    const logoSrc = getLogoBase64();
    const nameList = names.split("|").filter(Boolean);
    const isMovieMode = mode === "movies-to-people";

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40, alignItems: "center" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
            <span style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>THE RATIST</span>
          </div>

          <span style={{ color: "#555", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 28 }}>
            Shared Cast &amp; Crew
          </span>

          {/* Selected items */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 24, maxWidth: 500 }}>
            {nameList.map((name, i) => (
              <div key={i} style={{ display: "flex", backgroundColor: "#1a1a1a", borderRadius: 8, padding: "6px 14px" }}>
                <span style={{ color: "#ccc", fontSize: 15, fontWeight: 600 }}>{name}</span>
              </div>
            ))}
          </div>

          {/* Result count */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#141414", borderRadius: 16, padding: "20px 36px", marginBottom: 20 }}>
            <span style={{ color: "#ef3b36", fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{count}</span>
            <span style={{ color: "#888", fontSize: 14, marginTop: 6 }}>
              {isMovieMode
                ? `shared cast & crew member${count !== "1" ? "s" : ""}`
                : `shared movie${count !== "1" ? "s" : ""}`
              }
            </span>
          </div>

          <span style={{ color: "#555", fontSize: 14 }}>
            {isMovieMode ? "across these films" : "featuring these people"}
          </span>

          <div style={{ display: "flex", marginTop: "auto" }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com</span>
          </div>
        </div>
      ),
      { width: 700, height: 420 }
    );
  } catch (err) {
    console.error("OG shared-cast error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
