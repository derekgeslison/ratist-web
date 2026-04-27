"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import Image from "next/image";
import { Users, UserPlus, ArrowLeft, Check, X, UserX } from "lucide-react";
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

interface FollowRequest {
  id: string;
  createdAt: string;
  follower: {
    id: string;
    firebaseUid: string;
    name: string;
    avatarUrl: string | null;
    bio: string | null;
  };
}

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"following" | "followers" | "requests">(() => {
    if (typeof window === "undefined") return "following";
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "followers" || t === "requests") return t;
    return "following";
  });
  const [followers, setFollowers] = useState<UserItem[]>([]);
  const [following, setFollowing] = useState<UserItem[]>([]);
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then(async (token) => {
      const [conn, reqs] = await Promise.all([
        fetch("/api/users/me/connections", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/follow-requests", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({})),
      ]);
      setFollowers(conn.followers ?? []);
      setFollowing(conn.following ?? []);
      setRequests(reqs.requests ?? []);
      setLoading(false);
    });
  }, [user]);

  async function removeFollower(firebaseUid: string) {
    if (!user) return;
    const ok = window.confirm("Remove this follower? They can re-follow you afterwards.");
    if (!ok) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/users/${firebaseUid}/remove-follower`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      setFollowers((prev) => prev.filter((f) => f.firebaseUid !== firebaseUid));
    }
  }

  async function actOnRequest(requestId: string, action: "accept" | "decline") {
    if (!user || actingOn) return;
    setActingOn(requestId);
    const token = await user.getIdToken();
    const res = await fetch(`/api/follow-requests/${requestId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (res?.ok) {
      const accepted = requests.find((r) => r.id === requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      // Optimistically add to followers list when accepted so the
      // count and entry appear without a refetch round-trip.
      if (action === "accept" && accepted) {
        setFollowers((prev) => [
          {
            id: accepted.follower.id,
            firebaseUid: accepted.follower.firebaseUid,
            name: accepted.follower.name,
            avatarUrl: accepted.follower.avatarUrl,
            _count: { ratings: 0 },
            followedAt: accepted.createdAt,
          },
          ...prev,
        ]);
      }
    }
    setActingOn(null);
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to view your connections.
        </p>
      </div>
    );
  }

  const list = tab === "following" ? following : tab === "followers" ? followers : [];

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
        {requests.length > 0 && (
          <button
            onClick={() => setTab("requests")}
            className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === "requests" ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Requests
            <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {requests.length}
            </span>
          </button>
        )}
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE ?? ""} format="auto" className="mb-4" />

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : tab === "requests" ? (
        requests.length === 0 ? (
          <div className="text-center py-10">
            <UserPlus className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-3 opacity-40" />
            <p className="text-[var(--foreground-muted)]">No follow requests right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                <Link href={`/profile/${req.follower.firebaseUid}`} className="relative w-10 h-10 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                  {req.follower.avatarUrl ? (
                    <Image src={req.follower.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white bg-[var(--ratist-red)]">
                      {req.follower.name[0]?.toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${req.follower.firebaseUid}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors truncate block">
                    {req.follower.name}
                  </Link>
                  {req.follower.bio && (
                    <p className="text-xs text-[var(--foreground-muted)] truncate">{req.follower.bio}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => actOnRequest(req.id, "accept")}
                    disabled={actingOn === req.id}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white transition-colors disabled:opacity-50"
                    title="Accept"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => actOnRequest(req.id, "decline")}
                    disabled={actingOn === req.id}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
                    title="Decline"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
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
            <div key={u.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--foreground-muted)]/30 transition-colors">
              <Link href={`/profile/${u.firebaseUid}`} className="flex items-center gap-3 flex-1 min-w-0">
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
              {tab === "followers" && (
                <button
                  onClick={() => removeFollower(u.firebaseUid)}
                  className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-[var(--surface-2)] flex items-center gap-1.5 shrink-0"
                  title="Remove follower"
                >
                  <UserX className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
