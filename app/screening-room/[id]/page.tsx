"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { MonitorPlay, Copy, Check, Search, X, Send, Bookmark, PauseCircle, BarChart3, MessageCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { rtdb } from "@/lib/firebase-rtdb";
import { ref, push, onChildAdded, onValue, set, off } from "firebase/database";
import { rtdbPaths, type RTDBChatMessage } from "@/lib/screening";

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const TMDB_SM = "https://image.tmdb.org/t/p/w92";

interface Participant {
  userId: string;
  hasAds: boolean;
  hasFinished: boolean;
  user: { id: string; name: string; avatarUrl: string | null; firebaseUid: string };
}

interface Prediction {
  userId: string;
  plotGuess: string | null;
  ratingGuess: number | null;
}

interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  revealAt: string;
  createdAt: string;
  creator: { id: string; name: string };
}

interface SessionData {
  id: string;
  hostId: string;
  movieId: string | null;
  tmdbId: number | null;
  movieTitle: string | null;
  posterPath: string | null;
  status: string;
  inviteCode: string;
  startedAt: string | null;
  host: { id: string; name: string; avatarUrl: string | null };
  participants: Participant[];
  predictions: Prediction[];
  polls: Poll[];
  bookmarks: { id: string; userId: string; timestamp: string; note: string | null; user: { id: string; name: string } }[];
}

interface MovieResult { id: number; title: string; posterPath: string | null; releaseDate: string }

const QUICK_EMOJIS = ["😂", "😱", "🔥", "😭", "🤯", "👏", "💀", "❤️"];

