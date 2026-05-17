import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
export const dynamic = "force-dynamic";
import Image from "next/image";
import ProfileHeader from "@/components/ProfileHeader";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import ProfileThemeWrapper from "@/components/ProfileThemeWrapper";
import ProfileThemeButton from "@/components/ProfileThemeButton";
import ProfileTabsLoader from "@/components/profile/ProfileTabsLoader";
import ProfileTabsSkeleton from "@/components/profile/ProfileTabsSkeleton";
import AdUnit from "@/components/AdUnit";
import NavEntryRegister from "@/components/NavEntryRegister";
import type { ProfileTheme } from "@/lib/themes";

interface Props { params: Promise<{ userId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true, bio: true, firebaseUid: true, profileTheme: true },
  });
  if (!user) return { title: "Profile" };
  const description = user.bio ?? `${user.name}'s movie and TV ratings on The Ratist`;
  const ogImage = `https://www.theratist.com/api/og/profile?userId=${user.firebaseUid}`;
  return {
    title: user.name,
    description,
    alternates: { canonical: `/profile/${userId}` },
    openGraph: {
      title: `${user.name} — The Ratist`,
      description,
      images: [{ url: ogImage, width: 800, height: 420 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${user.name} — The Ratist`,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    include: { profile: true },
  });

  if (!user || user.deletedAt) notFound();

  // Resolve the current viewer from the __session cookie so we can
  // gate private profiles BEFORE fetching their data. Without this
  // server-side gate, the big Promise.all below runs unconditionally
  // and ships every rating / watchlist / diary / ranking the user has
  // ever logged into the page response — even when `isPrivate` is set.
  // (Next.js serializes client-component props into the response
  // payload; `ProfileTabs.tsx`'s tab-visibility filter happens client-
  // side AFTER that payload is already on the wire.)
  let viewerId: string | null = null;
  let viewerIsAdmin = false;
  try {
    const token = (await cookies()).get("__session")?.value;
    if (token) {
      const decoded = await adminAuth.verifyIdToken(token);
      const viewer = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: { id: true, isAdmin: true, deletedAt: true, bannedAt: true },
      });
      // Banned / soft-deleted viewers fall through as anonymous.
      if (viewer && !viewer.deletedAt && !viewer.bannedAt) {
        viewerId = viewer.id;
        viewerIsAdmin = viewer.isAdmin;
      }
    }
  } catch { /* invalid token = anonymous */ }

  const isOwner = viewerId === user.id;

  // Private-profile gate: if the owner has isPrivate set and the viewer
  // is not the owner/admin/accepted-follower, render the minimal
  // private stub and stop. No data fetches, no payload leak.
  let isAcceptedFollower = false;
  if (user.isPrivate && !isOwner && !viewerIsAdmin && viewerId) {
    const follow = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
      select: { status: true },
    });
    isAcceptedFollower = follow?.status === "accepted";
  }
  const canSeeFullProfile = !user.isPrivate || isOwner || viewerIsAdmin || isAcceptedFollower;

  if (!canSeeFullProfile) {
    const [followerCount, followingCount] = await Promise.all([
      prisma.userFollow.count({ where: { followingId: user.id, status: "accepted" } }),
      prisma.userFollow.count({ where: { followerId: user.id, status: "accepted" } }),
    ]);
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="sr-only">{user.name} — The Ratist</h1>
        <div className="relative w-24 h-24 mx-auto mb-5 rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)]">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.name} fill sizes="96px" className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white bg-[var(--ratist-red)]">
              {user.name[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">{user.name}</h2>
        {user.bio && <p className="text-sm text-[var(--foreground-muted)] mb-4 max-w-md mx-auto">{user.bio}</p>}
        <div className="flex items-center justify-center gap-5 text-sm text-[var(--foreground-muted)] mb-8">
          <span><strong className="text-white">{followerCount.toLocaleString()}</strong> follower{followerCount === 1 ? "" : "s"}</span>
          <span><strong className="text-white">{followingCount.toLocaleString()}</strong> following</span>
        </div>
        <div className="inline-block bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-md">
          <p className="text-base font-semibold text-white mb-2">This profile is private</p>
          <p className="text-sm text-[var(--foreground-muted)] mb-5">
            {viewerId
              ? `Follow ${user.name} to see their ratings, watchlists, and activity. They'll need to approve your request.`
              : `Sign in and follow ${user.name} to see their ratings, watchlists, and activity.`}
          </p>
          {viewerId ? (
            <Link
              href={`/profile/${user.firebaseUid}#follow`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full text-sm transition-colors"
            >
              Request to follow
            </Link>
          ) : (
            <Link
              href={`/auth/signin?redirect=${encodeURIComponent(`/profile/${user.firebaseUid}`)}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full text-sm transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Fast-path: just the cheap counts + aggregate needed to render the
  // profile header. The heavy per-tab payload (ratings, watchlists,
  // rankings, episodes, similar users, recommendations) streams in
  // behind a Suspense boundary via ProfileTabsLoader. Without this
  // split, the page blocks on a 16-query Promise.all before any HTML
  // ships — slow connections see a blank screen for several seconds.
  const [
    ratingCount,
    tvRatingCount,
    seenCount,
    tvSeenCount,
    watchlistCount,
    forumThreadCount,
    avgRatingAgg,
  ] = await Promise.all([
    prisma.movieRating.count({ where: { userId: user.id } }),
    prisma.tVShowRating.count({ where: { userId: user.id, ratingScope: "series" } }),
    prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
    prisma.userFavoriteShow.count({ where: { userId: user.id } }),
    prisma.watchlistMovie.count({
      where: { watchlist: { userId: user.id, isDefault: true } },
    }),
    prisma.forumThread.count({ where: { authorId: user.id } }),
    prisma.movieRating.aggregate({
      where: { userId: user.id, ratistRating: { not: null } },
      _avg: { ratistRating: true },
    }),
  ]);
  const avgRatingValue = avgRatingAgg._avg.ratistRating;

  const theme = (user.profileTheme as ProfileTheme | null) ?? null;

  return (
    <ProfileThemeWrapper theme={theme}>
    <div>
      {/* Register this profile in the per-tab breadcrumb so SmartBackLink
         on detail pages (movie, show, celebrity) renders "Back to
         {name}'s profile" instead of "Back to Home". Without this, the
         auto-registrar in the root layout falls back to inferTitleForPath
         and skips because /profile/[id] doesn't match a static label. */}
      <NavEntryRegister title={`${user.name}'s profile`} />
      <h1 className="sr-only">{user.name} — The Ratist</h1>
      {/* Banner / Header area */}
      <div className="relative">
        {/* Banner image or gradient */}
        {theme?.headerImage ? (
          <div className="h-40 sm:h-52 w-full overflow-hidden relative">
            <Image src={theme.headerImage} alt="" fill className="object-cover" unoptimized style={{ objectPosition: `center ${theme.headerPosition ?? 50}%` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/80 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="h-32 sm:h-40 w-full bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--ratist-red)]" />
        )}

        {/* Profile info — sits below the banner */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          {/* Theme button row */}
          <div className="flex justify-end mb-3">
            <ProfileThemeButton profileFirebaseUid={user.firebaseUid} currentTheme={theme} />
          </div>
          <div className="flex items-start gap-5 mb-4">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-[var(--profile-surface-2,var(--surface-2))] border-2 border-[var(--border)] shrink-0">
              {user.avatarUrl ? (
                <Image src={user.avatarUrl} alt={user.name} fill sizes="96px" className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white bg-[var(--profile-accent,var(--ratist-red))]">
                  {user.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <ProfileHeader
                userName={user.name}
                bio={user.bio}
                isPrivate={user.isPrivate}
                profileFirebaseUid={user.firebaseUid}
                profileUserId={user.id}
                inviteCode={user.inviteCode}
                ratingCount={ratingCount + tvRatingCount}
                tvRatingCount={tvRatingCount}
                seenCount={seenCount + tvSeenCount}
                tvSeenCount={tvSeenCount}
                avgRating={avgRatingValue}
                memberSince={user.createdAt.getFullYear()}
                hasTheme={!!theme}
                forumThreadCount={forumThreadCount}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE ?? ""} format="auto" className="mb-4" />

      {/* Heavy per-tab data streams in once ready. Skeleton matches the
         tab strip + a poster grid so the swap is visually minimal. */}
      <Suspense fallback={<ProfileTabsSkeleton />}>
        <ProfileTabsLoader
          user={{
            id: user.id,
            firebaseUid: user.firebaseUid,
            name: user.name,
            email: user.email,
            isPrivate: user.isPrivate,
            publicTabs: user.publicTabs,
            profile: user.profile as Record<string, number> | null,
            subscriptionTier: user.subscriptionTier,
            subscriptionStatus: user.subscriptionStatus,
            subscriptionExpiry: user.subscriptionExpiry,
          }}
          ratingCount={ratingCount}
          tvRatingCount={tvRatingCount}
          seenCount={seenCount}
          tvSeenCount={tvSeenCount}
          watchlistCount={watchlistCount}
          avgRatingValue={avgRatingValue}
        />
      </Suspense>
      </div>
    </div>
    </ProfileThemeWrapper>
  );
}
