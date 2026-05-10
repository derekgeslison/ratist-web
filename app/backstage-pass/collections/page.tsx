import type { Metadata } from "next";
import path from "node:path";
import fs from "node:fs";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, Ticket, Compass, Hammer,
  Users, Layers, BookmarkPlus, MessageSquare,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import BackstagePassCTA from "@/components/BackstagePassCTA";

export const metadata: Metadata = {
  title: "Collections — Backstage Pass",
  description: "Curated film lists from admins, the community, and people you follow — each scored against your personal taste so you spot what's actually worth your time.",
  alternates: { canonical: "/backstage-pass/collections" },
};

export const dynamic = "force-dynamic";

interface Asset { src: string; w: number; h: number }
const ASSETS: { detail: Asset; feed: Asset } = {
  detail: { src: "/backstage-pass/collections-detail.png", w: 1485, h: 922 },
  feed:   { src: "/backstage-pass/collections-feed.png",   w: 1476, h: 1156 },
};

function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: Compass,      title: "Personalized match scores",  desc: "Every collection scored against your viewing data — the higher the %, the closer to your wheelhouse." },
  { icon: Sparkles,     title: "Featured curation",          desc: "Admin-curated collections built around themes, eras, sub-genres, sagas, and watch orders." },
  { icon: Users,        title: "Community feed",             desc: "Public collections from other curators — sortable by match, popular, or fresh." },
  { icon: Hammer,       title: "Build your own",             desc: "Pick a theme, search films in, drop blurbs explaining each pick. Publish or keep private." },
  { icon: BookmarkPlus, title: "Save what you love",         desc: "Bookmark collections to revisit later. Save count and your saves persist across devices." },
  { icon: MessageSquare,title: "Discuss inline",             desc: "Comment on community collections — debate the order, suggest the missing pick, recommend an alt." },
];

interface FeaturedCollection {
  id: string;
  slug: string | null;
  name: string;
  coverPath: string | null;
  itemCount: number;
  saveCount: number;
  posters: string[]; // up to 4 thumbnails for the cover-fallback grid
  curatorUid: string;
}

export default async function CollectionsFeaturePage() {
  // Real public featured collections, with up to 4 item posters each
  // for the cover-fallback grid. isOfficial-only here — community
  // curation gets surfaced via the feed screenshot below the
  // featured row.
  const rows = await prisma.customCollection.findMany({
    where: { visibility: "public", publishedAt: { not: null }, isOfficial: true },
    orderBy: { publishedAt: "desc" },
    take: 6,
    include: {
      items: {
        take: 4,
        orderBy: { sortOrder: "asc" },
        select: { posterPath: true },
      },
      user: { select: { firebaseUid: true } },
      _count: { select: { items: true, saves: true } },
    },
  }).catch(() => []);

  const featured: FeaturedCollection[] = rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    coverPath: c.coverPath,
    itemCount: c._count.items,
    saveCount: c.saveCount,
    posters: c.items.map((i) => i.posterPath).filter((p): p is string => !!p),
    curatorUid: c.user.firebaseUid,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href="/backstage-pass"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-amber-400 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Backstage Pass
      </Link>

      {/* Identity row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/10 border border-amber-400/30">
            <Layers className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">Collections</h1>
            <p className="text-xs text-[var(--foreground-muted)]">Curated lists, scored against your taste.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 rounded-full px-2.5 py-1">
          <Ticket className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pass</span>
        </span>
      </div>

      {/* ── Hero — a real collection on its detail page ───────────── */}
      <section className="mb-10">
        <AssetFrame asset={ASSETS.detail} kind="image" alt="A featured collection with its match score" />
      </section>

      {/* ── The Match Score — page's signature visual ───────────────
          Every other list-based platform has lists. Ratist Collections
          have lists scored against you. This block makes that
          concrete before the user has any data of their own. CSS-
          rendered with illustrative numbers, no captures needed. */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">The match score</p>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Every collection lands with a percentage from 0 to 100 — how closely its picks line up with what you actually watch and rate. The higher the number, the harder it is to ignore.</p>
        <MatchScoreSample />
      </section>

      {/* ── Live featured collections ──────────────────────────────
          Real isOfficial=true rows from the DB. Anchors the page in
          actual curation rather than evergreen marketing copy. Hides
          gracefully when none exist yet so the page never renders an
          empty section header on early-days deploys. */}
      {featured.length > 0 && (
        <section className="mb-10">
          <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">Featured right now</p>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">A taste of what&apos;s already on the shelf — admin-curated with a Ratist seal.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {featured.slice(0, 4).map((c) => <FeaturedCard key={c.id} c={c} />)}
          </div>
        </section>
      )}

      {/* ── Community feed screenshot ─────────────────────────────── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">Browse the community shelf</p>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Sort by match for picks tuned to you, by popular for the ones the community keeps coming back to, or by fresh for what just dropped.</p>
        <AssetFrame asset={ASSETS.feed} kind="image" alt="The Collections community feed" />
      </section>

      {/* ── Feature list ──────────────────────────────────────────── */}
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">What you can do</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-amber-400/10 border border-amber-400/20 shrink-0">
                  <Icon className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)] leading-snug mt-0.5">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <BackstagePassCTA featureName="Collections" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Match Score Sample — a donut at 92% with three contributing-factor
