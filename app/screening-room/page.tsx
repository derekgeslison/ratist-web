"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MonitorPlay, Plus, LogIn, Users, Film, Calendar, Trash2, Lock, Ticket } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";

interface Session {
  id: string;
  movieTitle: string | null;
  posterPath: string | null;
  status: string;
  inviteCode: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  host: { id: string; name: string; avatarUrl: string | null; firebaseUid: string };
  participants: { user: { id: string; name: string; avatarUrl: string | null; firebaseUid: string } }[];
}

const STATUS_LABEL: Record<string, string> = {
  LOBBY: "In Lobby",
  COUNTDOWN: "Starting...",
  WATCHING: "Watching",
  POST_WATCH: "Post-Watch",
  COMPLETE: "Completed",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ScreeningRoomDashboard() {
  const { user } = useAuth();
  const { hasPass } = useSubscription();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  const fetchSessions = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/screening", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setSessions(await res.json());
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchSessions();
  }, [user, fetchSessions]);

  async function createSession() {
    setCreating(true);
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/screening", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const session = await res.json();
      router.push(`/screening-room/${session.id}`);
    }
    setCreating(false);
  }

  async function joinSession() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/screening/join", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/screening-room/${data.sessionId}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setJoinError(data.error ?? "Failed to join");
    }
    setJoining(false);
  }

  async function deleteSession(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Remove this screening room from your history?")) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchSessions();
  }

  if (!user) {
    router.replace("/backstage-pass/screening-room");
    return null;
  }

  const activeSessions = sessions.filter((s) => s.status !== "COMPLETE");
  const completedSessions = sessions.filter((s) => s.status === "COMPLETE");
  const isHost = (s: Session) => s.host.firebaseUid === user?.uid;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <MonitorPlay className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Screening Room</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Watch movies with friends. Predict, react, and compare ratings together.</p>

      {/* Actions */}
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <Plus className="w-4 h-4 text-[var(--ratist-red)]" /> Start a Screening Room
          </h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">Create a room and invite friends with a code.</p>
          {hasPass ? (
            <button onClick={createSession} disabled={creating}
              className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 w-full">
              {creating ? "Creating..." : "Create Room"}
            </button>
          ) : (
            <Link href="/backstage-pass/screening-room"
              className="flex items-center justify-center gap-2 bg-[var(--surface-2)] border border-amber-400/30 text-amber-400 text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors w-full hover:bg-amber-400/10">
              <Ticket className="w-4 h-4" /> Learn about hosting — Backstage Pass
            </Link>
          )}
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <LogIn className="w-4 h-4 text-[var(--ratist-red)]" /> Join a Screening Room
          </h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">Enter an invite code to join a friend&apos;s room.</p>
          <div className="flex gap-2">
            <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinSession()} placeholder="INVITE CODE" maxLength={6}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-white text-center tracking-widest font-mono placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-[var(--ratist-red)]" />
            <button onClick={joinSession} disabled={joining || !joinCode.trim()}
              className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {joining ? "..." : "Join"}
            </button>
          </div>
          {joinError && <p className="text-xs text-red-400 mt-2">{joinError}</p>}
        </div>
      </div>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-white mb-3">Active</h2>
          <div className="space-y-3 mb-8">
            {activeSessions.map((s) => (
              <Link key={s.id} href={`/screening-room/${s.id}`}
                className="flex items-center gap-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)] transition-colors">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                  {s.posterPath ? (
                    <Image src={`${TMDB_IMG}${s.posterPath}`} alt={s.movieTitle ?? ""} width={48} height={64} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 text-[var(--foreground-muted)]" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{s.movieTitle ?? "No movie selected"}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Hosted by {s.host.name}
                    {s.createdAt && <span className="ml-2">· Created {formatDate(s.createdAt)}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)] flex-shrink-0">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {s.participants.length}</span>
                  <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-[10px] font-medium">
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Completed sessions */}
      <h2 className="text-lg font-semibold text-white mb-3">
        {activeSessions.length > 0 ? "Your Past Screening Rooms" : "Your Past Screening Rooms"}
      </h2>
      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm">Loading...</p>
      ) : completedSessions.length === 0 && activeSessions.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm">No screening rooms yet. Create one or join with a code!</p>
      ) : completedSessions.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm">No completed sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {completedSessions.map((s) => (
            <div key={s.id} className="flex items-center gap-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)] transition-colors">
              <Link href={`/screening-room/${s.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                  {s.posterPath ? (
                    <Image src={`${TMDB_IMG}${s.posterPath}`} alt={s.movieTitle ?? ""} width={48} height={64} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 text-[var(--foreground-muted)]" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{s.movieTitle ?? "Untitled"}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--foreground-muted)]">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(s.startedAt || s.createdAt)}</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {s.participants.length} watchers</span>
                    <span>Hosted by {s.host.name}</span>
                  </div>
                </div>
              </Link>
              <button onClick={(e) => deleteSession(e, s.id)}
                className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors p-2 flex-shrink-0" title="Remove from view">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
