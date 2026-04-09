"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Copy, Check, UserPlus, UserCheck, Settings, Film, Tv } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import CompareTasteButton from "./CompareTasteButton";
import ShareButton from "./ShareButton";
import BadgeTrophyCase from "./BadgeTrophyCase";

interface Props {
  userName: string;
  bio: string | null;
  isPrivate: boolean;
  profileFirebaseUid: string;
  profileUserId: string;
  inviteCode?: string;
  ratingCount: number;
  tvRatingCount?: number;
  seenCount: number;
  tvSeenCount?: number;
  avgRating: number | null;
  memberSince: number;
  hasTheme?: boolean;
}

export default function ProfileHeader({
  userName, bio, isPrivate, profileFirebaseUid, profileUserId, inviteCode,
  ratingCount, tvRatingCount = 0, seenCount, tvSeenCount = 0, avgRating, memberSince, hasTheme,
}: Props) {
  const { user } = useAuth();
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;
  const showStats = isOwnProfile || !isPrivate;
  const [copied, setCopied] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (user) {
      user.getIdToken().then((token) => {
        fetch(`/api/users/${profileFirebaseUid}/follow`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => {
            setIsFollowing(data.isFollowing ?? false);
            setFollowerCount(data.followerCount ?? 0);
            setFollowingCount(data.followingCount ?? 0);
          })
          .catch(() => {});
      });
    } else {
      fetch(`/api/users/${profileFirebaseUid}/follow`)
        .then((r) => r.json())
        .then((data) => {
          setFollowerCount(data.followerCount ?? 0);
          setFollowingCount(data.followingCount ?? 0);
        })
        .catch(() => {});
    }
  }, [user, profileFirebaseUid]);

  async function toggleFollow() {
    if (!user || followLoading) return;
    setFollowLoading(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/users/${profileFirebaseUid}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setIsFollowing(data.following);
      setFollowerCount(data.followerCount);
    }
    setFollowLoading(false);
  }

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://www.theratist.com";
  const profileUrl = `${siteUrl}/profile/${profileFirebaseUid}`;
  const ogImageUrl = `${siteUrl}/api/og/profile?userId=${profileFirebaseUid}`;

  const movieRatings = ratingCount - tvRatingCount;
  const movieSeen = seenCount - tvSeenCount;

  return (
    <div>
      {/* Name + follow + edit */}
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{userName}</h1>
        {user && !isOwnProfile && (
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              isFollowing
                ? "border-[var(--ratist-red)]/40 bg-[var(--ratist-red)]/10 text-[var(--ratist-red)] hover:bg-[var(--ratist-red)]/20"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-[var(--ratist-red)]"
            }`}
          >
            {isFollowing ? <><UserCheck className="w-3.5 h-3.5" /> Following</> : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
          </button>
        )}
        {isOwnProfile && (
          <Link
            href="/settings"
            className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <Settings className="w-3.5 h-3.5" /> Edit Profile
          </Link>
        )}
      </div>

      {/* Bio */}
      {bio && showStats && (
        <p className="text-sm text-[var(--foreground-muted)] mb-3 max-w-xl">{bio}</p>
      )}

      {/* Stats row */}
      {showStats && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm mb-3">
          {followerCount != null && (
            <span className="text-[var(--foreground-muted)]"><strong className="text-[var(--foreground)]">{followerCount}</strong> follower{followerCount !== 1 ? "s" : ""}</span>
          )}
          {followingCount != null && (
            <span className="text-[var(--foreground-muted)]"><strong className="text-[var(--foreground)]">{followingCount}</strong> following</span>
          )}
          <span className="text-[var(--foreground-muted)] flex items-center gap-1">
            <Film className="w-3 h-3" /> <strong className="text-[var(--foreground)]">{movieRatings}</strong> rated
          </span>
          {tvRatingCount > 0 && (
            <span className="text-[var(--foreground-muted)] flex items-center gap-1">
              <Tv className="w-3 h-3" /> <strong className="text-[var(--foreground)]">{tvRatingCount}</strong> shows
            </span>
          )}
          <span className="text-[var(--foreground-muted)] flex items-center gap-1">
            <strong className="text-[var(--foreground)]">{seenCount}</strong> seen
          </span>
          {avgRating != null && (
            <span className="text-[var(--foreground-muted)]">
              Avg <strong style={{ color: scoreColor(avgRating) }}>{avgRating.toFixed(1)}</strong>
            </span>
          )}
          <span className="text-xs text-[var(--foreground-muted)] self-center">Since {memberSince}</span>
        </div>
      )}

      {/* Badge trophy case */}
      {showStats && <BadgeTrophyCase profileFirebaseUid={profileFirebaseUid} />}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <ShareButton
          text={`${userName} on The Ratist`}
          url={profileUrl}
          cardImageUrl={isOwnProfile ? ogImageUrl : undefined}
        />
        {!isPrivate && (
          <CompareTasteButton profileFirebaseUid={profileFirebaseUid} profileUserId={profileUserId} />
        )}
        {isOwnProfile && inviteCode && (
          <div className="flex items-center gap-2 ml-1">
            <span className="text-xs text-[var(--foreground-muted)]">Invite:</span>
            <code className="text-xs font-mono bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--foreground)]">{inviteCode}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              title="Copy invite code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