/** Format elapsed time since session start */
function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return "0:00";
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ScreeningSessionPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Movie picker
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);

  // Predictions
  const [plotGuess, setPlotGuess] = useState("");
  const [ratingGuess, setRatingGuess] = useState("");
  const [predictionSaved, setPredictionSaved] = useState(false);

  // Ready up (RTDB)
  const [readyUsers, setReadyUsers] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<number | null>(null);

  // Chat (RTDB)
  const [chatMessages, setChatMessages] = useState<(RTDBChatMessage & { key: string })[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Bookmarks
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [bookmarkSaved, setBookmarkSaved] = useState(false);

  // Polls
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPollForm, setShowPollForm] = useState(false);

  // Pause request
  const [pauseAlert, setPauseAlert] = useState<string | null>(null);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);
  const myUserId = session?.participants.find((p) => p.user.firebaseUid === user?.uid)?.userId ?? "";
  const isHost = session?.host?.id === myUserId;

  // Pre-populate prediction fields when session loads
  useEffect(() => {
    if (!session || !myUserId) return;
    const myPred = session.predictions.find((p) => p.userId === myUserId);
    if (myPred) {
      if (myPred.plotGuess) setPlotGuess(myPred.plotGuess);
      if (myPred.ratingGuess != null) setRatingGuess(String(myPred.ratingGuess));
      setPredictionSaved(true);
    }
  }, [session?.id, myUserId]);

  // Fetch session data
  const fetchSession = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/screening/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setSession(await res.json());
      setError("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load session");
    }
    setLoading(false);
  }, [id, getToken]);

  useEffect(() => { if (user) fetchSession(); else setLoading(false); }, [user, fetchSession]);

  // Poll for session updates
  useEffect(() => {
    if (!user || !session || session.status === "COMPLETE") return;
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [user, session?.status, fetchSession]);

  // RTDB listeners for ready-up
  useEffect(() => {
    if (!rtdb || !session || session.status !== "LOBBY") return;
    const readyRef = ref(rtdb, rtdbPaths.readyUp(id));
    const unsub = onValue(readyRef, (snap) => {
      setReadyUsers(snap.val() ?? {});
    });
    return () => off(readyRef, "value", unsub);
  }, [id, session?.status]);

  // RTDB listeners for chat
  useEffect(() => {
    if (!rtdb || !session || (session.status !== "WATCHING" && session.status !== "POST_WATCH")) return;
    const chatRef = ref(rtdb, rtdbPaths.chat(id));
    setChatMessages([]);
    const unsub = onChildAdded(chatRef, (snap) => {
      const msg = snap.val() as RTDBChatMessage;
      setChatMessages((prev) => [...prev, { ...msg, key: snap.key! }]);
    });
    return () => off(chatRef, "child_added", unsub);
  }, [id, session?.status]);

  // RTDB listener for pause requests
  useEffect(() => {
    if (!rtdb || !session || session.status !== "WATCHING") return;
    const pauseRef = ref(rtdb, rtdbPaths.pauseRequests(id));
    const unsub = onChildAdded(pauseRef, (snap) => {
      const req = snap.val();
      setPauseAlert(req.userName);
      setTimeout(() => setPauseAlert(null), 5000);
    });
    return () => off(pauseRef, "child_added", unsub);
  }, [id, session?.status]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Countdown logic
  useEffect(() => {
    if (session?.status !== "COUNTDOWN") { setCountdown(null); return; }
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          if (isHost) {
            getToken().then((token) => {
              if (token) {
                fetch(`/api/screening/${id}`, {
                  method: "PATCH",
                  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "WATCHING" }),
                });
              }
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.status]);

  // ── Actions ──

  async function apiPatch(body: Record<string, unknown>) {
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchSession();
  }

  async function selectMovie(m: MovieResult) {
    await apiPatch({
      tmdbId: m.id,
      movieTitle: m.title,
      posterPath: m.posterPath,
    });
    setMovieQuery("");
    setMovieResults([]);
  }

  function copyInviteCode() {
    if (!session) return;
    navigator.clipboard.writeText(session.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleReady() {
    if (!rtdb || !myUserId) return;
    const current = readyUsers[myUserId] ?? false;
    await set(ref(rtdb, rtdbPaths.userReady(id, myUserId)), !current || null);
  }

  async function startCountdown() {
    await apiPatch({ status: "COUNTDOWN" });
  }

  async function savePrediction() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/screening/${id}/predictions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plotGuess: plotGuess || null, ratingGuess: ratingGuess || null }),
    });
    if (res.ok) {
      setPredictionSaved(true);
      setTimeout(() => setPredictionSaved(false), 3000);
    }
  }

  async function sendChat(text: string, emoji?: string) {
    if (!rtdb || !user || !myUserId) return;
    const msg: RTDBChatMessage = {
      userId: myUserId,
      userName: user.displayName ?? "Anonymous",
      avatarUrl: user.photoURL ?? undefined,
      text,
      emoji,
      timestamp: Date.now(),
    };
    await push(ref(rtdb, rtdbPaths.chat(id)), msg);
    setChatInput("");
    if (chatInputRef.current) chatInputRef.current.value = "";
  }

  function sendTextFromInput() {
    // Read directly from DOM to avoid React state timing issues
    const val = chatInputRef.current?.value?.trim() || chatInput.trim();
    if (val) sendChat(val);
  }

  async function sendPauseRequest() {
    if (!rtdb || !user || !myUserId) return;
    await push(ref(rtdb, rtdbPaths.pauseRequests(id)), {
      userId: myUserId,
      userName: user.displayName ?? "Anonymous",
      timestamp: Date.now(),
    });
  }

  async function markFinished(forceAll = false) {
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/finish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ forceAll }),
    });
    fetchSession();
  }

  async function completeSession() {
    await apiPatch({ status: "COMPLETE" });
    router.push(`/screening-room/${id}/recap`);
  }

  async function saveBookmark() {
    const token = await getToken();
    if (!token) return;
    const timestamp = formatElapsed(session?.startedAt ?? null);
    await fetch(`/api/screening/${id}/bookmarks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp, note: bookmarkNote || null }),
    });
    setBookmarkNote("");
    setBookmarkSaved(true);
    setTimeout(() => setBookmarkSaved(false), 2000);
    fetchSession();
  }

  async function createPoll() {
    const validOptions = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/polls`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ question: pollQuestion, options: validOptions }),
    });
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollForm(false);
    fetchSession();
  }

  async function votePoll(pollId: string, optionIndex: number) {
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/polls/${pollId}/vote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ optionIndex }),
    });
    fetchSession();
  }

  // ── Movie search ──
  useEffect(() => {
    if (movieQuery.length < 2) { setMovieResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(movieQuery)}`);
      const data = await res.json();
      setMovieResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [movieQuery]);

  // ── Render ──

  if (!user) {
    return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">Sign in to join this screening room.</div>;
  }
  if (loading) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">Loading...</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-red-400">{error}</div>;
  if (!session) return null;

  const me = session.participants.find((p) => p.userId === myUserId);
  const amHost = session.host.id === myUserId;
  const readyCount = Object.values(readyUsers).filter(Boolean).length;
  const allReady = readyCount === session.participants.length && session.participants.length > 0;

  /** Render a poll inline (used in both chat and post-watch) */
  function renderPoll(poll: Poll, compact = false) {
    const totalVotes = Object.keys(poll.votes).length;
    const myVote = poll.votes[myUserId];
    return (
      <div className={`bg-[var(--surface-2)] rounded-lg p-3 ${compact ? "" : "my-2"}`}>
        <p className="text-xs text-white font-medium mb-2">{poll.question}</p>
        {(poll.options as string[]).map((opt: string, i: number) => {
          const voteCount = Object.values(poll.votes).filter((v) => v === i).length;
          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          return (
            <button key={i} onClick={() => votePoll(poll.id, i)}
              className={`w-full text-left mb-1 rounded-lg px-2 py-1.5 text-xs relative overflow-hidden ${myVote === i ? "border border-[var(--ratist-red)]" : "border border-transparent hover:border-[var(--border)]"}`}>
              <div className="absolute inset-0 bg-[var(--ratist-red)]/10 rounded-lg" style={{ width: `${pct}%` }} />
              <span className="relative text-white">{opt}</span>
              {totalVotes > 0 && <span className="relative float-right text-[var(--foreground-muted)]">{pct}%</span>}
            </button>
          );
        })}
        <p className="text-[10px] text-[var(--foreground-muted)] mt-1">{totalVotes} vote{totalVotes !== 1 ? "s" : ""} · by {poll.creator.name}</p>
      </div>
    );
  }

  /** Build a combined timeline of chat messages and polls for the watching view */
  function buildChatTimeline() {
    const items: { type: "msg" | "poll"; key: string; timestamp: number; data: any }[] = [];
    for (const msg of chatMessages) {
      items.push({ type: "msg", key: msg.key, timestamp: msg.timestamp, data: msg });
    }
    for (const poll of session!.polls) {
      items.push({ type: "poll", key: poll.id, timestamp: new Date(poll.createdAt).getTime(), data: poll });
    }
    items.sort((a, b) => a.timestamp - b.timestamp);
    return items;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Pause alert overlay */}
      {pauseAlert && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-500/90 text-black px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-pulse">
          <PauseCircle className="w-6 h-6" />
          <span className="font-semibold">{pauseAlert} is requesting a pause!</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MonitorPlay className="w-6 h-6 text-[var(--ratist-red)]" />
          <div>
            <h1 className="text-xl font-bold text-white">{session.movieTitle ?? "Screening Room"}</h1>
            <p className="text-xs text-[var(--foreground-muted)]">
              Hosted by {session.host.name} · {session.participants.length} participant{session.participants.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button onClick={copyInviteCode} className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white hover:border-[var(--ratist-red)] transition-colors">
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          <span className="font-mono tracking-widest">{session.inviteCode}</span>
        </button>
      </div>

      {/* ── LOBBY ── */}
      {session.status === "LOBBY" && (
        <div className="space-y-6">
          {/* Movie selection — host only can search/change */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Movie</h2>
            {session.movieTitle ? (
              <div className="flex items-center gap-4">
                {session.posterPath && (
                  <div className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0">
                    <Image src={`${TMDB_IMG}${session.posterPath}`} alt={session.movieTitle} width={64} height={96} className="object-cover w-full h-full" />
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold">{session.movieTitle}</p>
                  {amHost && (
                    <button onClick={() => apiPatch({ movieId: null, tmdbId: null, movieTitle: null, posterPath: null })} className="text-xs text-[var(--ratist-red)] hover:underline mt-1">Change movie</button>
                  )}
                </div>
              </div>
            ) : amHost ? (
              <div className="relative">
                <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-[var(--foreground-muted)]" />
                  <input
                    type="text" value={movieQuery} onChange={(e) => setMovieQuery(e.target.value)}
                    placeholder="Search for a movie..."
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none"
                  />
                  {movieQuery && <button onClick={() => { setMovieQuery(""); setMovieResults([]); }}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>}
                </div>
                {movieResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {movieResults.map((m) => (
                      <button key={m.id} onClick={() => selectMovie(m)} className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
                        <div className="w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                          {m.posterPath && <Image src={`${TMDB_SM}${m.posterPath}`} alt={m.title} width={32} height={48} className="object-cover w-full h-full" />}
                        </div>
                        <div>
                          <p className="text-sm text-white">{m.title}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">Waiting for the host to pick a movie...</p>
            )}
          </section>

          {/* Participants */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Participants ({session.participants.length})</h2>
            <div className="flex flex-wrap gap-3">
              {session.participants.map((p) => (
                <div key={p.userId} className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-[var(--surface)] overflow-hidden">
                    {p.user.avatarUrl ? <Image src={p.user.avatarUrl} alt="" width={28} height={28} className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">{p.user.name[0]}</div>}
                  </div>
                  <span className="text-sm text-white">{p.user.name}</span>
                  {p.userId === session.host.id && <span className="text-[9px] bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] px-1.5 py-0.5 rounded-full">HOST</span>}
                  {readyUsers[p.userId] && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">READY</span>}
                </div>
              ))}
            </div>
          </section>

          {/* Predictions */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Pre-Watch Predictions</h2>
            <p className="text-xs text-[var(--foreground-muted)] mb-3">Your predictions will be hidden until after the movie.</p>
            <div className="space-y-3">
              <textarea
                value={plotGuess} onChange={(e) => { setPlotGuess(e.target.value); setPredictionSaved(false); }}
                placeholder="What do you think will happen? Any plot predictions?"
                rows={2}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
              />
              <div className="flex items-center gap-3">
                <label className="text-xs text-[var(--foreground-muted)]">Rating prediction (1-10):</label>
                <input
                  type="number" value={ratingGuess} onChange={(e) => { setRatingGuess(e.target.value); setPredictionSaved(false); }}
                  min={1} max={10} step={0.5} placeholder="7.5"
                  className="w-20 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[var(--ratist-red)]"
                />
                <button onClick={savePrediction} disabled={predictionSaved}
                  className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${predictionSaved ? "bg-green-500/20 text-green-400" : "bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white"}`}>
                  {predictionSaved ? "Saved ✓" : "Save Prediction"}
                </button>
              </div>
            </div>
          </section>

          {/* Ready up + Start */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white mb-1">Ready Up</h2>
                <p className="text-xs text-[var(--foreground-muted)]">{readyCount}/{session.participants.length} ready</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={toggleReady} className={`text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors ${readyUsers[myUserId] ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-[var(--surface-2)] text-white border border-[var(--border)] hover:border-[var(--ratist-red)]"}`}>
                  {readyUsers[myUserId] ? "Ready ✓" : "Ready Up"}
                </button>
                {amHost && (
                  <button onClick={startCountdown} disabled={!allReady || !session.movieTitle}
                    className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-30">
                    Start
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── COUNTDOWN ── */}
      {session.status === "COUNTDOWN" && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg text-[var(--foreground-muted)] mb-4">Get ready to press play!</p>
          <div className="text-8xl font-bold text-[var(--ratist-red)] animate-pulse">
            {countdown ?? "..."}
          </div>
          <p className="text-sm text-[var(--foreground-muted)] mt-4">Press play on your movie when the countdown hits 0</p>
        </div>
      )}

      {/* ── WATCHING ── */}
      {session.status === "WATCHING" && (
        <div className="space-y-4">
          {/* Movie info bar */}
          <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              {session.posterPath && (
                <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0">
                  <Image src={`${TMDB_SM}${session.posterPath}`} alt="" width={40} height={56} className="object-cover w-full h-full" />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">{session.movieTitle}</p>
                <p className="text-xs text-[var(--foreground-muted)]">Now watching</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Bookmark */}
              <div className="flex items-center gap-2">
                <input type="text" value={bookmarkNote} onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="Bookmark note..."
                  className="w-40 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none hidden sm:block" />
                <button onClick={saveBookmark}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${bookmarkSaved ? "bg-green-500/20 text-green-400" : "bg-[var(--surface-2)] border border-[var(--border)] text-white hover:border-[var(--ratist-red)]"}`}>
                  <Bookmark className="w-3 h-3" /> {bookmarkSaved ? "Saved!" : "Bookmark"}
                </button>
              </div>
              {/* Pause */}
              <button onClick={sendPauseRequest} className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
                <PauseCircle className="w-3 h-3" /> Pause
              </button>
              {/* Finished */}
              <div className="text-xs text-[var(--foreground-muted)]">
                {session.participants.filter((p) => p.hasFinished).length}/{session.participants.length} done
              </div>
              {!me?.hasFinished ? (
                <button onClick={() => markFinished()} className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-white hover:border-[var(--ratist-red)]">
                  I&apos;m Done
                </button>
              ) : (
                <span className="text-xs text-green-400">Done ✓</span>
              )}
              {amHost && (
                <button onClick={() => markFinished(true)} className="text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] rounded-lg px-3 py-1.5 hover:bg-[var(--ratist-red)]/30">
                  Force End
                </button>
              )}
            </div>
          </div>

          {/* Chat + polls stream */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col" style={{ height: "460px" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[var(--ratist-red)]" /> Chat
              </h2>
              <button onClick={() => setShowPollForm(!showPollForm)} className="flex items-center gap-1 text-xs text-[var(--ratist-red)] hover:underline">
                <BarChart3 className="w-3 h-3" /> {showPollForm ? "Cancel" : "Create Poll"}
              </button>
            </div>

            {/* Poll creation form (collapsible) */}
            {showPollForm && (
              <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/50 space-y-2">
                <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Poll question..."
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                <div className="flex flex-wrap gap-2">
                  {pollOptions.map((opt, i) => (
                    <input key={i} type="text" value={opt} onChange={(e) => { const opts = [...pollOptions]; opts[i] = e.target.value; setPollOptions(opts); }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 min-w-[100px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {pollOptions.length < 6 && <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-[10px] text-[var(--ratist-red)]">+ Option</button>}
                  <button onClick={createPoll} className="ml-auto text-xs bg-[var(--ratist-red)] text-white rounded-lg px-4 py-1.5">Submit Poll</button>
                </div>
              </div>
            )}

            {/* Messages + polls timeline */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {buildChatTimeline().map((item) => {
                if (item.type === "poll") {
                  return <div key={item.key}>{renderPoll(item.data, true)}</div>;
                }
                const msg = item.data as RTDBChatMessage & { key: string };
                const isMine = msg.userId === myUserId;
                const elapsed = session?.startedAt ? Math.floor((msg.timestamp - new Date(session.startedAt).getTime()) / 1000) : 0;
                const elapsedStr = elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "";
                return (
                  <div key={msg.key} className={`flex items-start gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 ${isMine ? "bg-[var(--ratist-red)]/20" : "bg-[var(--surface-2)]"}`}>
                      <div className={`flex items-center gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                        {!isMine && <p className="text-[10px] text-[var(--foreground-muted)]">{msg.userName}</p>}
                        {elapsedStr && <p className="text-[9px] text-[var(--foreground-muted)]">{elapsedStr}</p>}
                      </div>
                      {msg.emoji ? (
                        <span className="text-2xl">{msg.emoji}</span>
                      ) : (
                        <p className="text-sm text-white">{msg.text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Quick emoji row */}
            <div className="flex items-center gap-1 px-4 py-2 border-t border-[var(--border)]">
              {QUICK_EMOJIS.map((e) => (
                <button key={e} onClick={() => sendChat("", e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)]">
              <input
                ref={chatInputRef}
                type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendTextFromInput(); } }}
                placeholder="Type a message..."
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              <button onClick={sendTextFromInput}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white p-2 rounded-lg transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POST WATCH ── */}
      {session.status === "POST_WATCH" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 text-center">
            <h2 className="text-lg font-bold text-white mb-2">Movie&apos;s Over!</h2>
            <p className="text-sm text-[var(--foreground-muted)]">Time to see how everyone&apos;s predictions held up and rate the film.</p>
          </div>

          {/* Predictions reveal */}
          {session.predictions.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Prediction Reveal</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {session.predictions.map((pred) => {
                  const pUser = session.participants.find((p) => p.userId === pred.userId)?.user;
                  return (
                    <div key={pred.userId} className="bg-[var(--surface-2)] rounded-lg p-4">
                      <p className="text-sm font-semibold text-white mb-1">{pUser?.name ?? "Unknown"}</p>
                      {pred.ratingGuess != null && (
                        <p className="text-xs text-[var(--foreground-muted)]">Predicted rating: <span className="text-[var(--ratist-red)] font-bold">{pred.ratingGuess}/10</span></p>
                      )}
                      {pred.plotGuess && (
                        <p className="text-xs text-[var(--foreground-muted)] mt-1 italic">&ldquo;{pred.plotGuess}&rdquo;</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Polls recap */}
          {session.polls.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Poll Results</h2>
              {session.polls.map((poll) => {
                const totalVotes = Object.keys(poll.votes).length;
                return (
                  <div key={poll.id} className="mb-4 bg-[var(--surface-2)] rounded-lg p-4">
                    <p className="text-xs text-white font-medium mb-2">{poll.question}</p>
                    {(poll.options as string[]).map((opt: string, i: number) => {
                      const voteCount = Object.values(poll.votes).filter((v) => v === i).length;
                      const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                      return (
                        <div key={i} className="mb-1 rounded-lg px-2 py-1.5 text-xs relative overflow-hidden bg-[var(--surface)]">
                          <div className="absolute inset-0 bg-[var(--ratist-red)]/10 rounded-lg" style={{ width: `${pct}%` }} />
                          <span className="relative text-white">{opt}</span>
                          <span className="relative float-right text-[var(--foreground-muted)]">{voteCount} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          )}

          {/* Bookmarks */}
          {session.bookmarks.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Bookmarked Moments</h2>
              <div className="space-y-2">
                {session.bookmarks.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 bg-[var(--surface-2)] rounded-lg px-3 py-2">
                    <span className="text-xs font-mono text-[var(--ratist-red)]">{b.timestamp}</span>
                    <span className="text-xs text-white">{b.note ?? "Bookmarked"}</span>
                    <span className="text-[10px] text-[var(--foreground-muted)] ml-auto">— {b.user.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Rate the movie link */}
          {session.tmdbId && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
              <h2 className="text-sm font-semibold text-white mb-2">Rate This Movie</h2>
              <p className="text-xs text-[var(--foreground-muted)] mb-3">Use the Ratist rating system, then come back to compare.</p>
              <a href={`/movies/${session.tmdbId}`} target="_blank" rel="noopener noreferrer"
                className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors">
                Go to Movie Page
              </a>
            </section>
          )}

          {/* Complete session */}
          {amHost && (
            <div className="text-center">
              <button onClick={completeSession}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-8 py-3 rounded-lg transition-colors">
                Complete Session & View Recap
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
