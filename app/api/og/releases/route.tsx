import { ImageResponse } from "next/og";
import { getLogoBase64 } from "@/lib/og-helpers";
import { getReleases } from "@/lib/releases";

export const dynamic = "force-dynamic";

/**
 * GET /api/og/releases
 *
 * OG image for /releases. Renders the top 5 most-anticipated
 * theatrical releases over the next 90 days as a poster strip
 * with title and release date — same density-vs-readability
 * trade-off as /api/og/box-office's row layouts.
 */
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const data = await getReleases({
      fromDate: today,
      toDate: ninetyDays,
      releaseTypes: [2, 3], // theatrical only — visually focuses the OG
      sortBy: "popularity.desc",
    });
    const top = data.results.slice(0, 5);

    const logoSrc = getLogoBase64();

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            backgroundColor: "#0a0a0a",
            padding: 48,
          }}
        >
          {/* Header strip */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={36} height={36} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>THE RATIST</span>
            </div>
            <span style={{ color: "#ef3b36", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const }}>
              Release Calendar
            </span>
          </div>

          {/* Title block */}
          <span style={{ color: "white", fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginBottom: 6 }}>
            Coming Soon
          </span>
          <span style={{ color: "#888", fontSize: 16, marginBottom: 16 }}>
            Most anticipated releases over the next 90 days
          </span>

          {/* Poster strip — 5 vertical posters in a row, makes
              the visual nature of upcoming films legible at a glance. */}
          {top.length > 0 ? (
            <div style={{ display: "flex", gap: 16, flex: 1, alignItems: "center", justifyContent: "center" }}>
              {top.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6, width: 130 }}>
                  {m.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                      width={130}
                      height={195}
                      style={{ borderRadius: 8, objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ display: "flex", width: 130, height: 195, borderRadius: 8, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#444", fontSize: 11 }}>No poster</span>
                    </div>
                  )}
                  <span style={{ color: "#ddd", fontSize: 12, fontWeight: 600, lineHeight: 1.2, height: 30, overflow: "hidden" as const }}>
                    {m.title.length > 28 ? m.title.slice(0, 28) + "…" : m.title}
                  </span>
                  <span style={{ color: "#666", fontSize: 11 }}>{m.release_date ?? "TBA"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 60, paddingBottom: 60 }}>
              <span style={{ color: "#444", fontSize: 18 }}>No upcoming releases tracked yet</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", marginTop: "auto", paddingTop: 12 }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com / releases</span>
          </div>
        </div>
      ),
      { width: 800, height: 520 },
    );
  } catch (err) {
    console.error("OG releases error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
