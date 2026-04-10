import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import {
  getAllBadgeDefs,
  computeTier,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
} from "@/lib/badges";
import { TOTAL_BADGES } from "@/lib/badge-defs";
import BadgeGrid from "@/components/BadgeGrid";
import AdUnit from "@/components/AdUnit";

interface Props {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true },
  });
  if (!user) return { title: "Badges" };
  return {
    title: `${user.name}'s Badges — The Ratist`,
    description: `View ${user.name}'s badge collection on The Ratist`,
  };
}

export default async function BadgesPage({ params }: Props) {
  const { userId } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { id: true, name: true, firebaseUid: true, isPrivate: true, deletedAt: true },
  });

  if (!user || user.deletedAt) notFound();

  const earned = await prisma.userBadge.findMany({
    where: { userId: user.id },
    select: { slug: true, earnedAt: true },
    orderBy: { earnedAt: "desc" },
  });
  const earnedMap = new Map(earned.map((e) => [e.slug, e.earnedAt]));

  const allDefs = getAllBadgeDefs();
  const badges = allDefs.map((def) => ({
    ...def,
    earned: earnedMap.has(def.slug),
    earnedAt: earnedMap.get(def.slug)?.toISOString() ?? null,
  }));

  const tier = computeTier(earned.length);
  const categories = CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] }));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/profile/${user.firebaseUid}`}
          className="flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {user.name}
        </Link>
        <span className="text-[var(--foreground-muted)]">/</span>
        <h1 className="text-lg font-bold text-[var(--foreground)]">Badges</h1>
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE ?? ""} format="auto" className="mb-4" />

      <BadgeGrid
        badges={badges}
        categories={categories}
        tier={tier}
        earnedCount={earned.length}
        totalCount={TOTAL_BADGES}
      />
    </div>
  );
}
