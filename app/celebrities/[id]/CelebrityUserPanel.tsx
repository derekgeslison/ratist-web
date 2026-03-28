"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  tmdbIds: number[];
}

export default function CelebrityUserPanel({ tmdbIds }: Props) {
  const { user } = useAuth();
  const [userAvg, setUserAvg] = useState<number | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || tmdbIds.length === 0) { setLoaded(true); return; }
    user.getIdToken().then((token) => {
      fetch("/api/celebrities/ratist-stats", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbIds }),
      })
        .then((r) => r.json())
        .then((data) => {
          setUserAvg(data.userAvg ?? null);
          setUserCount(data.userCount ?? 0);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    });
  }, [user, tmdbIds]);

  if (!user || !loaded || userAvg == null) return null;

  return (
    <div>
      <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Your Avg Rating</p>
      <p className="text-lg font-bold text-white">{userAvg.toFixed(1)}</p>
      <p className="text-xs text-[var(--foreground-muted)]">{userCount} movie{userCount !== 1 ? "s" : ""} rated</p>
    </div>
  );
}
