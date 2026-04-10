import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
export const metadata: Metadata = { title: "Community Hub", description: "Join The Ratist community: submit hot takes, suggest recasts, find celebrity lookalikes, and engage with fellow movie lovers." };
import Link from "next/link";
import Image from "next/image";
import { Users, Sparkles, Trophy, RefreshCw, Flame, Lightbulb, Brain, Clapperboard, MessageSquare } from "lucide-react";
import AdUnit from "@/components/AdUnit";
import BackstagePassBadge from "@/components/BackstagePassBadge";

export const dynamic = "force-dynamic";

const HUB_FEATURES = [
  {
    href: "/community/looks-like",
    icon: Sparkles,
    title: "Looks Like",
    description: "Celebrity lookalike pairs — vote on who could be twins.",
    color: "text-purple-400",
    border: "hover:border-purple-400",
  },
  {
    href: "/community/oscar-picks",
    icon: Trophy,
    title: "Oscar Picks",
    description: "Vote for your picks before the ceremony. See how the community compares to the real winners.",
    color: "text-yellow-400",
    border: "hover:border-yellow-400",
  },
  {
    href: "/community/recast",
    icon: RefreshCw,
    title: "Recast",
    description: "Who should have played that role? Submit your ideal recast and vote on others.",
    color: "text-blue-400",
    border: "hover:border-blue-400",
  },
  {
    href: "/community/hot-takes",
    icon: Flame,
    title: "Hot Takes",
    description: "Share your spiciest movie opinions. The community decides: hot or not.",
    color: "text-orange-400",
    border: "hover:border-orange-400",
  },
  {
    href: "/community/pitches",
    icon: Lightbulb,
    title: "Pitches",
    description: "Pitch your original movie or TV show ideas. The community votes on what they'd watch.",
    color: "text-emerald-400",
    border: "hover:border-emerald-400",
  },
  {
    href: "/community/cineq",
    icon: Brain,
    title: "Cine-Q",
    description: "Timed movie & TV trivia — clues drip in, guess fast for more points. Daily challenges & leaderboards.",
    color: "text-pink-400",
    border: "hover:border-pink-400",
  },
  {
    href: "/forum",
    icon: MessageSquare,
    title: "Forums",
    description: "Discuss movies and shows, share theories, run polls, and debate with the community.",
    color: "text-cyan-400",
    border: "hover:border-cyan-400",
  },
  {
    href: "/community/movie-club",
    icon: Clapperboard,
    title: "Movie Club",
    description: "Watch a new movie each week with the community. Rate it, discuss it, compare your takes.",
    color: "text-[var(--ratist-red)]",
    border: "hover:border-[var(--ratist-red)]",
    premium: true,
  },
] as const;

function getPacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export default async function CommunityPage() {
  // Fetch today's Cine-Q leader
  let cineqLeader: { name: string; avatarUrl: string | null; firebaseUid: string; score: number; difficulty: string } | null = null;
  try {
    const today = getPacificDate();
    const todayDailies = await prisma.cineQDaily.findMany({ where: { date: today }, select: { id: true } });
    if (todayDailies.length > 0) {
      const dailyIds = todayDailies.map((d) => d.id);
      const topResults = await prisma.$queryRaw<{ firebase_uid: string; name: string; avatar_url: string | null; weighted_score: number; difficulty: string }[]>`
        SELECT u.firebase_uid, u.name, u.avatar_url,
          a.raw_score * CASE a.difficulty WHEN 'hard' THEN 2.0 WHEN 'medium' THEN 1.5 ELSE 1.0 END as weighted_score,
          a.difficulty
        FROM cineq_attempts a
        JOIN users u ON u.id = a.user_id
        WHERE a.daily_id = ANY(${dailyIds})
          AND a.status = 'completed'
        ORDER BY weighted_score DESC
        LIMIT 1
      `;
      if (topResults.length > 0) {
        const top = topResults[0];
        cineqLeader = { name: top.name, avatarUrl: top.avatar_url, firebaseUid: top.firebase_uid, score: Math.round(top.weighted_score * 10) / 10, difficulty: top.difficulty };
      }
    }
  } catch { /* ignore */ }

  let users: { id: string; firebaseUid: string; name: string; avatarUrl: string | null; _count: { ratings: number } }[] = [];
  let fetchError = false;
  try {
    const userSelect = {
      id: true, firebaseUid: true, name: true, avatarUrl: true,
      _count: { select: { ratings: true } },
    } as const;
    const userWhere = { isPrivate: false, deletedAt: null, bannedAt: null };
    // Mix: top 12 by rating count + 12 newest, deduped
    const [topRaters, newest] = await Promise.all([
      prisma.user.findMany({ where: userWhere, select: userSelect, orderBy: { ratings: { _count: "desc" } }, take: 12 }),
      prisma.user.findMany({ where: userWhere, select: userSelect, orderBy: { createdAt: "desc" }, take: 12 }),
    ]);
    const seen = new Set<string>();
    for (const u of [...topRaters, ...newest]) {
      if (!seen.has(u.id)) { seen.add(u.id); users.push(u); }
    }
  } catch {
    fetchError = true;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Users className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Community Hub</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-10">Where Ratist members argue, vote, and get weird about movies.</p>

      {/* Feature Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
        {HUB_FEATURES.map((feature) => {
          const { href, icon: Icon, title, description, color, border } = feature;
          const isPremium = "premium" in feature && (feature as { premium?: boolean }).premium;
          return (
          <Link
            key={href}
            href={href}
            className={`group flex flex-col gap-3 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-xl ${border} transition-colors`}
          >
            <div className="flex items-center justify-between">
              <Icon className={`w-6 h-6 ${color}`} />
              {isPremium && <BackstagePassBadge />}
            </div>
            <div>
              <h2 className={`text-base font-semibold text-white group-hover:${color} transition-colors mb-1`}>{title}</h2>
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{description}</p>
            </div>
          </Link>
        ); })}
      </div>

      {/* Cine-Q Daily Leader */}
      {cineqLeader && (
        <div className="bg-[var(--surface)] border border-pink-400/30 rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-5 h-5 text-pink-400" />
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">Today&apos;s Cine-Q Leader</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {cineqLeader.avatarUrl && (
                <Image src={cineqLeader.avatarUrl} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <Link href={`/profile/${cineqLeader.firebaseUid}`} className="text-sm font-semibold text-white hover:text-pink-400 block truncate">{cineqLeader.name}</Link>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-pink-400">{cineqLeader.score.toFixed(1)} pts</span>
                  <span className="text-xs text-[var(--foreground-muted)] capitalize">({cineqLeader.difficulty})</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Link href="/community/cineq" className="text-xs text-pink-400 hover:underline">
                Play Cine-Q →
              </Link>
              <Link href="/community/cineq/leaderboard" className="text-xs text-[var(--foreground-muted)] hover:text-pink-400 transition-colors">
                Leaderboard →
              </Link>
            </div>
          </div>
        </div>
      )}

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-8" />

      {/* Members */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Members</h2>
        {fetchError ? (
          <div className="text-center py-20 text-red-400">
            <p>Something went wrong loading members. Please try again later.</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-[var(--foreground-muted)]">
            <p>No community members yet. Be the first to sign up!</p>
            <Link href="/auth/signin" className="mt-4 inline-block text-[var(--ratist-red)] hover:underline">Join now →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/profile/${user.firebaseUid}`}
                className="flex flex-col items-center gap-2 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--ratist-red)] transition-colors text-center group"
              >
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
                  {user.avatarUrl ? (
                    <Image src={user.avatarUrl} alt={user.name} fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white bg-[var(--ratist-red)]">
                      {(user.name || "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{user.name}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{user._count.ratings} rated</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
