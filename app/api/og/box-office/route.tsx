import { ImageResponse } from "next/og";
import { getLogoBase64 } from "@/lib/og-helpers";
import {
  getTopGrossing,
  getTopProfit,
  getROIRanking,
  getHighestBudget,
  getFranchiseMovies,
  getStudioMovies,
  getTopGrossingByDateRange,
  getTopGrossingByGenre,
  getTopGrossingByMpa,
  getTopGrossingByReleaseWindow,
  getTopFiltered,
  getTopCelebrityCareers,
  getTopStudios,
  getTopFranchises,
  formatDateYMD,
  type BoxOfficeFilters,
} from "@/lib/box-office-queries";
import { prisma } from "@/lib/prisma";
import { formatBoxOffice, formatROI, RELEASE_WINDOWS, type BoxOfficeRow } from "@/lib/box-office";

export const dynamic = "force-dynamic";

/**
 * GET /api/og/box-office
 *
 * Single OG-image generator for the box-office surface. Branches on
 * `?page=` so all box-office pages can share one route rather than
 * cloning the JSX layout per type. Falls back to a generic "Box
 * Office Insights" hero when no page param is provided.
 *
 * Supported pages:
 *   - hub                              (default; /box-office)
 *   - year     (?year=YYYY)            /box-office/year/YYYY
 *   - franchise (?id=N)                /box-office/franchises/N
 *   - studio   (?id=N)                 /box-office/studios/N
 *   - topGrossing                      /box-office/all?sort=revenue-desc
 *   - topProfit                        /box-office/all?sort=profit-desc
 *   - bestROI                          /box-office/all?sort=roi-desc
 *   - worstROI                         /box-office/all?sort=roi-asc
 *   - highestBudget                    /box-office/all?sort=budget-desc
 *   - recent                           /box-office/recent
 *   - decade   (?from=YYYY&to=YYYY)    top 5 of a decade
 *   - genre    (?id=N&name=…)          top 5 of a genre
 *   - mpa      (?code=R)               top 5 of an MPA cert
 *   - holiday  (?key=halloween)        top 5 of a release-window
 *   - filtered (?sort=&genres=&mpa=&languages=&releaseFrom=&releaseTo=)
 *                                       top 5 matching arbitrary filter
 *                                       combo — used by /box-office/all
 *                                       so the share preview reflects
 *                                       the user's actual filter state
 *   - branded  (?title=…&subtitle=…)   aggregation hubs (no rows)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "hub";

  try {
    let title = "Box Office Insights";
    let subtitle = "Lifetime grosses, profits, and ROI";
    // imageStyle controls how the row's thumbnail renders:
    //   - "poster": tall portrait, square corners (movies, franchises)
    //   - "profile": square, circular crop (actors, directors)
    //   - "logo": square, contain-fit on neutral background (studios)
    // The middle column (`year`) is generic — for non-movie types it
    // carries the film count instead of a release year.
    type Row = {
      title: string;
      posterPath: string | null;
      year: string;
      metric: string;
      imageStyle?: "poster" | "profile" | "logo";
    };
    let topRows: Row[] = [];

    if (page === "topGrossing") {
      title = "Top Grossing of All Time";
      subtitle = "Lifetime worldwide gross";
      topRows = (await getTopGrossing(5)).map(toRow);
    } else if (page === "topProfit") {
      title = "Biggest Est. Profit of All Time";
      subtitle = "Estimated studio P&L (worldwide)";
      topRows = (await getTopProfit(5)).map(toProfitRow);
    } else if (page === "bestROI") {
      title = "Best Est. Return on Investment";
      subtitle = "Studio share ÷ (budget + capped marketing)";
      topRows = (await getROIRanking("best", 5)).map(toROIRow);
    } else if (page === "worstROI") {
      title = "Biggest Box Office Bombs";
      subtitle = "Worst Est. ROI · min $100K budget";
      topRows = (await getROIRanking("worst", 5)).map(toROIRow);
    } else if (page === "highestBudget") {
      title = "Highest Production Budgets";
      subtitle = "Most expensive films ever made";
      topRows = (await getHighestBudget(5)).map(toBudgetRow);
    } else if (page === "recent") {
      const now = new Date();
      const ninetyDaysAgo = formatDateYMD(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
      title = "Recent Release Box Office";
      subtitle = "Top grossing of the last 90 days";
      topRows = (await getTopGrossingByDateRange(ninetyDaysAgo, formatDateYMD(now), 5)).map(toRow);
    } else if (page === "decade") {
      const fromY = searchParams.get("from") ?? "";
      const toY = searchParams.get("to") ?? "";
      if (!/^\d{4}$/.test(fromY) || !/^\d{4}$/.test(toY)) {
        return new Response("Bad decade range", { status: 400 });
      }
      title = `Top Grossing of the ${fromY}s`;
      subtitle = `${fromY}–${toY} releases by lifetime worldwide gross`;
      topRows = (await getTopGrossing(5, fromY, toY)).map(toRow);
    } else if (page === "genre") {
      const idParam = parseInt(searchParams.get("id") ?? "", 10);
      const name = searchParams.get("name") ?? "Genre";
      if (Number.isNaN(idParam)) return new Response("Bad genre id", { status: 400 });
      title = `Top Grossing ${name}`;
      subtitle = `Highest-grossing ${name.toLowerCase()} films of all time`;
      topRows = (await getTopGrossingByGenre(idParam, 5)).map(toRow);
    } else if (page === "mpa") {
      const code = searchParams.get("code") ?? "";
      if (!code) return new Response("Bad MPA code", { status: 400 });
      title = `Top ${code}-Rated of All Time`;
      subtitle = `Highest-grossing ${code}-rated films`;
      topRows = (await getTopGrossingByMpa(code, 5)).map(toRow);
    } else if (page === "holiday") {
      const key = searchParams.get("key") ?? "";
      const window = RELEASE_WINDOWS.find((w) => w.key === key);
      if (!window) return new Response("Bad holiday key", { status: 400 });
      title = `Top ${window.label} Releases`;
      subtitle = "Lifetime gross of films released in this window";
      topRows = (await getTopGrossingByReleaseWindow(window.start, window.end, 5)).map(toRow);
    } else if (page === "filtered") {
      // Parse filter state matching /api/box-office/list. Render top 5
      // with a title built from the active filters so the OG image
      // genuinely represents what the share recipient will see.
      const sortRaw = searchParams.get("sort") ?? "revenue-desc";
      const validSorts: BoxOfficeFilters["sort"][] = [
        "revenue-desc", "revenue-asc", "budget-desc", "budget-asc",
        "profit-desc", "profit-asc", "roi-desc", "roi-asc",
        "year-desc", "year-asc", "title-asc",
      ];
      const sort = (validSorts.includes(sortRaw as BoxOfficeFilters["sort"])
        ? sortRaw
        : "revenue-desc") as BoxOfficeFilters["sort"];
      const genreIds = (searchParams.get("genres") ?? "").split(",")
        .map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n));
      const mpaCodes = (searchParams.get("mpa") ?? "").split(",").filter(Boolean);
      const languages = (searchParams.get("languages") ?? "").split(",").filter(Boolean);
      const releaseFrom = searchParams.get("releaseFrom") ?? undefined;
      const releaseTo = searchParams.get("releaseTo") ?? undefined;

      // Build a human title from active filters. Order matters —
      // "Top Grossing PG-13 Action of the 1990s" reads naturally.
      const sortLabel: Record<BoxOfficeFilters["sort"], string> = {
        "revenue-desc": "Top Grossing", "revenue-asc": "Lowest Grossing",
        "budget-desc": "Highest Budget", "budget-asc": "Lowest Budget",
        "profit-desc": "Biggest Profit", "profit-asc": "Biggest Loss",
        "roi-desc": "Best ROI", "roi-asc": "Worst ROI",
        "year-desc": "Newest", "year-asc": "Oldest",
        "title-asc": "A–Z",
      };
      // Resolve genre + language names so the title reads naturally
      // instead of showing raw IDs.
      const [genreNames, langName] = await Promise.all([
        genreIds.length
          ? prisma.genre.findMany({
              where: { id: { in: genreIds } },
              select: { name: true },
            }).then((rows) => rows.map((r) => r.name))
          : Promise.resolve([] as string[]),
        Promise.resolve(languages[0]
          ? ({ en: "English", es: "Spanish", fr: "French", de: "German",
              it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese",
              hi: "Hindi", ru: "Russian", pt: "Portuguese", ar: "Arabic" }[languages[0]]
              ?? languages[0].toUpperCase())
          : null),
      ]);
      const parts: string[] = [sortLabel[sort]];
      if (mpaCodes.length === 1) parts.push(`${mpaCodes[0]}-Rated`);
      if (genreNames.length === 1) parts.push(genreNames[0]);
      if (langName) parts.push(`${langName}-Language`);
      title = parts.join(" ");
      if (releaseFrom || releaseTo) {
        const fromY = releaseFrom?.slice(0, 4);
        const toY = releaseTo?.slice(0, 4);
        if (fromY && toY && fromY === toY) {
          title += ` of ${fromY}`;
        } else if (fromY && toY) {
          title += ` ${fromY}–${toY}`;
        } else if (fromY) {
          title += ` since ${fromY}`;
        } else if (toY) {
          title += ` through ${toY}`;
        }
      }
      subtitle = "Filtered view from /box-office/all";
      // Metric column matches the active sort so the OG row reads
      // the same as the corresponding column in /box-office/all.
      const rowMapper = sort.startsWith("profit") ? toProfitRow
        : sort.startsWith("roi") ? toROIRow
        : sort.startsWith("budget") ? toBudgetRow
        : toRow;
      topRows = (await getTopFiltered(
        { sort, genreIds, mpaCodes, languages, releaseFrom, releaseTo },
        5,
      )).map(rowMapper);
    } else if (page === "topActors" || page === "topDirectors") {
      const role = page === "topActors" ? "actor" : "director";
      title = role === "actor" ? "Top Grossing Actors" : "Top Grossing Directors";
      subtitle = "Lifetime career box office across every credit";
      topRows = (await getTopCelebrityCareers(role, 5)).map((r) => ({
        title: r.name,
        posterPath: r.profilePath,
        year: `${r.filmCount} films`,
        metric: formatBoxOffice(r.totalRevenue) ?? "—",
        imageStyle: "profile" as const,
      }));
    } else if (page === "topStudios") {
      title = "Top Grossing Studios";
      subtitle = "Lifetime gross summed per studio credit";
      topRows = (await getTopStudios(5)).map((r) => ({
        title: r.name,
        posterPath: r.logoPath,
        year: `${r.filmCount} films`,
        metric: formatBoxOffice(r.totalRevenue) ?? "—",
        imageStyle: "logo" as const,
      }));
    } else if (page === "topFranchises") {
      title = "Top Grossing Franchises";
      subtitle = "Lifetime gross summed per series";
      topRows = (await getTopFranchises(5)).map((r) => ({
        title: r.name,
        posterPath: r.topPosterPath,
        year: `${r.filmCount} films`,
        metric: formatBoxOffice(r.totalRevenue) ?? "—",
        imageStyle: "poster" as const,
      }));
    } else if (page === "branded") {
      // Hub-style OG with no movie rows — used by aggregation hubs
      // (by-decade, by-genre, etc.) where no single top-5 list
      // would represent the page well. Title + subtitle come from
      // the URL so each hub sets its own copy without a new branch.
      title = searchParams.get("title") ?? "Box Office Insights";
      subtitle = searchParams.get("subtitle") ?? "Lifetime grosses, profits, and ROI";
      // topRows stays empty — the renderer below already handles
      // the no-rows case with a centered placeholder, so we just
      // need to make sure that placeholder reads as branded rather
      // than "no data". Use an empty subtitle when none was provided
      // so the layout doesn't break.
    } else if (page === "year") {
      const yearParam = searchParams.get("year") ?? "";
      if (!/^\d{4}$/.test(yearParam)) return new Response("Bad year", { status: 400 });
      title = `Highest Grossing of ${yearParam}`;
      subtitle = "Top films by lifetime worldwide gross";
      const movies = await getTopGrossing(5, yearParam, yearParam);
      topRows = movies.map(toRow);
    } else if (page === "franchise") {
      const idParam = parseInt(searchParams.get("id") ?? "", 10);
      if (Number.isNaN(idParam)) return new Response("Bad id", { status: 400 });
      const data = await getFranchiseMovies(idParam);
      if (!data.name) return new Response("Not found", { status: 404 });
      const sorted = data.movies
        .slice()
        .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
        .slice(0, 5);
      const total = data.movies.reduce((acc, m) => acc + (m.revenue ?? 0), 0);
      title = data.name;
      subtitle = `${data.movies.length} films · ${formatBoxOffice(total) ?? "—"} total`;
      topRows = sorted.map(toRow);
    } else if (page === "studio") {
      const idParam = parseInt(searchParams.get("id") ?? "", 10);
      if (Number.isNaN(idParam)) return new Response("Bad id", { status: 400 });
      const data = await getStudioMovies(idParam);
      if (!data.studio) return new Response("Not found", { status: 404 });
      const sorted = data.movies.slice(0, 5);
      const total = data.movies.reduce((acc, m) => acc + (m.revenue ?? 0), 0);
      title = data.studio.name;
      subtitle = `${data.movies.length} films · ${formatBoxOffice(total) ?? "—"} total`;
      topRows = sorted.map(toRow);
    } else {
      // Hub fallback — show top 5 of all time.
      const movies = await getTopGrossing(5);
      topRows = movies.map(toRow);
    }

    const logoSrc = getLogoBase64();

    // OG sizing: keep at 800×520 to match the rest of the project's
    // OG output. Twitter/Facebook accept this fine; the smaller size
    // also keeps the JSX renderer fast and the response size modest.
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
              Box Office
            </span>
          </div>

          {/* Title block. Font size capped on the smaller side so a
              two-line wrap fits inside the 520px canvas alongside 5
              rows + footer; the previous 36px sometimes pushed the
              footer up between the rows. */}
          <span style={{ color: "white", fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginBottom: 6, maxWidth: 700 }}>
            {title.length > 60 ? title.slice(0, 60) + "…" : title}
          </span>
          <span style={{ color: "#888", fontSize: 16, marginBottom: 16 }}>{subtitle}</span>

          {/* Top rows. Each row: rank, mini poster, title, metric.
              Branded variant skips rows entirely — it's the hub
              fallback where no single top-5 list represents the
              destination page. */}
          {/* Rows. No flex:1 — that caused the rows container to
              shrink/overflow when the title wrapped, with the result
              that rows ended up rendered AFTER the footer in some
              cases. Letting rows take their natural height and
              pushing the footer down with marginTop:auto via an empty
              spacer is more robust under Satori. */}
          {topRows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topRows.map((m, i) => {
                const style = m.imageStyle ?? "poster";
                // Sizing per image type. Profile photos get a square
                // box and a circular crop. Studio logos get a wider
                // box with contain-fit on a dark background since
                // logos are usually horizontal and would otherwise
                // get cropped weirdly.
                const imgWidth = style === "logo" ? 56 : style === "profile" ? 36 : 28;
                const imgHeight = style === "logo" || style === "profile" ? 36 : 42;
                const imgRadius = style === "profile" ? 999 : 4;
                const imgFit = style === "logo" ? ("contain" as const) : ("cover" as const);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ color: "#444", fontSize: 16, fontWeight: 800, width: 24, textAlign: "right" as const }}>
                      {i + 1}
                    </span>
                    {m.posterPath ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${m.posterPath}`}
                        width={imgWidth}
                        height={imgHeight}
                        style={{
                          borderRadius: imgRadius,
                          objectFit: imgFit,
                          backgroundColor: style === "logo" ? "#1a1a1a" : "transparent",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          width: imgWidth,
                          height: imgHeight,
                          borderRadius: imgRadius,
                          backgroundColor: "#1a1a1a",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      />
                    )}
                    <span style={{ color: "#ddd", fontSize: 16, fontWeight: 600, flex: 1 }}>
                      {m.title.length > 38 ? m.title.slice(0, 38) + "…" : m.title}
                    </span>
                    <span style={{ color: "#666", fontSize: 13 }}>{m.year}</span>
                    <span style={{ color: "white", fontSize: 16, fontWeight: 800, width: 90, textAlign: "right" as const }}>
                      {m.metric}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : page === "branded" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 60, paddingBottom: 60 }}>
              <span style={{ color: "#ef3b36", fontSize: 16, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>
                Lifetime Box Office
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 60, paddingBottom: 60 }}>
              <span style={{ color: "#444", fontSize: 18 }}>No tracked films yet</span>
            </div>
          )}

          {/* Footer pinned to the bottom regardless of row count or
              wrapped title. The auto top margin consumes whatever
              vertical space remains in the column-flex parent. */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: "auto", paddingTop: 12 }}>
            <span style={{ color: "#333", fontSize: 13 }}>theratist.com / box-office</span>
          </div>
        </div>
      ),
      { width: 800, height: 520 },
    );
  } catch (err) {
    console.error("OG box-office error:", err);
    return new Response(`Error: ${err}`, { status: 500 });
  }
}

function toRow(m: BoxOfficeRow): { title: string; posterPath: string | null; year: string; metric: string } {
  return {
    title: m.title,
    posterPath: m.posterPath,
    year: m.releaseDate?.slice(0, 4) ?? "—",
    metric: formatBoxOffice(m.revenue) ?? "—",
  };
}

// Profit can legitimately be negative — render the loss with a minus
// prefix so the OG image clearly shows "−$200M" type bombs.
function toProfitRow(m: BoxOfficeRow): { title: string; posterPath: string | null; year: string; metric: string } {
  let metric = "—";
  if (m.profit != null) {
    metric = m.profit < 0
      ? `−${formatBoxOffice(Math.abs(m.profit)) ?? ""}`
      : formatBoxOffice(m.profit) ?? "—";
  }
  return {
    title: m.title,
    posterPath: m.posterPath,
    year: m.releaseDate?.slice(0, 4) ?? "—",
    metric,
  };
}

function toROIRow(m: BoxOfficeRow): { title: string; posterPath: string | null; year: string; metric: string } {
  return {
    title: m.title,
    posterPath: m.posterPath,
    year: m.releaseDate?.slice(0, 4) ?? "—",
    metric: formatROI(m.roi) ?? "—",
  };
}

function toBudgetRow(m: BoxOfficeRow): { title: string; posterPath: string | null; year: string; metric: string } {
  return {
    title: m.title,
    posterPath: m.posterPath,
    year: m.releaseDate?.slice(0, 4) ?? "—",
    metric: formatBoxOffice(m.budget) ?? "—",
  };
}

