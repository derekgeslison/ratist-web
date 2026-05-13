import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";
import { OG_W, OG_H, OgHeader, OgEmptyState, VoteStats, truncate, RED } from "@/lib/og-community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logoSrc = getLogoBase64();
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const recent = await prisma.moviePitch.findMany({
      where: { createdAt: { gte: since } },
      include: {
        author: { select: { name: true, avatarUrl: true } },
        votes: { select: { value: true } },
      },
    });

    const enrich = <T extends { votes: { value: number }[] }>(p: T) => ({
      ...p,
      total: p.votes.length,
      net: p.votes.reduce((s, v) => s + v.value, 0),
    });
    let scored = recent.map(enrich).sort((a, b) => b.net - a.net || +b.createdAt - +a.createdAt);
    let top = scored[0];

    if (!top) {
      const fallback = await prisma.moviePitch.findMany({
        include: {
          author: { select: { name: true, avatarUrl: true } },
          votes: { select: { value: true } },
        },
      });
      scored = fallback.map(enrich).sort((a, b) => b.net - a.net);
      top = scored[0];
    }

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: OG_W,
            height: OG_H,
            backgroundColor: "#0a0a0a",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              top: 0,
              width: OG_W,
              height: OG_H,
              background: "linear-gradient(135deg, #1a0410 0%, #0a0a0a 60%)",
            }}
          />

          <OgHeader logoSrc={logoSrc} eyebrow="PITCHES" url="theratist.com/community/pitches" />

          {top ? (
            <>
              {/* Vote stats top-right */}
              <div style={{ display: "flex", position: "absolute", top: 100, right: 60 }}>
                <VoteStats total={top.total} net={top.net} accent={RED} />
              </div>

              {/* Genre/type chip */}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  left: 60,
                  top: 110,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    padding: "5px 12px",
                    backgroundColor: "rgba(204,0,51,0.15)",
                    border: `1px solid ${RED}`,
                    borderRadius: 999,
                  }}
                >
                  <span style={{ color: RED, fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>
                    {top.mediaType === "tv" ? "TV PITCH" : "FILM PITCH"}
                  </span>
                </div>
                {top.genre && (
                  <div
                    style={{
                      display: "flex",
                      padding: "5px 12px",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 999,
                    }}
                  >
                    <span style={{ color: "#ccc", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
                      {top.genre.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Title */}
              <span
                style={{
                  color: "white",
                  position: "absolute",
                  left: 60,
                  top: 160,
                  fontSize: titleSize(top.title),
                  fontWeight: 900,
                  lineHeight: 1.05,
                  width: 920,
                  textShadow: "0 2px 6px #000",
                }}
              >
                {top.title}
              </span>

              {/* Description */}
              <span
                style={{
                  display: "flex",
                  position: "absolute",
                  left: 60,
                  top: 320,
                  color: "#bbb",
                  fontSize: 18,
                  lineHeight: 1.45,
                  width: 1080,
                  fontStyle: "italic",
                }}
              >
                &ldquo;{truncate(top.description, 280)}&rdquo;
              </span>

              {/* Author chip — bumped up from 550 */}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  left: 60,
                  top: 505,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    border: `2px solid ${RED}`,
                    overflow: "hidden",
                    backgroundColor: "#1a1a1a",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {top.author.avatarUrl ? (
                    <img
                      src={top.author.avatarUrl}
                      width={40}
                      height={40}
                      style={{ objectFit: "cover", borderRadius: 8 }}
                    />
                  ) : (
                    <span style={{ color: "white", fontSize: 18, fontWeight: 900 }}>
                      {top.author.name[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ color: "#bbb", fontSize: 15, fontWeight: 600 }}>pitched by</span>
                  <span style={{ color: "white", fontSize: 16, fontWeight: 800 }}>{top.author.name}</span>
                </div>
              </div>
            </>
          ) : (
            <OgEmptyState
              line1="The pitch room is open."
              line2="Drop your dream project at theratist.com/community/pitches"
            />
          )}
        </div>
      ),
      { width: OG_W, height: OG_H }
    );
  } catch (err) {
    console.error("OG pitches error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function titleSize(s: string): number {
  if (s.length <= 32) return 64;
  if (s.length <= 60) return 50;
  return 40;
}