// bars on the right. Numbers and copy are illustrative; anonymous
// marketing-page viewers don't have a real match yet, this just
// makes the concept concrete.
// ──────────────────────────────────────────────────────────────────

function MatchScoreSample() {
  const score = 92;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  const factors: { label: string; pct: number }[] = [
    { label: "Heavy on your top genres",                  pct: 95 },
    { label: "Hits your favorite decades",                pct: 88 },
    { label: "Built around directors you rate high",      pct: 81 },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
        {/* Donut */}
        <div className="relative shrink-0 w-28 h-28">
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
            <circle
              cx="56" cy="56" r={radius}
              fill="none"
              stroke="rgb(251 191 36)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-amber-400 leading-none">{score}<span className="text-base">%</span></span>
            <span className="text-[9px] text-[var(--foreground-muted)] uppercase tracking-wider mt-0.5">match</span>
          </div>
        </div>

        {/* Factors */}
        <div className="flex-1 w-full space-y-2.5">
          {factors.map((f) => (
            <div key={f.label}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-white">{f.label}</p>
                <p className="text-[10px] font-semibold text-amber-400 tabular-nums">{f.pct}%</p>
              </div>
              <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                <div className="h-full bg-amber-400/70 rounded-full" style={{ width: `${f.pct}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-[var(--foreground-muted)] italic pt-1">Sample numbers — your real match scores update as you rate more films.</p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// FeaturedCard — a real collection. Cover image when available,
// otherwise a 2x2 grid of the first four item posters.
// ──────────────────────────────────────────────────────────────────

function FeaturedCard({ c }: { c: FeaturedCollection }) {
  const href = c.slug ? `/collections/${c.curatorUid}/${c.slug}` : `#`;
  const hasCover = !!c.coverPath;
  return (
    <Link
      href={href}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-amber-400/50 transition-colors group flex flex-col"
    >
      <div className="relative aspect-video bg-[var(--surface-2)]">
        {hasCover ? (
          <Image
            src={posterUrl(c.coverPath!, "w500")}
            alt={c.name}
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="object-cover"
          />
        ) : (
          <PosterCollage posters={c.posters} />
        )}
        <div className="absolute top-2 right-2 inline-flex items-center gap-1 bg-amber-400/15 border border-amber-400/40 backdrop-blur-sm rounded-full px-2 py-0.5">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Featured</span>
        </div>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">{c.name}</p>
        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[var(--foreground-muted)] flex-wrap">
          <span>Curated by Ratist</span>
          <span>·</span>
          <span>{c.itemCount} title{c.itemCount === 1 ? "" : "s"}</span>
          {c.saveCount > 0 && (
            <>
              <span>·</span>
              <span>{c.saveCount.toLocaleString()} save{c.saveCount === 1 ? "" : "s"}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

// PosterCollage — 2x2 fallback when a collection has no coverPath.
// Uses up to 4 item posters; pads with placeholder cells when the
// collection has fewer than 4 items so the layout stays consistent.
function PosterCollage({ posters }: { posters: string[] }) {
  const cells = Array.from({ length: 4 }, (_, i) => posters[i] ?? null);
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[var(--border)]">
      {cells.map((p, i) => (
        <div key={i} className="relative bg-[var(--surface-2)]">
          {p ? (
            <Image src={posterUrl(p, "w185")} alt="" fill sizes="160px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Layers className="w-4 h-4 text-[var(--foreground-muted)] opacity-30" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// AssetFrame — same as the rest of the Pass set.
// ──────────────────────────────────────────────────────────────────

function AssetFrame({
  asset, kind, alt,
}: {
  asset: Asset;
  kind: "image" | "gif";
  alt: string;
}) {
  const exists = imageExists(asset.src);
  const filename = asset.src.split("/").pop();
  if (exists) {
    return (
      <Image
        src={asset.src}
        alt={alt}
        width={asset.w}
        height={asset.h}
        sizes="(max-width: 640px) 100vw, 672px"
        className="w-full h-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
        unoptimized={kind === "gif"}
      />
    );
  }
  return (
    <div
      className="relative w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col items-center justify-center text-center px-4"
      style={{ aspectRatio: `${asset.w} / ${asset.h}` }}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-1">
        {kind === "gif" ? "GIF goes here" : "Image goes here"}
      </p>
      <p className="text-[10px] text-[var(--foreground-muted)] leading-snug break-all">
        <code className="text-[var(--foreground-muted)]">{filename}</code>
      </p>
    </div>
  );
}
