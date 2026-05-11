import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id") ?? "";

  try {
    const logoSrc = getLogoBase64();

    const session = await prisma.screeningSession.findUnique({
      where: { id: sessionId },
      select: {
        movieTitle: true,
        posterPath: true,
        startedAt: true,
        finishedAt: true,
        tmdbId: true,
        mediaType: true,
        participants: {
          select: { user: { select: { name: true, avatarUrl: true } } },
        },
        ratings: {
          select: {
            ratistRating: true,
            storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
            user: { select: { name: true, avatarUrl: true } },
          },
        },
        bookmarks: { select: { id: true } },
        // Per-minute chat counts captured when highlights are generated.
        // Drives the OG reaction-timeline strip with exact parity to
        // the in-app post-watch chart. Falls back to chatHighlights
        // timestamps for older sessions that ran before this column
        // existed (the data sparsity in that fallback is what makes
        // the strip look threadbare — the column is the fix).
        chatBucketCounts: true,
        chatHighlights: { select: { timestamp: true } },
        polls: { select: { id: true } },
      },
    });

    if (!session) return new Response("Not found", { status: 404 });

    // Look up the movie/show metadata by tmdbId. We can't rely on the
    // session.movie Prisma relation because the select-movie flow only
    // sets ScreeningSession.tmdbId (never .movieId), so the relation is
    // always null even when the row exists in our Movie table. Querying
    // by tmdbId is the only way to surface releaseDate / genres /
    // director on the recap card.
    let mediaMeta: {
      releaseDate: string | null;
      genres: string[];
      creditNames: string[];
      creditLabel: "Directed by " | "Created by ";
    } | null = null;
    if (session.tmdbId) {
      if (session.mediaType === "tv") {
        const show = await prisma.tVShow.findUnique({
          where: { tmdbId: session.tmdbId },
          select: {
            firstAirDate: true,
            genres: { select: { genre: { select: { name: true } } } },
            cast: {
              where: { creditType: "crew", job: "Creator" },
              select: { celebrity: { select: { name: true } } },
              orderBy: { castOrder: "asc" },
              take: 2,
            },
          },
        });
        if (show) {
          mediaMeta = {
            releaseDate: show.firstAirDate,
            genres: show.genres.map((g) => g.genre.name).slice(0, 4),
            creditNames: show.cast.map((c) => c.celebrity.name),
            creditLabel: "Created by ",
          };
        }
      } else {
        const movie = await prisma.movie.findUnique({
          where: { tmdbId: session.tmdbId },
          select: {
            releaseDate: true,
            genres: { select: { genre: { select: { name: true } } } },
            cast: {
              where: { creditType: "crew", job: "Director" },
              select: { celebrity: { select: { name: true } } },
              orderBy: { castOrder: "asc" },
              take: 2,
            },
          },
        });
        if (movie) {
          mediaMeta = {
            releaseDate: movie.releaseDate,
            genres: movie.genres.map((g) => g.genre.name).slice(0, 4),
            creditNames: movie.cast.map((c) => c.celebrity.name),
            creditLabel: "Directed by ",
          };
        }
      }
    }

    const posterUrl = session.posterPath
      ? `https://image.tmdb.org/t/p/w300${session.posterPath}`
      : null;

    const dateStr = session.startedAt
      ? new Date(session.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

    // Watch duration as HH:MM — adds a concrete data point at a glance
    // and makes long screenings (or quick rewatches) visible.
    let durationStr = "";
    if (session.startedAt && session.finishedAt) {
      const mins = Math.max(0, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // Movie/show metadata derived from the mediaMeta lookup above
    const year = (() => {
      const date = mediaMeta?.releaseDate;
      if (!date || date.length < 4) return null;
      return date.slice(0, 4);
    })();
    const directorLabel = mediaMeta && mediaMeta.creditNames.length > 0
      ? mediaMeta.creditLabel + mediaMeta.creditNames.slice(0, 2).join(", ")
      : null;
    const genres = mediaMeta?.genres ?? [];

    const scores = session.ratings.map((r) => r.ratistRating).filter((v): v is number => v != null);
    const groupAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const cats = [
      { label: "Story", vals: session.ratings.map((r) => r.storyScore) },
      { label: "Style", vals: session.ratings.map((r) => r.styleScore) },
      { label: "Emotion", vals: session.ratings.map((r) => r.emotiveScore) },
      { label: "Acting", vals: session.ratings.map((r) => r.actingScore) },
      { label: "Entertainment", vals: session.ratings.map((r) => r.entertainScore) },
    ].map((c) => {
      const valid = c.vals.filter((v): v is number => v != null);
      return { label: c.label, avg: valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null };
    });

    // Reaction-timeline strip. 3-minute buckets, same logic as the
    // in-app post-watch heatmap. Data source priority:
    //   1) chatBucketCounts (per-minute array persisted when the host
    //      generates highlights — the accurate path that mirrors the
    //      page chart bucket-for-bucket).
    //   2) chatHighlights timestamps (legacy fallback for sessions
    //      that completed before chatBucketCounts existed — sparse
    //      because only top-3 burst windows are persisted there).
    const BUCKET_MINUTES = 3;
    const minuteCounts = Array.isArray(session.chatBucketCounts)
      ? (session.chatBucketCounts as unknown as number[]).filter((n) => typeof n === "number")
      : null;
    const showHeatmap = session.startedAt && session.finishedAt && (
      (minuteCounts !== null && minuteCounts.length > 0) ||
      session.chatHighlights.length >= 3
    );
    let heatmap: number[] = [];
    let heatMax = 1;
    if (showHeatmap) {
      const startMs = new Date(session.startedAt!).getTime();
      const endMs = new Date(session.finishedAt!).getTime();
      const durationMin = Math.max(1, Math.ceil((endMs - startMs) / 60000));
      const bucketCount = Math.max(1, Math.ceil(durationMin / BUCKET_MINUTES));
      heatmap = new Array(bucketCount).fill(0);
      if (minuteCounts) {
        // Re-bucket the per-minute array into 3-minute slices.
        for (let m = 0; m < minuteCounts.length; m++) {
          const idx = Math.min(bucketCount - 1, Math.floor(m / BUCKET_MINUTES));
          heatmap[idx] += minuteCounts[m];
        }
      } else {
        // Legacy path — bucket the highlight-message timestamps.
        for (const h of session.chatHighlights) {
          const ts = new Date(h.timestamp).getTime();
          if (ts < startMs || ts > endMs) continue;
          const elapsedMin = (ts - startMs) / 60000;
          const idx = Math.min(bucketCount - 1, Math.floor(elapsedMin / BUCKET_MINUTES));
          heatmap[idx]++;
        }
      }
      heatMax = Math.max(1, ...heatmap);
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            background: "#0a0a0a",
            position: "relative" as const,
            fontFamily: "sans-serif",
          }}
        >
          {/* Brand red → black diagonal gradient. Satori (next/og's
             renderer) collapses absolutely-positioned children-less
             `display: flex` divs to 0×0 unless they have explicit
             dimensions — `inset: 0` alone wasn't enough on the
             previous pass, which is why earlier attempts rendered as
             flat black. Explicit width/height + top/left forces the
             layer to actually fill the card. */}
          <div style={{
            position: "absolute" as const,
            top: 0, left: 0,
            width: "1200px", height: "630px",
            // Restrained dark-wine start. Concentrates the brand
            // colour in just the top-left corner and falls off to
            // near-black by ~half the diagonal so the rest of the
            // card reads as cinema-dark rather than red-tinted.
            background: "linear-gradient(135deg, #3a0112 0%, #150407 30%, #0a0506 60%, #050505 100%)",
          }} />

          {/* Brand accent stripe on the left edge */}
          <div style={{
            display: "flex", position: "absolute" as const,
            left: 0, top: 0, bottom: 0, width: 6, background: "#CC0033",
          }} />

          {/* Content */}
          <div style={{ display: "flex", position: "relative" as const, width: "100%", height: "100%", padding: "36px 44px" }}>
            {/* Left column — poster + metadata fills the previously
               empty space below the poster. */}
            <div style={{ display: "flex", flexDirection: "column", marginRight: 36, width: 240, flexShrink: 0 }}>
              {posterUrl && (
                <img src={posterUrl} width={240} height={360}
                  style={{ borderRadius: 14, objectFit: "cover", boxShadow: "0 8px 32px rgba(0,0,0,0.7)" }} />
              )}

              {/* Release year — the watch-duration was previously
                 shown here too, but it already appears in the right-
                 column stat strip ("· 1h 16m"). Year stays because the
                 stat strip carries the screening date, not the film's
                 release year. */}
              {year && (
                <div style={{ marginTop: 14, color: "#bbb", fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>
                  {year}
                </div>
              )}

              {/* Director / creator credit */}
              {directorLabel && (
                <p style={{ margin: "6px 0 0 0", color: "#ddd", fontSize: 13, fontStyle: "italic" }}>
                  {directorLabel}
                </p>
              )}

              {/* Genre pills */}
              {genres.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {genres.map((g, i) => (
                    <span key={i} style={{
                      display: "flex",
                      color: "#e5e5e5",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.3,
                    }}>{g}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
              {/* Header */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                  <img src={logoSrc} width={32} height={32} />
                  <span style={{ color: "#CC0033", fontSize: 12, marginLeft: 12, letterSpacing: 2.5, textTransform: "uppercase" as const, fontWeight: 700 }}>
                    Screening Room Recap
                  </span>
                </div>

                <h1 style={{ color: "white", fontSize: 42, fontWeight: 900, lineHeight: 1.05, margin: "2px 0 8px 0", letterSpacing: -0.5 }}>
                  {session.movieTitle ?? "Untitled"}
                </h1>

                {/* Stat strip — date · watchers · duration · bookmarks · polls */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#aaa", fontSize: 14, flexWrap: "wrap" }}>
                  {dateStr && <span>{dateStr}</span>}
                  <span style={{ color: "#444" }}>·</span>
                  <span>{session.participants.length} {session.participants.length === 1 ? "watcher" : "watchers"}</span>
                  {durationStr && (<>
                    <span style={{ color: "#444" }}>·</span>
                    <span>{durationStr}</span>
                  </>)}
                  {session.bookmarks.length > 0 && (<>
                    <span style={{ color: "#444" }}>·</span>
                    <span>{session.bookmarks.length} {session.bookmarks.length === 1 ? "bookmark" : "bookmarks"}</span>
                  </>)}
                  {session.polls.length > 0 && (<>
                    <span style={{ color: "#444" }}>·</span>
                    <span>{session.polls.length} {session.polls.length === 1 ? "poll" : "polls"}</span>
                  </>)}
                </div>
              </div>

              {/* Ratings — group avg + per-user pills */}
              {session.ratings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "10px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {groupAvg != null && (
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        background: "rgba(204,0,51,0.2)", border: "2px solid #CC0033", borderRadius: 14,
                        padding: "10px 22px", minWidth: 100,
                      }}>
                        <span style={{ color: "#CC0033", fontSize: 11, marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" as const, fontWeight: 700 }}>Group</span>
                        <span style={{ color: scoreHex(groupAvg), fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{groupAvg.toFixed(1)}</span>
                      </div>
                    )}
                    {session.ratings.slice(0, 5).map((r, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "rgba(30,30,30,0.85)", border: "1px solid #2a2a2a",
                        borderRadius: 14, padding: "8px 14px",
                      }}>
                        {r.user.avatarUrl ? (
                          <img src={r.user.avatarUrl} width={28} height={28} style={{ borderRadius: 14, objectFit: "cover" }} />
                        ) : (
                          <div style={{ display: "flex", width: 28, height: 28, borderRadius: 14, background: "#CC0033", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontSize: 13, fontWeight: 900 }}>{r.user.name[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ color: "#999", fontSize: 10, letterSpacing: 0.5 }}>{r.user.name}</span>
                          <span style={{ color: r.ratistRating != null ? scoreHex(r.ratistRating) : "#666", fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                            {r.ratistRating != null ? r.ratistRating.toFixed(1) : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Category bars */}
                  <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
                    {cats.map((c, i) => {
                      const pct = c.avg != null ? (c.avg / 10) * 100 : 0;
                      const color = c.avg != null ? scoreHex(c.avg) : "#333";
                      return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ color: "#888", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" as const, fontWeight: 600 }}>{c.label}</span>
                            <span style={{ color, fontSize: 15, fontWeight: 800 }}>{c.avg != null ? c.avg.toFixed(1) : "—"}</span>
                          </div>
                          <div style={{ display: "flex", width: "100%", height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ display: "flex", width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mini reaction timeline — visually mirrors the
                 in-app post-watch heatmap. Every bucket renders a bar:
                 buckets with chatter peak up in yellow/red, "quiet"
                 buckets fall back to a short dark-gray baseline so the
                 strip reads as a continuous timeline rather than a
                 sparse confetti pattern. (We only persist messages
                 from the top-3 burst windows in ScreeningChatHighlight,
                 so most non-peak buckets are zero — the baseline
                 visualises the watch's full timeline without
                 fabricating activity.) */}
              {showHeatmap && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ color: "#aaa", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" as const, fontWeight: 700 }}>Reaction Timeline</span>
                    <span style={{ color: "#666", fontSize: 10 }}>chat activity over the watch</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 84 }}>
                    {heatmap.map((count, i) => {
                      // Two-tier visualization:
                      //   - Quiet buckets (count < MIN_VISIBLE) render
                      //     a TINY dark-gray baseline bar so the strip
                      //     reads as a continuous timeline, but the
                      //     mark stays subtle enough that real
                      //     chatter is unambiguously taller.
                      //   - Active buckets (count >= MIN_VISIBLE)
                      //     scale up with sqrt against the peak so
                      //     mid-tier moments aren't dwarfed by the
                      //     biggest spike.
                      const MIN_VISIBLE = 4;
                      const MAX_H = 84;
                      const MIN_BAR = 14;
                      const BASELINE_H = 5;
                      if (count < MIN_VISIBLE) {
                        return (
                          <div key={i} style={{
                            display: "flex", flex: 1, height: BASELINE_H, background: "#374151", borderRadius: 2,
                          }} />
                        );
                      }
                      const linear = count / heatMax;
                      const intensity = Math.sqrt(linear);
                      const h = Math.max(MIN_BAR, Math.round(intensity * MAX_H));
                      // Colors still keyed off raw linear ratio so
                      // "red" means "near the peak," not "above
                      // threshold."
                      const color = linear > 0.66 ? "#CC0033" : linear > 0.33 ? "#eab308" : "#374151";
                      return (
                        <div key={i} style={{
                          display: "flex", flex: 1, height: h, background: color, borderRadius: 3,
                        }} />
                      );
                    })}
                  </div>
                  {/* Time-axis labels — 4 ticks across the strip
                     (start / 1/3 / 2/3 / end) so viewers can place
                     the peaks within the runtime at a glance. Each
                     tick maps to (bucketIdx × BUCKET_MINUTES). */}
                  {heatmap.length > 4 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#666", fontSize: 10, letterSpacing: 0.3, marginTop: -2 }}>
                      {[0, Math.floor(heatmap.length / 3), Math.floor((heatmap.length * 2) / 3), heatmap.length - 1].map((idx) => {
                        const mins = idx * BUCKET_MINUTES;
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        return (
                          <span key={idx}>{h}:{String(m).padStart(2, "0")}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Footer: participant avatar stack + URL */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {session.participants.slice(0, 8).map((p, i) => (
                    p.user.avatarUrl ? (
                      <img key={i} src={p.user.avatarUrl} width={32} height={32}
                        style={{ borderRadius: 16, border: "2px solid #0a0a0a", marginLeft: i === 0 ? 0 : -8, objectFit: "cover" }} />
                    ) : (
                      <div key={i} style={{
                        display: "flex", width: 32, height: 32, borderRadius: 16,
                        border: "2px solid #0a0a0a", marginLeft: i === 0 ? 0 : -8,
                        background: "#CC0033", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ color: "white", fontSize: 12, fontWeight: 900 }}>{p.user.name[0]?.toUpperCase()}</span>
                      </div>
                    )
                  ))}
                  {session.participants.length > 8 && (
                    <div style={{
                      display: "flex", width: 32, height: 32, borderRadius: 16,
                      border: "2px solid #0a0a0a", marginLeft: -8,
                      background: "#1a1a1a", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>+{session.participants.length - 8}</span>
                    </div>
                  )}
                </div>
                <span style={{ color: "#666", fontSize: 12, marginLeft: 6 }}>theratist.com/screening-room</span>
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err) {
    console.error("OG screening error:", err);
    return new Response("Error", { status: 500 });
  }
}
