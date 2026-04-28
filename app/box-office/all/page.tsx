import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import BoxOfficeListClient from "./BoxOfficeListClient";

interface PageProps {
  searchParams: Promise<{ sort?: string; genres?: string; mpa?: string; languages?: string; releaseFrom?: string; releaseTo?: string }>;
}

/**
 * Per-sort OG image dispatch. The /box-office landing tiles each
 * link to /all with a specific `sort` filter via "View all →"; this
 * map gives those URLs distinct OG previews when shared. Only fires
 * for the bare-sort cases (no extra filters) — once filters narrow
 * the cohort, the share would no longer match the OG label, so we
 * fall back to the generic hub OG instead.
 */
const SORT_OG_MAP: Record<string, { ogPage: string; title: string; description: string }> = {
  "revenue-desc": {
    ogPage: "topGrossing",
    title: "Top Grossing Movies of All Time",
    description: "The highest-grossing movies of all time, ranked by lifetime worldwide gross.",
  },
  "profit-desc": {
    ogPage: "topProfit",
    title: "Biggest Profit of All Time",
    description: "Movies with the largest profit (revenue minus budget) in box-office history.",
  },
  "roi-desc": {
    ogPage: "bestROI",
    title: "Best Return on Investment",
    description: "Movies with the highest ROI (revenue divided by budget). Minimum $100K budget.",
  },
  "roi-asc": {
    ogPage: "worstROI",
    title: "Biggest Box Office Bombs",
    description: "Movies with the worst ROI in box-office history. Minimum $100K budget.",
  },
  "budget-desc": {
    ogPage: "highestBudget",
    title: "Highest Production Budgets",
    description: "The most expensive films ever made by production budget.",
  },
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  // Only switch metadata when the URL is a "pure sort" view — any
  // genre/MPA/language/date filter narrows the cohort, so the OG
  // wouldn't actually represent what's on the page anymore.
  const sort = sp.sort ?? "revenue-desc";
  const hasOtherFilters = !!(sp.genres || sp.mpa || sp.languages || sp.releaseFrom || sp.releaseTo);
  const variant = !hasOtherFilters ? SORT_OG_MAP[sort] : undefined;

  if (variant) {
    return {
      title: variant.title,
      description: variant.description,
      alternates: { canonical: `/box-office/all?sort=${sort}` },
      openGraph: {
        title: variant.title,
        description: variant.description,
        images: [{ url: `/api/og/box-office?page=${variant.ogPage}`, width: 800, height: 520 }],
      },
    };
  }

  return {
    title: "All Box Office Data — Filterable",
    description:
      "Filter and sort every movie tracked on The Ratist by box office revenue, budget, profit, and ROI. Filter by genre, MPA rating, and release date.",
    alternates: { canonical: "/box-office/all" },
    openGraph: {
      title: "Box Office Insights — Filterable List",
      description: "Filter and sort every tracked film by box office revenue, budget, profit, and ROI.",
      images: [{ url: "/api/og/box-office", width: 800, height: 520 }],
    },
  };
}

export default async function BoxOfficeAllPage() {
  // Genres are static once seeded — fetch them server-side and hand
  // off to the client. Same approach as /movies, avoids a hydration
  // round-trip just to populate the filter dropdown.
  const genres = await prisma.genre.findMany({
    where: { movies: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Suspense boundary required for useSearchParams in the client child
  // — without it, Next.js's static-export pass refuses to prerender
  // because useSearchParams reads request-scoped data. The fallback
  // mirrors the eventual page header so layout doesn't shift on
  // hydration.
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-sm text-[var(--foreground-muted)]">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading filters…
        </div>
      }
    >
      <BoxOfficeListClient genres={genres} />
    </Suspense>
  );
}
