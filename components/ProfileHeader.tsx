"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
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

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">{userName}</h1>
      {bio && showStats && <p className="text-sm text-[var(--foreground-muted)] mb-3">{bio}</p>}
      {showStats && (
        <div className="flex flex-wrap gap-4 text-sm text-[var(--foreground-muted)]">
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
          <span>Member since {memberSince}</span>
        </div>
      )}
      {!isPrivate && (
        <div className="mt-3">
          <CompareTasteButton profileFirebaseUid={profileFirebaseUid} profileUserId={profileUserId} />
        </div>
      )}
      {isOwnProfile && inviteCode && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)]">Your invite code:</span>
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
    </>
  );
}
