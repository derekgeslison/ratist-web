"use client";

import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import CompareTasteButton from "./CompareTasteButton";

interface Props {
  userName: string;
  bio: string | null;
  isPrivate: boolean;
  profileFirebaseUid: string;
  profileUserId: string;
  ratingCount: number;
  seenCount: number;
  avgRating: number | null;
  memberSince: number;
}

export default function ProfileHeader({
  userName, bio, isPrivate, profileFirebaseUid, profileUserId,
  ratingCount, seenCount, avgRating, memberSince,
}: Props) {
  const { user } = useAuth();
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;
  const showStats = isOwnProfile || !isPrivate;

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
    </>
  );
}
