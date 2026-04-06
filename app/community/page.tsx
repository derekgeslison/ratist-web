import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
export const metadata: Metadata = { title: "Community Hub", description: "Join The Ratist community: submit hot takes, suggest recasts, find celebrity lookalikes, and engage with fellow movie lovers." };
import Link from "next/link";
import Image from "next/image";
import { Users, Sparkles, Trophy, RefreshCw, Flame, Lightbulb, Brain } from "lucide-react";
import AdUnit from "@/components/AdUnit";

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
] as const;

export default async function CommunityPage() {
  let users: { id: string; firebaseUid: string; name: string; avatarUrl: string | null; _count: { ratings: number } }[] = [];
  let fetchError = false;
  try {
    users = await prisma.user.findMany({
      where: { isPrivate: false, deletedAt: null, bannedAt: null },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        avatarUrl: true,
        _count: { select: { ratings: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 24,
    });
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
        {HUB_FEATURES.map(({ href, icon: Icon, title, description, color, border }) => (
          <Link
            key={href}
            href={href}
            className={`group flex flex-col gap-3 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-xl ${border} transition-colors`}
          >
            <Icon className={`w-6 h-6 ${color}`} />
            <div>
              <h2 className={`text-base font-semibold text-white group-hover:${color} transition-colors mb-1`}>{title}</h2>
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{description}</p>
            </div>
          </Link>
        ))}
      </div>

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
