"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import Image from "next/image";
import { Users, UserPlus, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AdUnit from "@/components/AdUnit";

interface UserItem {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  _count: { ratings: number };
  followedAt: string;
}

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"following" | "followers">("following");
  const [followers, setFollowers] = useState<UserItem[]>([]);
  const [following, setFollowing] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) => {
      fetch("/api/users/me/connections", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setFollowers(data.followers ?? []);
          setFollowing(data.following ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to view your connections.
        </p>
      </div>
    );
  }

  const list = tab === "following" ? following : followers;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href={`/profile/${user.uid}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Profile
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Users className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Connections</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-6">
        <button
          onClick={() => setTab("following")}
          className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors ${
            tab === "following" ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          Following ({following.length})
        </button>
        <button
          onClick={() => setTab("followers")}
          className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors ${
            tab === "followers" ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          Followers ({followers.length})
        </button>
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE ?? ""} format="auto" className="mb-4" />

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : list.length === 0 ? (
        <div className="text-center py-10">
          <UserPlus className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--foreground-muted)]">
            {tab === "following" ? "You aren't following anyone yet." : "No followers yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((u) => (
            <Link
              key={u.id}
              href={`/profile/${u.firebaseUid}`}
              className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--foreground-muted)]/30 transition-colors"
            >
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                {u.avatarUrl ? (
                  <Image src={u.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white bg-[var(--ratist-red)]">
                    {u.name[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{u._count.ratings} ratings</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
