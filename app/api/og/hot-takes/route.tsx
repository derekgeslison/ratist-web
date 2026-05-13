import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64 } from "@/lib/og-helpers";
import { OG_W, OG_H, OgHeader, OgEmptyState, VoteStats, truncate } from "@/lib/og-community";

export const dynamic = "force-dynamic";

const ORANGE = "#f97316";

export async function GET() {
  try {
    const logoSrc = getLogoBase64();
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Top by absolute score (|upvotes − downvotes|) in the last 14 days,
    // falling back to all-time top if nothing recent has voted scores yet.
    const recent = await prisma.hotTake.findMany({
      where: { createdAt: { gte: since } },
      include: {
        author: { select: { name: true, avatarUrl: true } },
        votes: { select: { value: true } },
      },
    });

    const enrich = <T extends { votes: { value: number }[] }>(t: T) => ({
      ...t,
      total: t.votes.length,
      net: t.votes.reduce((s, v) => s + v.value, 0),
    });
    let scored = recent
      .map(enrich)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || +b.createdAt - +a.createdAt);
    let top = scored[0];

    if (!top) {
      const fallback = await prisma.hotTake.findMany({
        include: {
          author: { select: { name: true, avatarUrl: true } },
          votes: { select: { value: true } },
        },
      });
      scored = fallback.map(enrich).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
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
              background: "linear-gradient(135deg, #2a0a0a 0%, #0a0a0a 60%)",
            }}
          />

          <OgHeader logoSrc={logoSrc} eyebrow="HOT TAKES" url="theratist.com/community/hot-takes" />

          {top ? (
            <>
              {/* Vote stats top-right */}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  top: 110,
                  right: 60,
                }}
              >
                <VoteStats total={top.total} net={top.net} accent={ORANGE} />
              </div>

              {/* The take — opening quote, body, closing quote mirrored below */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "absolute",
                  left: 60,
                  top: 130,
                  width: 880,
                }}
              >
                <span
                  style={{
                    color: ORANGE,
                    fontSize: 96,
                    fontWeight: 900,
                    lineHeight: 0.8,
                  }}
                >
                  &ldquo;
                </span>
                <span
                  style={{
                    color: "white",
                    fontSize: titleSizeFor(top.content),
                    fontWeight: 800,
                    lineHeight: 1.18,
                    marginTop: -10,
                    maxWidth: 880,
                    textShadow: "0 2px 6px #000",
                  }}
                >
                  {truncate(top.content, 200)}
                </span>
                {/* Closing quote — mirror of the opening mark, right-aligned
                    against the body's text block. Dynamic: lives in the same
                    flex column as the body text, so marginTop is *relative to
                    the bottom of the (possibly wrapped) take* — a longer take
                    pushes this quote further down naturally. */}
                <span
                  style={{
                    color: ORANGE,
                    fontSize: 96,
                    fontWeight: 900,
                    lineHeight: 0.5,
                    marginTop: 25,
                    textAlign: "right",
                    width: 880,
                  }}
                >
                  &rdquo;
                </span>
              </div>

              {/* Author chip — bumped up from 550 to give breathing room */}
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  left: 60,
                  top: 510,
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
                    border: `2px solid ${ORANGE}`,
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
                  <span style={{ color: "#bbb", fontSize: 15, fontWeight: 600 }}>by</span>
                  <span style={{ color: "white", fontSize: 16, fontWeight: 800 }}>{top.author.name}</span>
                </div>
              </div>
            </>
          ) : (
            <OgEmptyState
              line1="Hot Takes are heating up."
              line2="Drop yours at theratist.com/community/hot-takes"
            />
          )}
        </div>
      ),
      { width: OG_W, height: OG_H }
    );
  } catch (err) {
    console.error("OG hot-takes error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function titleSizeFor(s: string): number {
  if (s.length <= 60) return 50;
  if (s.length <= 110) return 40;
  if (s.length <= 170) return 32;
  return 28;
}
