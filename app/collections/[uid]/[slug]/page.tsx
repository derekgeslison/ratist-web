import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import CollectionDetailClient from "./CollectionDetailClient";

export const dynamic = "force-dynamic";

interface RouteParams {
  uid: string;
  slug: string;
}

interface Props {
  params: Promise<RouteParams>;
}

const SITE_BASE = "https://www.theratist.com";

// Server-side fetch shared by generateMetadata + the page render so we
// don't double-query Postgres on every request. Returns null when the
// curator/collection isn't published or doesn't exist.
async function loadPublicCollection(uid: string, slug: string) {
  const curator = await prisma.user.findUnique({
    where: { firebaseUid: uid },
    select: { id: true, name: true, firebaseUid: true, avatarUrl: true, isAdmin: true, bio: true },
  });
  if (!curator) return null;
  const collection = await prisma.customCollection.findFirst({
    where: {
      userId: curator.id,
      slug,
      visibility: "public",
      publishedAt: { not: null },
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      tags:  { orderBy: { tag: "asc" }, select: { tag: true } },
      themePrompt: { select: { id: true, title: true } },
    },
  });
  if (!collection) return null;

  // Enrich each item with overview + the live vote_average from
  // Movie/TVShow tables. CustomCollectionItem stores a snapshot of the
  // rating at add-time and many older rows have it null/0 — that's why
  // the community star badge was rendering blank on the cards.
  const movieTmdbIds = collection.items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId);
  const tvTmdbIds    = collection.items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);
  const [movieRows, tvRows] = await Promise.all([
    movieTmdbIds.length > 0
      ? prisma.movie.findMany({
          where: { tmdbId: { in: movieTmdbIds } },
          select: { tmdbId: true, overview: true, voteAverage: true },
        })
      : Promise.resolve([]),
    tvTmdbIds.length > 0
      ? prisma.tVShow.findMany({
          where: { tmdbId: { in: tvTmdbIds } },
          select: { tmdbId: true, overview: true, voteAverage: true },
        })
      : Promise.resolve([]),
  ]);
  const movieEnrich = new Map(movieRows.map((m) => [m.tmdbId, { overview: m.overview, voteAverage: m.voteAverage }]));
  const tvEnrich = new Map(tvRows.map((s) => [s.tmdbId, { overview: s.overview, voteAverage: s.voteAverage }]));
  const enrichByItem = new Map<string, { overview: string | null; voteAverage: number | null }>();
  for (const item of collection.items) {
    const map = item.mediaType === "tv" ? tvEnrich : movieEnrich;
    enrichByItem.set(item.id, map.get(item.tmdbId) ?? { overview: null, voteAverage: null });
  }

  return { curator, collection, enrichByItem };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid, slug } = await params;
  const data = await loadPublicCollection(uid, slug);
  if (!data) return { title: "Collection not found" };

  const { curator, collection } = data;
  const attribution = collection.isOfficial ? "The Ratist" : curator.name;
  const title = `${collection.name} — ${attribution}`;
  const description = collection.description ??
    `A curated collection of ${collection.items.length} title${collection.items.length === 1 ? "" : "s"} by ${attribution} on The Ratist.`;
  const canonical = `/collections/${uid}/${slug}`;
  // OG image: prefer the explicit cover, fall back to the first item's
  // poster. Either way we get a recognizable preview when shared.
  const firstPoster = collection.items.find((i) => i.posterPath)?.posterPath ?? null;
  const ogImage = collection.coverPath
    ? posterUrl(collection.coverPath, "w780")
    : firstPoster
      ? posterUrl(firstPoster, "w780")
      : null;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${SITE_BASE}${canonical}`,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function CollectionDetailPage({ params }: Props) {
  const { uid, slug } = await params;
  const data = await loadPublicCollection(uid, slug);
  if (!data) notFound();

  // Fire-and-forget view counter — avoids blocking the render. Owners
  // viewing their own collection don't inflate the count.
  // (Owner check has to happen client-side since we don't know the
  // viewer's user ID at server-render time without auth — the existing
  // /api endpoint does that correctly when the client refetches.)

  const { curator, collection } = data;

  // Build the initial-data payload in the same shape the client API
  // returns. Viewer-specific fields (isOwner, isSaved, matchScore,
  // watched, predictedRating per item) start unset and the client
  // refetches to fill them when an authed Backstage user is on the page.
  const enrichMap = data.enrichByItem;
  const initialData = {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    slug: collection.slug as string,
    mediaType: collection.mediaType,
    coverPath: collection.coverPath,
    saveCount: collection.saveCount,
    viewCount: collection.viewCount,
    publishedAt: collection.publishedAt?.toISOString() ?? null,
    tags: collection.tags.map((t) => t.tag),
    items: collection.items.map((i) => {
      const live = enrichMap.get(i.id);
      return {
        id: i.id,
        mediaType: i.mediaType as "movie" | "tv",
        tmdbId: i.tmdbId,
        title: i.title,
        posterPath: i.posterPath,
        releaseDate: i.releaseDate,
        // Prefer the live vote_average from Movie/TVShow over the
        // CustomCollectionItem snapshot — older items often have null
        // voteAverage which made the star badge render blank.
        voteAverage: live?.voteAverage ?? i.voteAverage,
        sortOrder: i.sortOrder,
        blurb: i.blurb,
        overview: live?.overview ?? "",
        curatorRating: null,
        predictedRating: null,
      };
    }),
    curator: {
      id: curator.id,
      name: curator.name,
      firebaseUid: curator.firebaseUid,
      avatarUrl: curator.avatarUrl,
      isAdmin: curator.isAdmin,
      bio: curator.bio,
    },
    isOwner: false,
    isSaved: false,
    isOfficial: collection.isOfficial,
    numberedOrder: collection.numberedOrder,
    themePromptId: collection.themePromptId,
    themePrompt: collection.themePrompt ? { id: collection.themePrompt.id, title: collection.themePrompt.title } : null,
    matchScore: null,
    watched: null,
  };

  // ItemList structured data — gives Google a clean ordered roster of
  // titles in the collection so rich results can surface them.
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: collection.name,
    description: collection.description ?? undefined,
    numberOfItems: collection.items.length,
    url: `${SITE_BASE}/collections/${uid}/${slug}`,
    itemListOrder: collection.numberedOrder ? "https://schema.org/ItemListOrderAscending" : "https://schema.org/ItemListUnordered",
    itemListElement: collection.items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": item.mediaType === "tv" ? "TVSeries" : "Movie",
        name: item.title,
        ...(item.releaseDate ? { datePublished: item.releaseDate } : {}),
        ...(item.posterPath ? { image: posterUrl(item.posterPath, "w500") } : {}),
      },
    })),
  };

  // Breadcrumb: site → tools/collections → this collection.
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Collections", item: `${SITE_BASE}/tools/collections` },
      { "@type": "ListItem", position: 2, name: collection.name, item: `${SITE_BASE}/collections/${uid}/${slug}` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <CollectionDetailClient initialData={initialData} uid={uid} slug={slug} />
    </>
  );
}
