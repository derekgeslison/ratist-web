"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { MonitorPlay, Copy, Check, Search, X, Send, Bookmark, PauseCircle, BarChart3, MessageCircle } from "lucide-react";
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
  user: { id: string; name: string; avatarUrl: string | null };
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

  // Bookmarks
  const [bookmarkTime, setBookmarkTime] = useState("");
  const [bookmarkNote, setBookmarkNote] = useState("");

  // Polls
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPollForm, setShowPollForm] = useState(false);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);
  const isHost = session?.hostId === user?.uid || session?.host?.id === session?.hostId;
  const myUserId = session?.participants.find((p) => p.user.name === user?.displayName)?.userId ?? "";

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
          // Host transitions to WATCHING
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
    // First ensure the movie is cached in our DB
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/tmdb/movie/${m.id}`);
    // Then look up the internal movie ID
    const movieRes = await fetch(`/api/tmdb/movie/${m.id}`);
    const movieData = await movieRes.json();
    await apiPatch({
      movieId: movieData.id,
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
    await fetch(`/api/screening/${id}/predictions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plotGuess: plotGuess || null, ratingGuess: ratingGuess || null }),
    });
    setPredictionSaved(true);
  }

  async function sendChat(text: string, emoji?: string) {
    if (!rtdb || !user) return;
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
  }

  async function sendPauseRequest() {
    if (!rtdb || !user) return;
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
    if (!bookmarkTime) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/bookmarks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: bookmarkTime, note: bookmarkNote || null }),
    });
    setBookmarkTime("");
    setBookmarkNote("");
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

  const me = session.participants.find((p) => p.user.id === myUserId);
  const amHost = session.host.id === myUserId;
  const readyCount = Object.values(readyUsers).filter(Boolean).length;
  const allReady = readyCount === session.participants.length && session.participants.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          {/* Movie selection */}
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
                  <button onClick={() => apiPatch({ movieId: null, tmdbId: null, movieTitle: null, posterPath: null })} className="text-xs text-[var(--ratist-red)] hover:underline mt-1">Change movie</button>
                </div>
              </div>
            ) : (
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
                value={plotGuess} onChange={(e) => setPlotGuess(e.target.value)}
                placeholder="What do you think will happen? Any plot predictions?"
                rows={2}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
              />
              <div className="flex items-center gap-3">
                <label className="text-xs text-[var(--foreground-muted)]">Rating prediction (1-10):</label>
                <input
                  type="number" value={ratingGuess} onChange={(e) => setRatingGuess(e.target.value)}
                  min={1} max={10} step={0.5} placeholder="7.5"
                  className="w-20 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[var(--ratist-red)]"
                />
                <button onClick={savePrediction} className="text-sm text-[var(--ratist-red)] hover:underline">
                  {predictionSaved ? "Saved!" : "Save prediction"}
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
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Chat (2 cols) */}
          <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col" style={{ height: "500px" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[var(--ratist-red)]" /> Chat
              </h2>
              <button onClick={sendPauseRequest} className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                <PauseCircle className="w-4 h-4" /> Pause Request
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {chatMessages.map((msg) => (
                <div key={msg.key} className={`flex items-start gap-2 ${msg.userId === myUserId ? "flex-row-reverse" : ""}`}>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 ${msg.userId === myUserId ? "bg-[var(--ratist-red)]/20" : "bg-[var(--surface-2)]"}`}>
                    {msg.userId !== myUserId && <p className="text-[10px] text-[var(--foreground-muted)] mb-0.5">{msg.userName}</p>}
                    {msg.emoji ? (
                      <span className="text-2xl">{msg.emoji}</span>
                    ) : (
                      <p className="text-sm text-white">{msg.text}</p>
                    )}
                  </div>
                </div>
              ))}
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
                type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && chatInput.trim()) sendChat(chatInput.trim()); }}
                placeholder="Type a message..."
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              <button onClick={() => chatInput.trim() && sendChat(chatInput.trim())}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white p-2 rounded-lg transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Movie info */}
            {session.posterPath && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
                <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0">
                  <Image src={`${TMDB_SM}${session.posterPath}`} alt="" width={48} height={64} className="object-cover w-full h-full" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{session.movieTitle}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">Now watching</p>
                </div>
              </div>
            )}

            {/* Bookmark */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1"><Bookmark className="w-3 h-3 text-[var(--ratist-red)]" /> Bookmark a Moment</h3>
              <div className="space-y-2">
                <input type="text" value={bookmarkTime} onChange={(e) => setBookmarkTime(e.target.value)}
                  placeholder="Timestamp (e.g. 1:23:45)"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                <input type="text" value={bookmarkNote} onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                <button onClick={saveBookmark} disabled={!bookmarkTime}
                  className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg py-1.5 text-white hover:border-[var(--ratist-red)] disabled:opacity-30">Save Bookmark</button>
              </div>
            </div>

            {/* Quick Poll */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3 text-[var(--ratist-red)]" /> Polls</h3>
              {!showPollForm ? (
                <button onClick={() => setShowPollForm(true)} className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg py-1.5 text-white hover:border-[var(--ratist-red)]">
                  Create Poll
                </button>
              ) : (
                <div className="space-y-2">
                  <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Question..."
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                  {pollOptions.map((opt, i) => (
                    <input key={i} type="text" value={opt} onChange={(e) => { const opts = [...pollOptions]; opts[i] = e.target.value; setPollOptions(opts); }}
                      placeholder={`Option ${i + 1}`}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                  ))}
                  <div className="flex gap-2">
                    {pollOptions.length < 6 && <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-[10px] text-[var(--ratist-red)]">+ Option</button>}
                    <button onClick={createPoll} className="flex-1 text-xs bg-[var(--ratist-red)] text-white rounded-lg py-1.5">Submit</button>
                    <button onClick={() => setShowPollForm(false)} className="text-xs text-[var(--foreground-muted)]">Cancel</button>
                  </div>
                </div>
              )}

              {/* Active polls */}
              {session.polls.map((poll) => {
                const totalVotes = Object.keys(poll.votes).length;
                const myVote = poll.votes[myUserId];
                return (
                  <div key={poll.id} className="mt-3 bg-[var(--surface-2)] rounded-lg p-3">
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
              })}
            </div>

            {/* Finished watching */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-xs font-semibold text-white mb-2">Finished Watching?</h3>
              <p className="text-[10px] text-[var(--foreground-muted)] mb-2">
                {session.participants.filter((p) => p.hasFinished).length}/{session.participants.length} done
              </p>
              {!me?.hasFinished ? (
                <button onClick={() => markFinished()} className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg py-2 text-white hover:border-[var(--ratist-red)]">
                  I&apos;m Done
                </button>
              ) : (
                <p className="text-xs text-green-400">You&apos;ve marked as done ✓</p>
              )}
              {amHost && (
                <button onClick={() => markFinished(true)} className="w-full mt-2 text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] rounded-lg py-2 hover:bg-[var(--ratist-red)]/30">
                  Force End (Host)
                </button>
              )}
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
              <div className="space-y-4">
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
          {session.movieId && (
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
