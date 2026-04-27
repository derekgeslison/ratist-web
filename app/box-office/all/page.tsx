import type { Metadata } from "next";
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

  return <BoxOfficeListClient genres={genres} />;
}
