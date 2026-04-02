"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  targetType: string;
  targetId: string;
}

export default function PostLikeButton({ targetType, targetId }: Props) {
  const { user } = useAuth();
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    (async () => {
      const headers: Record<string, string> = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/likes?targetType=${targetType}&targetId=${targetId}`, { headers });
      const data = await res.json();
      setLikeCount(data.likeCount ?? 0);
      setLikedByMe(data.likedByMe ?? false);
    })();
  }, [user, targetType, targetId]);

  async function toggle() {
    if (!user || toggling) return;
    setToggling(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/likes", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId }),
    });
    if (res.ok) {
      const data = await res.json();
      setLikedByMe(data.liked);
      setLikeCount(data.likeCount);
    }
    setToggling(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={toggling || !user}
      className={`flex items-center gap-1.5 text-sm transition-colors ${
        likedByMe
          ? "text-[var(--ratist-red)]"
          : "text-[var(--foreground-muted)] hover:text-[var(--ratist-red)]"
      } disabled:opacity-50`}
    >
      <Heart className={`w-4 h-4 ${likedByMe ? "fill-current" : ""}`} />
      {likeCount > 0 && <span className="text-xs font-medium">{likeCount}</span>}
    </button>
  );
}
