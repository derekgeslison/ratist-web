"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Copy, Check, UserPlus, UserCheck, Settings, Film, Tv, MoreHorizontal, Ban, UserX, Eye, EyeOff } from "lucide-react";
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
  forumThreadCount?: number;
}

export default function ProfileHeader({
  userName, bio, isPrivate, profileFirebaseUid, profileUserId, inviteCode,
  ratingCount, tvRatingCount = 0, seenCount, tvSeenCount = 0, avgRating, memberSince, hasTheme, forumThreadCount = 0,
}: Props) {
  const { user } = useAuth();
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;
  const [copied, setCopied] = useState(false);
  // Invite code stays hidden by default — useful when a streamer or
  // someone else is showing their profile to an audience and doesn't
  // want the share code captured on a screen recording. Click to
  // reveal; auto-reveals when copied.
  const [inviteRevealed, setInviteRevealed] = useState(false);
  // Four-state follow: "none" / "pending" / "accepted" / "blocked".
  // "blocked" means a block exists in either direction — the actual
  // block direction is exposed separately via blockedByMe so the UI
  // only offers Unblock when the current user is the blocker.
  const [followStatus, setFollowStatus] = useState<"none" | "pending" | "accepted" | "blocked">("none");
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [confirming, setConfirming] = useState<null | "block" | "unblock" | "remove">(null);
  // Pending follow-request count, only shown on the user's own
  // profile so they get a glanceable nudge to act on the inbox.
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Approved followers of a private profile see the same stats and
  // bio as a public profile (subject to the per-tab toggles handled
  // downstream in ProfileTabs).
  const showStats = isOwnProfile || !isPrivate || followStatus === "accepted";

  useEffect(() => {
    if (user) {
      user.getIdToken().then((token) => {
        fetch(`/api/users/${profileFirebaseUid}/follow`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => {
            setFollowStatus(data.followStatus ?? (data.isFollowing ? "accepted" : "none"));
            setBlockedByMe(!!data.blockedByMe);
            setIsFollowingMe(!!data.isFollowingMe);
            setFollowerCount(data.followerCount ?? 0);
            setFollowingCount(data.followingCount ?? 0);
          })
          .catch(() => {});
      });
      // Pending request count — own profile only.
      if (user.uid === profileFirebaseUid) {
        user.getIdToken().then((token) =>
          fetch("/api/follow-requests", { headers: { Authorization: `Bearer ${token}` } })
        ).then((r) => r.ok ? r.json() : null).then((data) => {
          setPendingRequestCount(data?.requests?.length ?? 0);
        }).catch(() => null);
      }
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
      setFollowStatus(data.followStatus ?? (data.following ? "accepted" : "none"));
      setFollowerCount(data.followerCount);
    }
    setFollowLoading(false);
  }

  async function handleBlock() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/users/${profileFirebaseUid}/block`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      setFollowStatus("blocked");
      setBlockedByMe(true);
      // Counts are now stale because the block deleted the
      // follow rows; refetch them to keep the header honest.
      const refetch = await fetch(`/api/users/${profileFirebaseUid}/follow`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (refetch?.ok) {
        const d = await refetch.json();
        setFollowerCount(d.followerCount ?? 0);
        setFollowingCount(d.followingCount ?? 0);
      }
    }
    setConfirming(null);
    setMenuOpen(false);
  }

  async function handleUnblock() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/users/${profileFirebaseUid}/block`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      setFollowStatus("none");
      setBlockedByMe(false);
    }
    setConfirming(null);
    setMenuOpen(false);
  }

  async function handleRemoveFollower() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/users/${profileFirebaseUid}/remove-follower`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      // Re-fetch so the follower count drops on the header.
      const refetch = await fetch(`/api/users/${profileFirebaseUid}/follow`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (refetch?.ok) {
        const d = await refetch.json();
        setFollowerCount(d.followerCount ?? 0);
      }
    }
    setConfirming(null);
    setMenuOpen(false);
  }

  // Close kebab when clicking outside.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menuOpen]);

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
        {user && !isOwnProfile && followStatus !== "blocked" && (
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              followStatus === "accepted"
                // Foreground (not accent) so themed profiles with a
                // low-contrast accent don't make the "Following"
                // text/icon disappear into the background.
                ? "border-[var(--ratist-red)]/40 bg-[var(--ratist-red)]/10 text-[var(--foreground)] hover:bg-[var(--ratist-red)]/20"
                : followStatus === "pending"
                ? "border-[var(--foreground-muted)]/40 bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)]"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-[var(--ratist-red)]"
            }`}
          >
            {followStatus === "accepted" ? (
              <><UserCheck className="w-3.5 h-3.5" /> Following</>
            ) : followStatus === "pending" ? (
              <><UserPlus className="w-3.5 h-3.5" /> Requested</>
            ) : isPrivate ? (
              <><UserPlus className="w-3.5 h-3.5" /> Request</>
            ) : (
              <><UserPlus className="w-3.5 h-3.5" /> Follow</>
            )}
          </button>
        )}
        {user && !isOwnProfile && followStatus === "blocked" && blockedByMe && (
          <button
            onClick={() => setConfirming("unblock")}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white transition-colors"
          >
            <Ban className="w-3.5 h-3.5" /> Blocked
          </button>
        )}
        {user && !isOwnProfile && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-30 p-1">
                {followStatus === "blocked" && blockedByMe ? (
                  <button
                    onClick={() => setConfirming("unblock")}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[var(--surface-2)] rounded-lg flex items-center gap-2"
                  >
                    <Ban className="w-4 h-4" /> Unblock {userName}
                  </button>
                ) : followStatus !== "blocked" ? (
                  <>
                    {isFollowingMe && (
                      <button
                        onClick={() => setConfirming("remove")}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[var(--surface-2)] rounded-lg flex items-center gap-2"
                      >
                        <UserX className="w-4 h-4" /> Remove follower
                      </button>
                    )}
                    <button
                      onClick={() => setConfirming("block")}
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[var(--surface-2)] rounded-lg flex items-center gap-2"
                    >
                      <Ban className="w-4 h-4" /> Block {userName}
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
        {confirming && user && !isOwnProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setConfirming(null); }}>
            <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5">
              <h3 className="text-base font-semibold text-white mb-2">
                {confirming === "block" && `Block ${userName}?`}
                {confirming === "unblock" && `Unblock ${userName}?`}
                {confirming === "remove" && `Remove ${userName} as a follower?`}
              </h3>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                {confirming === "block" && "They won't be able to follow you, see your content, or be seen by you. Any existing follows in either direction will be removed."}
                {confirming === "unblock" && "They'll be able to follow you again, but their previous follow status won't be restored."}
                {confirming === "remove" && "They'll stop being a follower without being notified. They can re-follow (or re-request) you afterwards."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (confirming === "block") handleBlock();
                    else if (confirming === "unblock") handleUnblock();
                    else handleRemoveFollower();
                  }}
                  className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors ${
                    confirming === "block"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white"
                  }`}
                >
                  {confirming === "block" ? "Block" : confirming === "unblock" ? "Unblock" : "Remove"}
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
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
            isOwnProfile ? (
              <span className="inline-flex items-center gap-1.5">
                <Link href="/connections" className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
                  <strong className="text-[var(--foreground)]">{followerCount}</strong> follower{followerCount !== 1 ? "s" : ""}
                </Link>
                {pendingRequestCount > 0 && (
                  <Link
                    href="/connections?tab=requests"
                    className="text-[10px] font-bold bg-[var(--ratist-red)] text-white rounded-full px-1.5 py-0.5 hover:bg-[var(--ratist-red-hover)] transition-colors"
                    title={`${pendingRequestCount} pending follow request${pendingRequestCount === 1 ? "" : "s"}`}
                  >
                    {pendingRequestCount} pending
                  </Link>
                )}
              </span>
            ) : (
              <span className="text-[var(--foreground-muted)]"><strong className="text-[var(--foreground)]">{followerCount}</strong> follower{followerCount !== 1 ? "s" : ""}</span>
            )
          )}
          {followingCount != null && (
            isOwnProfile ? (
              <Link href="/connections" className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
                <strong className="text-[var(--foreground)]">{followingCount}</strong> following
              </Link>
            ) : (
              <span className="text-[var(--foreground-muted)]"><strong className="text-[var(--foreground)]">{followingCount}</strong> following</span>
            )
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
          {forumThreadCount > 0 && (
            <Link href={`/profile/${profileFirebaseUid}/forum`} className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              <strong className="text-[var(--foreground)]">{forumThreadCount}</strong> forum post{forumThreadCount !== 1 ? "s" : ""}
            </Link>
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
            <code className="text-xs font-mono bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--foreground)] tabular-nums">
              {inviteRevealed ? inviteCode : "•".repeat(inviteCode.length)}
            </code>
            <button
              onClick={() => setInviteRevealed((v) => !v)}
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              title={inviteRevealed ? "Hide invite code" : "Reveal invite code"}
            >
              {inviteRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteCode);
                setCopied(true);
                setInviteRevealed(true);
                setTimeout(() => setCopied(false), 2000);
              }}
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
