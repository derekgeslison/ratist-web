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
  formatDateYMD,
} from "@/lib/box-office-queries";
import { formatBoxOffice, formatROI, type BoxOfficeRow } from "@/lib/box-office";

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
 *   - branded  (?title=…&subtitle=…)   aggregation hubs (no rows)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "hub";

  try {
    let title = "Box Office Insights";
    let subtitle = "Lifetime grosses, profits, and ROI";
    let topRows: Array<{ title: string; posterPath: string | null; year: string; metric: string }> = [];

    if (page === "topGrossing") {
      title = "Top Grossing of All Time";
      subtitle = "Lifetime worldwide gross";
      topRows = (await getTopGrossing(5)).map(toRow);
    } else if (page === "topProfit") {
      title = "Biggest Profit of All Time";
      subtitle = "Lifetime gross minus production budget";
      topRows = (await getTopProfit(5)).map(toProfitRow);
    } else if (page === "bestROI") {
      title = "Best Return on Investment";
      subtitle = "Revenue ÷ budget · min $100K";
      topRows = (await getROIRanking("best", 5)).map(toROIRow);
    } else if (page === "worstROI") {
      title = "Biggest Box Office Bombs";
      subtitle = "Worst ROI · min $100K budget";
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

          {/* Title block */}
          <span style={{ color: "white", fontSize: 36, fontWeight: 800, lineHeight: 1.1, marginBottom: 6, maxWidth: 700 }}>
            {title.length > 50 ? title.slice(0, 50) + "…" : title}
          </span>
          <span style={{ color: "#888", fontSize: 16, marginBottom: 22 }}>{subtitle}</span>

          {/* Top rows. Each row: rank, mini poster, title, metric.
              Branded variant skips rows entirely — it's the hub
              fallback where no single top-5 list represents the
              destination page. */}
          {topRows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {topRows.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ color: "#444", fontSize: 18, fontWeight: 800, width: 24, textAlign: "right" as const }}>
                    {i + 1}
                  </span>
                  {m.posterPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${m.posterPath}`}
                      width={32}
                      height={48}
                      style={{ borderRadius: 4, objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        width: 32,
                        height: 48,
                        borderRadius: 4,
                        backgroundColor: "#1a1a1a",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    />
                  )}
                  <span style={{ color: "#ddd", fontSize: 18, fontWeight: 600, flex: 1 }}>
                    {m.title.length > 38 ? m.title.slice(0, 38) + "…" : m.title}
                  </span>
                  <span style={{ color: "#666", fontSize: 14 }}>{m.year}</span>
                  <span style={{ color: "white", fontSize: 18, fontWeight: 800, width: 90, textAlign: "right" as const }}>
                    {m.metric}
                  </span>
                </div>
              ))}
            </div>
          ) : page === "branded" ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
              <span style={{ color: "#ef3b36", fontSize: 16, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" as const }}>
                Lifetime Box Office
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#444", fontSize: 18 }}>No tracked films yet</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
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

