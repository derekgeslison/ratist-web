import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getLogoBase64, scoreHex } from "@/lib/og-helpers";

export const dynamic = "force-dynamic";

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#ccc", fontSize: 13, width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", flex: 1, height: 18, background: "#222", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color ?? "#CC0033", borderRadius: 4 }} />
      </div>
      <span style={{ color: "#888", fontSize: 13, width: 32, textAlign: "right" as const, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a", borderRadius: 10, padding: "10px 18px" }}>
      <span style={{ color: "#666", fontSize: 11 }}>{label}</span>
      <span style={{ color: color ?? "white", fontSize: small ? 16 : 24, fontWeight: "bold" }}>{value}</span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a1a1a", border: `1px solid ${color}`, borderRadius: 8, padding: "6px 12px" }}>
      <span style={{ color, fontSize: 12, fontWeight: "bold" }}>{text}</span>
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const tab = searchParams.get("tab") ?? "overview";

  try {
    const logoSrc = getLogoBase64();
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) return new Response("Not found", { status: 404 });

    const yearFrom = searchParams.get("yearFrom") ?? "";
    const yearTo = searchParams.get("yearTo") ?? "";
    const yearLabel = yearFrom && yearTo ? `${yearFrom}–${yearTo}` : yearFrom ? `From ${yearFrom}` : yearTo ? `Through ${yearTo}` : "All Time";

    let tabTitle = "My Analytics";
    let chartContent: React.ReactNode = null;
    let statsContent: React.ReactNode = null;
    let badgeContent: React.ReactNode = null;

    // ── Overview: Decade breakdown + rich stats + profile type ──
    if (tab === "overview") {
      tabTitle = "Movie Analytics";

      const [ratingCount, seenCount] = await Promise.all([
        prisma.movieRating.count({ where: { userId: user.id } }),
        prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
      ]);

      const seenMovies = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { releaseDate: true, runtime: true } } },
      });
      const totalHours = Math.round(seenMovies.reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60);

      // Top genre
      const topGenre = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
        take: 1,
      });
      let favGenre = "—";
      if (topGenre.length > 0) {
        const g = await prisma.genre.findUnique({ where: { id: topGenre[0].genreId }, select: { name: true } });
        if (g) favGenre = g.name;
      }

      // Decade breakdown + average movie age + profile type
      const decadeCounts = new Map<string, number>();
      const currentYear = new Date().getFullYear();
      let totalAge = 0;
      let ageCount = 0;
      for (const s of seenMovies) {
        const yearStr = s.movie.releaseDate?.slice(0, 4);
        if (!yearStr) continue;
        const yr = parseInt(yearStr);
        const decade = `${yearStr.slice(0, 3)}0s`;
        decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
        totalAge += currentYear - yr;
        ageCount++;
      }
      const avgAge = ageCount > 0 ? Math.round(totalAge / ageCount) : null;
      const decades = [...decadeCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([decade, count]) => ({ decade, count }));
      const maxD = Math.max(...decades.map((d) => d.count), 1);
      const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f43f5e"];

      // Profile type based on decade distribution
      const recentCount = (decadeCounts.get("2020s") ?? 0) + (decadeCounts.get("2010s") ?? 0);
      const classicCount = [...decadeCounts.entries()].filter(([d]) => d < "2000s").reduce((s, [, c]) => s + c, 0);
      const total = seenMovies.length || 1;
      let profileType = "Film Explorer";
      if (recentCount / total > 0.8) profileType = "Modern Movie Fan";
      else if (classicCount / total > 0.3) profileType = "Classic Film Buff";
      else if (decades.length >= 6) profileType = "Era-Spanning Cinephile";

      statsContent = (
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label="Seen" value={String(seenCount)} />
          <Stat label="Rated" value={String(ratingCount)} />
          <Stat label="Hours" value={String(totalHours)} />
          <Stat label="Top Genre" value={favGenre} small />
          {avgAge != null && <Stat label="Avg Age" value={`${avgAge}yr`} />}
        </div>
      );
      badgeContent = <Badge text={profileType} color="#8b5cf6" />;
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Movies by Decade</span>
          {decades.slice(-8).map((d, i) => (
            <Bar key={d.decade} label={d.decade} value={d.count} max={maxD} color={colors[i % colors.length]} />
          ))}
        </div>
      );
    }

    // ── Genres: Genre bar chart + diversity + guilty pleasure ──
    else if (tab === "genres") {
      tabTitle = "Genre Breakdown";
      const seenCount = await prisma.userFavoriteMovie.count({ where: { userId: user.id } });

      // All genres (not just top 8) for diversity calc
      const allGenres = await prisma.movieGenre.groupBy({
        by: ["genreId"],
        where: { movie: { favoritedBy: { some: { userId: user.id } } } },
        _count: { genreId: true },
        orderBy: { _count: { genreId: "desc" } },
      });
      const genreIds = allGenres.map((g) => g.genreId);
      const genreNames = await prisma.genre.findMany({ where: { id: { in: genreIds } } });
      const nameMap = new Map(genreNames.map((g) => [g.id, g.name]));

      const top8 = allGenres.slice(0, 8);
      const maxG = Math.max(...top8.map((g) => g._count.genreId), 1);

      // Genre diversity score (Shannon entropy, normalized 0-100)
      const totalTags = allGenres.reduce((s, g) => s + g._count.genreId, 0);
      let entropy = 0;
      if (totalTags > 0 && allGenres.length > 1) {
        for (const g of allGenres) {
          const p = g._count.genreId / totalTags;
          if (p > 0) entropy -= p * Math.log2(p);
        }
        const maxEntropy = Math.log2(allGenres.length);
        entropy = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;
      }

      // Guilty pleasure: most watched but lowest rated
      let guiltyPleasure: string | null = null;
      const ratedGenreAvgs = await prisma.movieRating.findMany({
        where: { userId: user.id, ratistRating: { not: null } },
        select: { ratistRating: true, movie: { select: { genres: { select: { genre: { select: { name: true } } } } } } },
      });
      if (ratedGenreAvgs.length > 0) {
        const genreRatings = new Map<string, { total: number; count: number; seenCount: number }>();
        for (const r of ratedGenreAvgs) {
          for (const g of r.movie.genres) {
            const entry = genreRatings.get(g.genre.name) ?? { total: 0, count: 0, seenCount: 0 };
            entry.total += r.ratistRating!;
            entry.count++;
            genreRatings.set(g.genre.name, entry);
          }
        }
        // Cross-reference with seen counts
        for (const g of allGenres) {
          const name = nameMap.get(g.genreId);
          if (name && genreRatings.has(name)) {
            genreRatings.get(name)!.seenCount = g._count.genreId;
          }
        }
        // Guilty pleasure: high watch count + below-average rating
        const gpCandidates = [...genreRatings.entries()]
          .filter(([, d]) => d.count >= 2 && d.seenCount >= 20)
          .map(([name, d]) => ({ name, avg: d.total / d.count, seenCount: d.seenCount }))
          .sort((a, b) => b.seenCount - a.seenCount);
        // Pick the most-watched genre with a below-median rating
        const overallAvg = ratedGenreAvgs.reduce((s, r) => s + r.ratistRating!, 0) / ratedGenreAvgs.length;
        const gp = gpCandidates.find((g) => g.avg < overallAvg);
        if (gp) guiltyPleasure = gp.name;
      }

      statsContent = (
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label="Seen" value={String(seenCount)} />
          <Stat label="Genres" value={String(allGenres.length)} />
          <Stat label="Diversity" value={`${entropy}%`} color={entropy >= 70 ? "#22c55e" : entropy >= 40 ? "#eab308" : "#ef4444"} />
          <Stat label="#1 Genre" value={top8.length > 0 ? (nameMap.get(top8[0].genreId) ?? "?") : "—"} small />
        </div>
      );
      if (guiltyPleasure) {
        badgeContent = <Badge text={`Guilty Pleasure: ${guiltyPleasure}`} color="#f97316" />;
      }
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {top8.map((g) => (
            <Bar key={g.genreId} label={nameMap.get(g.genreId) ?? "?"} value={g._count.genreId} max={maxG} />
          ))}
        </div>
      );
    }

    // ── Directors & Actors: Based on ALL seen movies + unique counts ──
    else if (tab === "people") {
      tabTitle = "Directors & Actors";

      const seenMovies = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movieId: true },
      });
      const movieIds = seenMovies.map((s) => s.movieId);

      let dirBars: React.ReactNode = null;
      let actorBars: React.ReactNode = null;
      let topDirName = "—";
      let topActName = "—";
      let uniqueDirCount = 0;
      let uniqueActCount = 0;

      if (movieIds.length > 0) {
        // Directors
        const dirCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "crew", job: "Director" },
          select: { celebrity: { select: { name: true } } },
        });
        const dirCounts = new Map<string, number>();
        for (const dc of dirCredits) {
          dirCounts.set(dc.celebrity.name, (dirCounts.get(dc.celebrity.name) ?? 0) + 1);
        }
        uniqueDirCount = dirCounts.size;
        const topDirs = [...dirCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);
        const maxDir = Math.max(...topDirs.map(([, c]) => c), 1);
        if (topDirs.length > 0) topDirName = topDirs[0][0];

        // Actors (top 3 billed)
        const actCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "cast", castOrder: { lte: 3 } },
          select: { celebrity: { select: { name: true } } },
        });
        const actCounts = new Map<string, number>();
        for (const ac of actCredits) {
          actCounts.set(ac.celebrity.name, (actCounts.get(ac.celebrity.name) ?? 0) + 1);
        }
        uniqueActCount = actCounts.size;
        const topActs = [...actCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);
        const maxAct = Math.max(...topActs.map(([, c]) => c), 1);
        if (topActs.length > 0) topActName = topActs[0][0];

        dirBars = (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Top Directors</span>
            {topDirs.map(([name, count]) => (
              <Bar key={name} label={name.length > 16 ? name.slice(0, 15) + "…" : name} value={count} max={maxDir} color="#3b82f6" />
            ))}
          </div>
        );
        actorBars = (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
            <span style={{ color: "#666", fontSize: 12, marginBottom: 2 }}>Top Actors</span>
            {topActs.map(([name, count]) => (
              <Bar key={name} label={name.length > 16 ? name.slice(0, 15) + "…" : name} value={count} max={maxAct} color="#eab308" />
            ))}
          </div>
        );
      }

      statsContent = (
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label="Seen" value={String(movieIds.length)} />
          <Stat label="Directors" value={String(uniqueDirCount)} />
          <Stat label="Actors" value={String(uniqueActCount)} />
        </div>
      );
      chartContent = (
        <div style={{ display: "flex", gap: 24 }}>
          {dirBars}
          {actorBars}
        </div>
      );
    }

    // ── Rating Insights: Category bars + contrarian + personality + controversial ──
    else if (tab === "insights") {
      tabTitle = "Rating Insights";
      const avgRating = await prisma.movieRating.aggregate({
        where: { userId: user.id },
        _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
      });
      const avg = avgRating._avg;
      const ratingCount = await prisma.movieRating.count({ where: { userId: user.id } });

      const cats = [
        { label: "Story", score: avg.storyScore },
        { label: "Style", score: avg.styleScore },
        { label: "Emotion", score: avg.emotiveScore },
        { label: "Acting", score: avg.actingScore },
        { label: "Entertainment", score: avg.entertainScore },
      ];

      // Harshest and most generous category
      const scoredCats = cats.filter((c) => c.score != null);
      const harshest = scoredCats.length > 0 ? scoredCats.reduce((a, b) => (a.score! < b.score! ? a : b)) : null;
      const generous = scoredCats.length > 0 ? scoredCats.reduce((a, b) => (a.score! > b.score! ? a : b)) : null;

      // Contrarian score
      const userRatings = await prisma.movieRating.findMany({
        where: { userId: user.id, ratistRating: { not: null } },
        select: { movieId: true, ratistRating: true, movie: { select: { title: true, voteAverage: true } } },
      });
      let contrarianScore: number | null = null;
      let controversial: { title: string; userScore: number; communityScore: number } | null = null;

      let totalDeviation = 0;
      let deviationCount = 0;
      let maxDiff = 0;
      let maxDiffEntry: { title: string; userScore: number; communityScore: number } | null = null;

      for (const r of userRatings) {
        if (r.movie.voteAverage != null && r.movie.voteAverage > 0 && r.ratistRating != null) {
          const diff = Math.abs(r.ratistRating - r.movie.voteAverage);
          totalDeviation += diff;
          deviationCount++;
          if (diff > maxDiff) {
            maxDiff = diff;
            maxDiffEntry = { title: r.movie.title, userScore: r.ratistRating, communityScore: r.movie.voteAverage };
          }
        }
      }
      if (deviationCount > 0) {
        contrarianScore = Math.round((totalDeviation / deviationCount) * 10) / 10;
      }
      if (maxDiffEntry) controversial = maxDiffEntry;

      // Rater personality based on distribution shape
      let raterType = "Balanced Rater";
      if (userRatings.length >= 3) {
        const scores = userRatings.map((r) => r.ratistRating!);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        if (mean >= 7.5) raterType = "Generous Rater";
        else if (mean <= 5) raterType = "Tough Critic";
        else if (stdDev >= 2) raterType = "Polarized Taste";
        else raterType = "Balanced Rater";
      }

      statsContent = (
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label="Rated" value={String(ratingCount)} />
          {avg.ratistRating != null && <Stat label="Avg Rating" value={avg.ratistRating.toFixed(1)} color={scoreHex(avg.ratistRating)} />}
          {contrarianScore != null && <Stat label="Contrarian" value={contrarianScore.toFixed(1)} color={contrarianScore >= 2 ? "#ef4444" : contrarianScore >= 1 ? "#eab308" : "#22c55e"} />}
          {generous && harshest && generous.label !== harshest.label && (
            <Stat label="Toughest On" value={harshest.label} small color="#ef4444" />
          )}
        </div>
      );
      badgeContent = <Badge text={raterType} color={raterType === "Tough Critic" ? "#ef4444" : raterType === "Generous Rater" ? "#22c55e" : raterType === "Polarized Taste" ? "#f97316" : "#3b82f6"} />;
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {cats.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#ccc", fontSize: 14, width: 110, flexShrink: 0 }}>{c.label}</span>
              <div style={{ display: "flex", flex: 1, height: 20, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${((c.score ?? 0) / 10) * 100}%`, height: "100%", background: c.score ? scoreHex(c.score) : "#333", borderRadius: 4 }} />
              </div>
              <span style={{ color: c.score ? scoreHex(c.score) : "#666", fontSize: 15, fontWeight: "bold", width: 35, textAlign: "right" as const, flexShrink: 0 }}>{c.score?.toFixed(1) ?? "—"}</span>
            </div>
          ))}
          {controversial && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a1a1a", borderRadius: 8, padding: "8px 14px", marginTop: 4 }}>
              <span style={{ color: "#888", fontSize: 12 }}>Hottest Take:</span>
              <span style={{ color: "#ccc", fontSize: 12 }}>{controversial.title.length > 28 ? controversial.title.slice(0, 27) + "…" : controversial.title}</span>
              <span style={{ color: scoreHex(controversial.userScore), fontSize: 13, fontWeight: "bold" }}>{controversial.userScore.toFixed(1)}</span>
              <span style={{ color: "#555", fontSize: 11 }}>vs</span>
              <span style={{ color: scoreHex(controversial.communityScore), fontSize: 13, fontWeight: "bold" }}>{controversial.communityScore.toFixed(1)}</span>
            </div>
          )}
        </div>
      );
    }

    // ── Habits: Monthly bar chart + avg/month + streak ──
    else if (tab === "habits") {
      tabTitle = "Watching Habits";
      const seenDated = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id, watchedDate: { not: null } },
        select: { watchedDate: true },
        orderBy: { watchedDate: "asc" },
      });
      const monthCounts = new Array(12).fill(0);
      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (const s of seenDated) {
        if (s.watchedDate) monthCounts[new Date(s.watchedDate).getMonth()]++;
      }
      const maxM = Math.max(...monthCounts, 1);

      // Total watch hours + seen count
      const seenCount = await prisma.userFavoriteMovie.count({ where: { userId: user.id } });
      const runtimes = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { runtime: true } } },
      });
      const hours = Math.round(runtimes.reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60);

      // Avg movies per month (based on span of dated entries)
      let avgPerMonth = "—";
      if (seenDated.length >= 2) {
        const first = new Date(seenDated[0].watchedDate!);
        const last = new Date(seenDated[seenDated.length - 1].watchedDate!);
        const monthSpan = Math.max((last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()), 1);
        avgPerMonth = (seenDated.length / monthSpan).toFixed(1);
      }

      // Find peak month
      let peakIdx = 0;
      for (let i = 1; i < 12; i++) {
        if (monthCounts[i] > monthCounts[peakIdx]) peakIdx = i;
      }

      // Find most popular day of week
      const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayCounts = new Array(7).fill(0);
      for (const s of seenDated) {
        if (s.watchedDate) dayCounts[new Date(s.watchedDate).getDay()]++;
      }
      let peakDay = 0;
      for (let i = 1; i < 7; i++) {
        if (dayCounts[i] > dayCounts[peakDay]) peakDay = i;
      }

      statsContent = (
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label="Seen" value={String(seenCount)} />
          <Stat label="Hours" value={String(hours)} />
          <Stat label="Avg/Month" value={avgPerMonth} />
          <Stat label="Peak Month" value={monthLabels[peakIdx]} />
          <Stat label="Top Day" value={dayLabels[peakDay]} />
        </div>
      );
      chartContent = (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "flex-end", flex: 1, gap: 8, padding: "0 8px" }}>
            {monthCounts.map((count: number, i: number) => {
              const barH = count > 0 ? Math.max(Math.round((count / maxM) * 100), 4) : 0;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                  {count > 0 && <span style={{ color: "#aaa", fontSize: 11, marginBottom: 4 }}>{count}</span>}
                  <div style={{ width: "70%", height: barH, background: count > 0 ? "#3b82f6" : "#1a1a1a", borderRadius: "4px 4px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "6px 8px 0", borderTop: "1px solid #222" }}>
            {monthLabels.map((label, i) => (
              <div key={i} style={{ display: "flex", flex: 1, justifyContent: "center" }}>
                <span style={{ color: "#666", fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const avatarSrc = user.avatarUrl;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0a0a0a", padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoSrc} width={32} height={32} style={{ borderRadius: 6 }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16 }}>THE RATIST</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {avatarSrc ? (
                <img src={avatarSrc} width={24} height={24} style={{ borderRadius: 12 }} />
              ) : (
                <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, backgroundColor: "#CC0033", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 800, fontSize: 12 }}>{user.name?.[0]?.toUpperCase() ?? "?"}</span>
                </div>
              )}
              <span style={{ color: "#888", fontSize: 14 }}>{user.name}</span>
            </div>
          </div>

          {/* Title + tab-specific stats */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>{tabTitle}</span>
              <span style={{ color: "#666", fontSize: 14, marginTop: 4 }}>{yearLabel}</span>
            </div>
            {statsContent}
          </div>

          {/* Badge row */}
          {badgeContent && (
            <div style={{ display: "flex", marginBottom: 14 }}>
              {badgeContent}
            </div>
          )}

          {/* Chart */}
          {chartContent && (
            <div style={{ display: "flex", flexDirection: "column", background: "#111", borderRadius: 12, padding: 20, flex: 1 }}>
              {chartContent}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", marginTop: 16, alignItems: "center", gap: 6 }}>
            <span style={{ color: "#CC0033", fontSize: 12 }}>theratist.com</span>
            <span style={{ color: "#444", fontSize: 12 }}>· My Analytics</span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err: any) {
    console.error("OG analytics error:", err?.message ?? err, err?.stack);
    return new Response(`Error: ${err?.message ?? "Unknown"}`, { status: 500 });
  }
}
