import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import BoxOfficeListClient from "./BoxOfficeListClient";

export const metadata: Metadata = {
  title: "All Box Office Data — Filterable",
  description:
    "Filter and sort every movie tracked on The Ratist by box office revenue, budget, profit, and ROI. Filter by genre, MPA rating, and release date.",
  alternates: { canonical: "/box-office/all" },
};

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
