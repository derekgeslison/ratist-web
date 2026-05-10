import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";
import { getYearInReview } from "@/lib/year-in-review/data";

export const dynamic = "force-dynamic";

/**
 * Chapter 4 — "How My [year] Was Defined". Top actors, top-3 most
 * watched months bar chart, and the taste twin if a followed user
 * qualifies (≥70% similarity).
 *
 * Route is still named /people for stability (page references it),
 * but the framing broadened from "who" to "how" — patterns + people.
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

    const hasActors = data.topActors.length > 0;
    const hasTwin = data.tasteTwin != null;
    const maxMonth = Math.max(...data.topMonths.map((m) => m.count), 1);

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

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ef3b36", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>Chapter 4</span>
              <span style={{ color: "white", fontSize: 40, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>How My {year} Was Defined</span>
            </div>
            <span style={{ color: "#aaa", fontSize: 14, fontWeight: 600 }}>{userRow.name}</span>
          </div>

          <div style={{ display: "flex", gap: 12, flex: 1 }}>
            {/* LEFT: Top Actors */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1.2, backgroundColor: "#141414", borderRadius: 14, padding: 16 }}>
              <span style={{ color: "#60a5fa", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 12 }}>Top Actors</span>
              {hasActors ? data.topActors.slice(0, 5).map((a, i) => (
                <div key={a.tmdbId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, marginBottom: 8, borderBottom: i < Math.min(data.topActors.length, 5) - 1 ? "1px solid #222" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#555", fontSize: 16, fontWeight: 900, width: 20 }}>{i + 1}</span>
                    <span style={{ color: "white", fontSize: 19, fontWeight: 800, maxWidth: 280 }}>
                      {a.name.length > 22 ? a.name.slice(0, 22) + "…" : a.name}
                    </span>
                  </div>
                  <span style={{ color: "#888", fontSize: 13 }}>{a.count} appearances</span>
                </div>
              )) : (
                <span style={{ color: "#666", fontSize: 14, fontStyle: "italic" }}>No actor appeared in more than one title.</span>
              )}
            </div>

            {/* RIGHT: Top Months (or Directors fallback) + Taste Twin stacked.
                Months chart needs ≥3 months to actually be a chart; below
                that we fall back to the Directors & Creators list. */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 12 }}>
              {data.topMonths.length >= 3 ? (
                <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#141414", borderRadius: 14, padding: 16 }}>
                  <span style={{ color: "#888", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>Top Months</span>
                  {data.topMonths.map(({ name, count }) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ color: "#aaa", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, width: 42 }}>{name}</span>
                      <div style={{ display: "flex", flex: 1, height: 10, backgroundColor: "#0a0a0a", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ display: "flex", width: `${(count / maxMonth) * 100}%`, height: "100%", backgroundColor: "#60a5fa", borderRadius: 999 }} />
                      </div>
                      <span style={{ color: "white", fontSize: 14, fontWeight: 900, width: 28, textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              ) : data.topPeople.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#141414", borderRadius: 14, padding: 16 }}>
                  <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 10 }}>Directors & Creators</span>
                  {data.topPeople.slice(0, 3).map((p) => (
                    <div key={`${p.role}-${p.tmdbId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ color: "white", fontSize: 14, fontWeight: 700, maxWidth: 220 }}>
                        {p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name}
                      </span>
                      <span style={{ color: "#888", fontSize: 11 }}>{p.count}× {p.role === "director" ? "dir." : "creator"}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Taste Twin */}
              {hasTwin ? (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 16, border: "1px solid rgba(239, 59, 54, 0.4)", justifyContent: "center" }}>
                  <span style={{ color: "#ef3b36", fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" as const, marginBottom: 10 }}>Taste Twin</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {data.tasteTwin!.avatarUrl ? (
                      <img src={data.tasteTwin!.avatarUrl} width={48} height={48} style={{ borderRadius: 999 }} />
                    ) : (
                      <div style={{ display: "flex", width: 48, height: 48, backgroundColor: "#ef3b36", borderRadius: 999, alignItems: "center", justifyContent: "center", color: "white", fontSize: 22, fontWeight: 900 }}>
                        {data.tasteTwin!.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                      <span style={{ color: "white", fontSize: 17, fontWeight: 900, lineHeight: 1.1 }}>
                        {data.tasteTwin!.name.length > 18 ? data.tasteTwin!.name.slice(0, 18) + "…" : data.tasteTwin!.name}
                      </span>
                      <span style={{ color: "#888", fontSize: 11, marginTop: 2 }}>Someone you follow</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={{ color: "#34d399", fontSize: 38, fontWeight: 900, lineHeight: 1 }}>{data.tasteTwin!.similarity}%</span>
                      <span style={{ color: "#666", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 2 }}>Match</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flex: 1, backgroundColor: "#141414", borderRadius: 14, padding: 16, justifyContent: "center", alignItems: "center" }}>
                  <span style={{ color: "#666", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>Follow someone to unlock your taste twin.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    console.error("OG defined error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}
