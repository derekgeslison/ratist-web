"use client";

import { useState, useEffect } from "react";
import { Copy, Check, UserPlus, UserCheck, Share2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import CompareTasteButton from "./CompareTasteButton";

interface Props {
  userName: string;
  bio: string | null;
  isPrivate: boolean;
  profileFirebaseUid: string;
  profileUserId: string;
  inviteCode?: string;
  ratingCount: number;
  seenCount: number;
  avgRating: number | null;
  memberSince: number;
}

export default function ProfileHeader({
  userName, bio, isPrivate, profileFirebaseUid, profileUserId, inviteCode,
  ratingCount, seenCount, avgRating, memberSince,
}: Props) {
  const { user } = useAuth();
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;
  const showStats = isOwnProfile || !isPrivate;
  const [copied, setCopied] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [shareMsg, setShareMsg] = useState(false);

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

  function shareProfile() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `${userName} on The Ratist`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setShareMsg(true);
      setTimeout(() => setShareMsg(false), 2000);
    }
  }

  return (
    <div>
      {/* Row 1: Name + action buttons */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h1 className="text-2xl font-bold text-white">{userName}</h1>
        {user && !isOwnProfile && (
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              isFollowing
                ? "border-[var(--ratist-red)]/40 bg-[var(--ratist-red)]/10 text-[var(--ratist-red)] hover:bg-[var(--ratist-red)]/20"
                : "border-[var(--border)] bg-[var(--surface-2)] text-white hover:border-[var(--ratist-red)]"
            }`}
          >
            {isFollowing ? <><UserCheck className="w-3.5 h-3.5" /> Following</> : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
          </button>
        )}
        <button
          onClick={shareProfile}
          className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors rounded"
          title="Share profile"
        >
          {shareMsg ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Row 2: Bio */}
      {bio && showStats && (
        <p className="text-sm text-[var(--foreground-muted)] mb-3">{bio}</p>
      )}

      {/* Row 3: Stats */}
      {showStats && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--foreground-muted)] mb-3">
          {followerCount != null && (
            <span><strong className="text-white">{followerCount}</strong> follower{followerCount !== 1 ? "s" : ""}</span>
          )}
          {followingCount != null && (
            <span><strong className="text-white">{followingCount}</strong> following</span>
          )}
          <span><strong className="text-white">{ratingCount}</strong> rated</span>
          <span><strong className="text-white">{seenCount}</strong> seen</span>
          {avgRating != null && (
            <span>
              Avg:{" "}
              <strong style={{ color: scoreColor(avgRating) }}>
                {avgRating.toFixed(1)}
              </strong>
            </span>
          )}
          <span className="text-xs self-center">Member since {memberSince}</span>
        </div>
      )}

      {/* Row 4: Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isPrivate && (
          <CompareTasteButton profileFirebaseUid={profileFirebaseUid} profileUserId={profileUserId} />
        )}
        {isOwnProfile && inviteCode && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--foreground-muted)]">Invite code:</span>
            <code className="text-xs font-mono bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-0.5 text-white">{inviteCode}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-[var(--foreground-muted)] hover:text-white transition-colors"
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
