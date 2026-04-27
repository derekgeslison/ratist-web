"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useIsTyping } from "@/context/TypingGuardContext";
import Image from "next/image";
import { MonitorPlay, Copy, Check, Search, X, Send, Bookmark, PauseCircle, BarChart3, MessageCircle, Bell, BellOff, Link2, ChevronDown, Tv } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { rtdb } from "@/lib/firebase-rtdb";
import { ref, push, onChildAdded, onValue, set, off, remove } from "firebase/database";
import { rtdbPaths, type RTDBChatMessage, playDing, playDoubleDing, playCountdownBeep, warmUpAudio } from "@/lib/screening";
import ScreeningRateForm from "@/components/screening/ScreeningRateForm";
import ScreeningRatingCompare from "@/components/screening/ScreeningRatingCompare";
import ScreeningSuperlatives from "@/components/screening/ScreeningSuperlatives";
import TextareaWithEmoji from "@/components/TextareaWithEmoji";
import ScreeningHeatmap from "@/components/screening/ScreeningHeatmap";
import ScreeningTrivia from "@/components/screening/ScreeningTrivia";
import ScreeningMovieSuggestions from "@/components/screening/ScreeningMovieSuggestions";
import CompactChat from "@/components/screening/CompactChat";
import ShareButton from "@/components/ShareButton";

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
  mediaType: "movie" | "tv";
  status: string;
  inviteCode: string;
  startedAt: string | null;
  finishedAt: string | null;
  host: { id: string; name: string; avatarUrl: string | null };
  participants: Participant[];
  predictions: Prediction[];
  polls: Poll[];
  bookmarks: { id: string; userId: string; timestamp: string; note: string | null; user: { id: string; name: string } }[];
  ratings: { id: string; userId: string; reviewType: string; overallRating: number | null; ratistRating: number | null; storyScore: number | null; styleScore: number | null; emotiveScore: number | null; actingScore: number | null; entertainScore: number | null; reviewText: string | null; user: { id: string; name: string; avatarUrl: string | null } }[];
  chatHighlights: { id: string; text: string; emoji: string | null; reactCount: number; windowGroup: number; timestamp: string; user: { id: string; name: string } }[];
}

interface MovieResult { id: number; title: string; posterPath: string | null; releaseDate: string }

const QUICK_EMOJIS = ["👍", "👎", "😂", "😱", "🔥", "😭", "🤯", "👏", "💀", "❤️"];

/** Format seconds into h:mm:ss or m:ss */
function formatSeconds(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format elapsed time since session start, minus paused time */
function formatElapsed(startedAt: string | null, pausedMs = 0): string {
  if (!startedAt) return "0:00";
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime() - pausedMs) / 1000));
  return formatSeconds(elapsed);
}

export default function ScreeningSessionPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isTyping = useIsTyping();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Movie/show picker
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
  const [searchType, setSearchType] = useState<"movie" | "tv">("movie");

  // Connection status
  const [isConnected, setIsConnected] = useState(true);

  // Predictions
  const [plotGuess, setPlotGuess] = useState("");
  const [ratingGuess, setRatingGuess] = useState("");
  const [predictionSaved, setPredictionSaved] = useState(false);
  const predictionLoaded = useRef(false);

  // Ready up (RTDB)
  const [readyUsers, setReadyUsers] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<number | null>(null);

  // Chat (RTDB)
  const [chatMessages, setChatMessages] = useState<(RTDBChatMessage & { key: string })[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Bookmarks
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [bookmarkSaved, setBookmarkSaved] = useState(false);

  // Polls
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPollForm, setShowPollForm] = useState(false);

  // Movie suggestions
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // Pause system
  const [pauseAlert, setPauseAlert] = useState<string | null>(null);
  const mountedAt = useRef(Date.now());
  const [activePause, setActivePause] = useState<{ requestedBy: string; requestedByUserId?: string; requestedAt: number; accepted: Record<string, boolean> } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [resumeReadyUsers, setResumeReadyUsers] = useState<Record<string, boolean>>({});
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const [totalPausedMsForRender, setTotalPausedMsForRender] = useState(0);
  const pauseStartedAt = useRef<number | null>(null);
  function addPausedTime(ms: number) {
    totalPausedMsRef.current += ms;
    setTotalPausedMsForRender(totalPausedMsRef.current);
  }

  // Post-watch sub-phase: "rate" | "compare"
  const [postWatchPhase, setPostWatchPhase] = useState<"rate" | "compare">("rate");

  // Auto-set to compare when loading a completed session
  useEffect(() => {
    if (session?.status === "COMPLETE") setPostWatchPhase("compare");
  }, [session?.status]);
  const [pingOnMessage, setPingOnMessage] = useState(true);
  const lastPingTimeRef = useRef(0);
  const PING_THROTTLE_MS = 30000; // 30 seconds between message pings
  const pingOnMessageRef = useRef(true);
  const justCreatedPollRef = useRef(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Running timer
  const [elapsedDisplay, setElapsedDisplay] = useState("0:00");

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);
  const myUserId = session?.participants.find((p) => p.user.firebaseUid === user?.uid)?.userId ?? "";
  const myUserIdRef = useRef(myUserId);
  useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);
  const isHost = session?.host?.id === myUserId;
  const isHostRef = useRef(false);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // Pre-populate prediction fields ONCE when session first loads
  useEffect(() => {
    if (!session || !myUserId || predictionLoaded.current) return;
    const myPred = session.predictions.find((p) => p.userId === myUserId);
    if (myPred) {
      if (myPred.plotGuess) setPlotGuess(myPred.plotGuess);
      if (myPred.ratingGuess != null) setRatingGuess(String(myPred.ratingGuess));
      setPredictionSaved(true);
    }
    predictionLoaded.current = true;
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

  // Store chat messages in a ref so highlights can access them reliably
  const chatMessagesRef = useRef(chatMessages);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  // Auto-complete session and generate highlights when entering compare phase (host only)
  useEffect(() => {
    if (postWatchPhase === "compare" && amHost) {
      if (session?.status === "POST_WATCH") completeSession();
      // Generate chat highlights from RTDB messages (with retry)
      const generateHighlights = async (attempt: number) => {
        const token = await getToken();
        const msgs = chatMessagesRef.current;
        if (!token) return;
        // Only include messages from the watching phase (between startedAt and finishedAt)
        const startedAtMs = session?.startedAt ? new Date(session.startedAt).getTime() : 0;
        const finishedAtMs = session?.finishedAt ? new Date(session.finishedAt).getTime() : Infinity;
        const watchingMsgs = msgs.filter((m) => m.timestamp >= startedAtMs && m.timestamp <= finishedAtMs && (m as any).phase !== "lobby" && (m as any).phase !== "postwatch");
        if (watchingMsgs.length === 0) {
          if (attempt < 3) setTimeout(() => generateHighlights(attempt + 1), 1000);
          return;
        }
        await fetch(`/api/screening/${id}/highlights`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messages: watchingMsgs, polls: session?.polls }),
        });
        fetchSession();
      };
      setTimeout(() => generateHighlights(0), 500);
    }
  }, [postWatchPhase]);

  // Poll for session updates (skip while user is typing to prevent input clobbering)
  useEffect(() => {
    if (!user || !session || session.status === "COMPLETE") return;
    const interval = setInterval(() => { if (!isTyping()) fetchSession(); }, 5000);
    return () => clearInterval(interval);
  }, [user, session?.status, fetchSession, isTyping]);

  // Running elapsed timer during watching (freezes when paused)
  useEffect(() => {
    if (!session?.startedAt || session.status !== "WATCHING") return;
    if (isPaused) {
      // Frozen — show the time when we paused
      const currentPauseExtra = pauseStartedAt.current ? Date.now() - pauseStartedAt.current : 0;
      setElapsedDisplay(formatElapsed(session.startedAt, totalPausedMsRef.current + currentPauseExtra));
      return;
    }
    const update = () => setElapsedDisplay(formatElapsed(session.startedAt, totalPausedMsRef.current));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session?.startedAt, session?.status, isPaused, totalPausedMsForRender]);

  // RTDB connection status listener
  useEffect(() => {
    if (!rtdb) return;
    const connRef = ref(rtdb, ".info/connected");
    const unsub = onValue(connRef, (snap) => {
      setIsConnected(snap.val() === true);
    });
    return () => off(connRef, "value", unsub);
  }, []);

  // RTDB listener for suggestions toggle
  useEffect(() => {
    if (!rtdb || !session || session.status !== "LOBBY") return;
    const sugOpenRef = ref(rtdb, rtdbPaths.suggestionsOpen(id));
    const unsub = onValue(sugOpenRef, (snap) => {
      setSuggestionsOpen(snap.val() === true);
    });
    return () => off(sugOpenRef, "value", unsub);
  }, [id, session?.status]);

  // RTDB listeners for ready-up
  useEffect(() => {
    if (!rtdb || !session || session.status !== "LOBBY") return;
    const readyRef = ref(rtdb, rtdbPaths.readyUp(id));
    const unsub = onValue(readyRef, (snap) => {
      setReadyUsers(snap.val() ?? {});
    });
    return () => off(readyRef, "value", unsub);
  }, [id, session?.status]);

  // RTDB listeners for chat (active in all phases — set up once per session ID)
  const chatListenerSetUp = useRef(false);
  useEffect(() => {
    if (!rtdb || chatListenerSetUp.current) return;
    chatListenerSetUp.current = true;
    const chatRef = ref(rtdb, rtdbPaths.chat(id));
    setChatMessages([]);
    let isInitialLoad = true;
    onChildAdded(chatRef, (snap) => {
      const msg = snap.val() as RTDBChatMessage;
      setChatMessages((prev) => [...prev, { ...msg, key: snap.key! }]);
      if (!isInitialLoad) {
        if (msg.userId === "system" && (msg as any).system && msg.text?.includes("New poll:") && !justCreatedPollRef.current) {
          // Polls always ding (no throttle)
          playDing(880, 0.15);
        } else if (pingOnMessageRef.current && msg.userId !== myUserIdRef.current && msg.userId !== "system") {
          // Throttle regular message pings to once per 30 seconds
          const now = Date.now();
          if (now - lastPingTimeRef.current >= PING_THROTTLE_MS) {
            playDing(600, 0.08);
            lastPingTimeRef.current = now;
          }
        }
        justCreatedPollRef.current = false;
      }
    });
    setTimeout(() => { isInitialLoad = false; }, 1000);
    return () => { off(chatRef, "child_added"); chatListenerSetUp.current = false; };
  }, [id]);

  // RTDB listener for active pause request
  useEffect(() => {
    if (!rtdb || !session || session.status !== "WATCHING") return;
    const pauseRef = ref(rtdb, rtdbPaths.activePause(id));
    const unsub = onValue(pauseRef, (snap) => {
      const val = snap.val();
      if (val && val.requestedAt > mountedAt.current - 30000) {
        setActivePause(val);
        if (val.requestedAt > mountedAt.current) {
          playDing();
        }
      } else {
        setActivePause(null);
      }
    });
    return () => off(pauseRef, "value", unsub);
  }, [id, session?.status]);

  // RTDB listener for paused state — uses refs to avoid stale closures
  const isPausedRef = useRef(false);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    if (!rtdb || !session || session.status !== "WATCHING") return;
    const pauseActiveRef = ref(rtdb, rtdbPaths.pauseActive(id));
    const unsub = onValue(pauseActiveRef, (snap) => {
      const val = snap.val();
      if (val && val.paused) {
        if (!isPausedRef.current) {
          pauseStartedAt.current = val.pausedAt || Date.now();
        }
        setIsPaused(true);
      } else {
        // Only add paused time if we haven't already (pauseStartedAt still set)
        if (pauseStartedAt.current) {
          addPausedTime(Date.now() - pauseStartedAt.current!);
          pauseStartedAt.current = null;
        }
        setIsPaused(false);
      }
    });
    return () => off(pauseActiveRef, "value", unsub);
  }, [id, session?.status]);

  // RTDB listener for resume ready-up
  useEffect(() => {
    if (!rtdb || !isPaused) return;
    const resumeRef = ref(rtdb, rtdbPaths.resumeReady(id));
    const unsub = onValue(resumeRef, (snap) => {
      setResumeReadyUsers(snap.val() ?? {});
    });
    return () => off(resumeRef, "value", unsub);
  }, [id, isPaused]);

  // Auto-start resume countdown when all ready during pause (or force resume)
  useEffect(() => {
    if (!isPaused || !session) return;
    // Force resume flag
    if (resumeReadyUsers._forceResume && resumeCountdown === null) {
      playDoubleDing();
      setResumeCountdown(5);
      return;
    }
    const resumeCount = Object.values(resumeReadyUsers).filter((v) => v === true).length;
    const allResumeReady = resumeCount === session.participants.length && session.participants.length > 0;
    if (allResumeReady && resumeCountdown === null) {
      playDoubleDing();
      setResumeCountdown(5);
    }
  }, [resumeReadyUsers, isPaused, session?.participants.length]);

  // Resume countdown timer
  useEffect(() => {
    if (resumeCountdown === null) return;
    if (resumeCountdown <= 0) {
      // Calculate paused duration BEFORE clearing state
      if (pauseStartedAt.current) {
        addPausedTime(Date.now() - pauseStartedAt.current!);
        pauseStartedAt.current = null;
      }
      // Resume — clear RTDB nodes
      if (rtdb) {
        remove(ref(rtdb, rtdbPaths.pauseActive(id)));
        remove(ref(rtdb, rtdbPaths.resumeReady(id)));
        remove(ref(rtdb, rtdbPaths.activePause(id)));
      }
      setResumeCountdown(null);
      setIsPaused(false);
      // Only host posts system messages to avoid duplicates
      if (rtdb && isHostRef.current) {
        push(ref(rtdb, rtdbPaths.chat(id)), {
          userId: "system", userName: "System",
          text: "Resumed! Press play.",
          timestamp: Date.now(), system: true,
        });
      }
      return;
    }
    playCountdownBeep();
    const timer = setTimeout(() => setResumeCountdown((prev) => prev !== null ? prev - 1 : null), 1000);
    return () => clearTimeout(timer);
  }, [resumeCountdown]);

  // Pause request timeout: second ding at 10s, expire at 20s
  // Use a ref to store the current requestedAt to avoid re-creating timers
  const pauseTimersRef = useRef<{ dingTimer: ReturnType<typeof setTimeout> | null; expireTimer: ReturnType<typeof setTimeout> | null; requestedAt: number | null }>({ dingTimer: null, expireTimer: null, requestedAt: null });

  useEffect(() => {
    if (!activePause || isPaused) {
      // Clear any existing timers
      if (pauseTimersRef.current.dingTimer) clearTimeout(pauseTimersRef.current.dingTimer);
      if (pauseTimersRef.current.expireTimer) clearTimeout(pauseTimersRef.current.expireTimer);
      pauseTimersRef.current = { dingTimer: null, expireTimer: null, requestedAt: null };
      return;
    }

    // Only set timers once per pause request
    if (pauseTimersRef.current.requestedAt === activePause.requestedAt) return;
    // Clear old timers
    if (pauseTimersRef.current.dingTimer) clearTimeout(pauseTimersRef.current.dingTimer);
    if (pauseTimersRef.current.expireTimer) clearTimeout(pauseTimersRef.current.expireTimer);

    const elapsed = Date.now() - activePause.requestedAt;
    const secondDingDelay = Math.max(0, 10000 - elapsed);
    const expireDelay = Math.max(0, 20000 - elapsed);

    const dingTimer = setTimeout(() => playDing(660, 0.2), secondDingDelay);
    const expireTimer = setTimeout(() => {
      if (rtdb) remove(ref(rtdb, rtdbPaths.activePause(id)));
      // The requester posts the expiry message
      const isRequester = activePause.requestedByUserId === myUserId;
      if (rtdb && isRequester) {
        push(ref(rtdb, rtdbPaths.chat(id)), {
          userId: "system", userName: "System",
          text: "Pause request expired — not everyone accepted.",
          timestamp: Date.now(), system: true,
        });
      }
      setActivePause(null);
    }, expireDelay);

    pauseTimersRef.current = { dingTimer, expireTimer, requestedAt: activePause.requestedAt };
  }, [activePause, isPaused]);

  // Auto-scroll chat (on new messages and new polls). Important:
  // we set scrollTop on the chat container directly instead of using
  // scrollIntoView. scrollIntoView walks up scroll ancestors and ALSO
  // scrolls the page itself, which was yanking the user to the bottom
  // of the page every time the post-watch phase mounted (initial
  // chatMessages/polls load fired this effect).
  useEffect(() => {
    const c = chatContainerRef.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [chatMessages, session?.polls?.length]);

  // Countdown logic (with sound)
  useEffect(() => {
    if (session?.status !== "COUNTDOWN") { setCountdown(null); return; }
    playDoubleDing();
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
        playCountdownBeep();
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

  async function selectMovie(m: MovieResult, mediaType: "movie" | "tv" = "movie") {
    await apiPatch({ tmdbId: m.id, movieTitle: m.title, posterPath: m.posterPath, mediaType });
    setMovieQuery("");
    setMovieResults([]);
  }

  async function leaveSession() {
    if (!confirm("Leave this screening room?")) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/leave`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    router.push("/screening-room");
  }

  async function cancelSession() {
    if (!confirm("Cancel this screening room? This will delete it for everyone.")) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    router.push("/screening-room");
  }

  function copyInviteCode() {
    if (!session) return;
    navigator.clipboard.writeText(session.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyInviteLink() {
    if (!session) return;
    const url = `${window.location.origin}/screening-room/join/${session.inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleSuggestions() {
    if (!rtdb) return;
    await set(ref(rtdb, rtdbPaths.suggestionsOpen(id)), !suggestionsOpen);
  }

  async function toggleReady() {
    warmUpAudio(); // Unlock audio on first user interaction
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
    if (res.ok) setPredictionSaved(true);
  }

  async function sendChat(text: string, emoji?: string) {
    if (!rtdb || !user || !myUserId) return;
    const msg: Record<string, unknown> = {
      userId: myUserId,
      userName: user.displayName ?? "Anonymous",
      text: text || "",
      timestamp: Date.now(),
    };
    if (user.photoURL) msg.avatarUrl = user.photoURL;
    if (emoji) msg.emoji = emoji;
    try {
      await push(ref(rtdb, rtdbPaths.chat(id)), msg);
    } catch (err) {
      console.error("[ScreeningRoom] chat send failed:", err);
    }
    if (chatInputRef.current) chatInputRef.current.value = "";
  }

  function sendTextFromInput() {
    const val = chatInputRef.current?.value?.trim();
    if (!val) return;
    sendChat(val);
  }

  async function sendPauseRequest() {
    if (!rtdb || !user || !myUserId || activePause || isPaused) return;
    // Create active pause request in RTDB
    await set(ref(rtdb, rtdbPaths.activePause(id)), {
      requestedBy: user.displayName ?? "Anonymous",
      requestedByUserId: myUserId,
      requestedAt: Date.now(),
      accepted: { [myUserId]: true }, // requester auto-accepts
    });
    // Post system message to chat
    await push(ref(rtdb, rtdbPaths.chat(id)), {
      userId: "system", userName: user.displayName ?? "Anonymous",
      text: `${user.displayName ?? "Someone"} is requesting a pause!`,
      timestamp: Date.now(), system: true,
    });
  }

  async function acceptPause() {
    if (!rtdb || !myUserId || !activePause) return;
    await set(ref(rtdb, rtdbPaths.userPauseAccept(id, myUserId)), true);
    // Check if all accepted
    const newAccepted = { ...activePause.accepted, [myUserId]: true };
    const allAccepted = session?.participants.every((p) => newAccepted[p.userId]);
    if (allAccepted) {
      // Activate pause and clear the request node (prevents expiry from firing)
      await set(ref(rtdb, rtdbPaths.pauseActive(id)), { paused: true, pausedAt: Date.now() });
      await remove(ref(rtdb, rtdbPaths.activePause(id)));
      // Only the accepting user posts the message (last to accept)
      await push(ref(rtdb, rtdbPaths.chat(id)), {
        userId: "system", userName: "System",
        text: "Everyone accepted — paused!",
        timestamp: Date.now(), system: true,
      });
    }
  }

  async function toggleResumeReady() {
    if (!rtdb || !myUserId) return;
    const current = resumeReadyUsers[myUserId] ?? false;
    await set(ref(rtdb, rtdbPaths.userResumeReady(id, myUserId)), !current || null);
  }

  async function forceResume() {
    if (!rtdb) return;
    // Write to RTDB so all participants see the countdown
    await set(ref(rtdb, rtdbPaths.resumeReady(id)), { _forceResume: true });
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

  async function undoFinished() {
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/finish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ undo: true }),
    });
    fetchSession();
  }

  async function submitRating(data: Record<string, unknown>) {
    setRatingSubmitting(true);
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/screening/${id}/rate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setRatingSubmitting(false);
    fetchSession();
  }

  async function completeSession() {
    await apiPatch({ status: "COMPLETE" });
  }

  async function saveBookmark() {
    const token = await getToken();
    if (!token) return;
    const currentPauseExtra = isPaused && pauseStartedAt.current ? Date.now() - pauseStartedAt.current : 0;
    const timestamp = formatElapsed(session?.startedAt ?? null, totalPausedMsRef.current + currentPauseExtra);
    await fetch(`/api/screening/${id}/bookmarks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp, note: bookmarkNote || null }),
    });
    // Also post bookmark as chat message
    const sysMsg: Record<string, unknown> = {
      userId: "system",
      userName: user?.displayName ?? "Anonymous",
      text: `Bookmarked${bookmarkNote ? `: ${bookmarkNote}` : ""}`,
      timestamp: Date.now(),
      system: true,
    };
    if (rtdb) await push(ref(rtdb, rtdbPaths.chat(id)), sysMsg);
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
    // Post poll notification to chat
    justCreatedPollRef.current = true;
    if (rtdb) {
      await push(ref(rtdb, rtdbPaths.chat(id)), {
        userId: "system", userName: user?.displayName ?? "Someone",
        text: `New poll: "${pollQuestion}"`,
        timestamp: Date.now(), system: true,
      });
    }
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

  // ── Movie/show search ──
  useEffect(() => {
    if (movieQuery.length < 2) { setMovieResults([]); return; }
    const endpoint = searchType === "tv" ? "/api/tmdb/tv/search" : "/api/tmdb/movie/search";
    const t = setTimeout(async () => {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(movieQuery)}`);
      const data = await res.json();
      setMovieResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [movieQuery, searchType]);

  // ── Render ──

  if (!user) {
    return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">Sign in to join this screening room.</div>;
  }
  if (loading) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">Loading...</div>;
  if (error) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <MonitorPlay className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-4" />
      <h2 className="text-lg font-bold text-white mb-2">Session Unavailable</h2>
      <p className="text-sm text-[var(--foreground-muted)] mb-4">This screening room may have been cancelled by the host or is no longer available.</p>
      <Link href="/screening-room" className="text-sm text-[var(--ratist-red)] hover:underline">← Back to Screening Rooms</Link>
    </div>
  );
  if (!session) return null;

  const me = session.participants.find((p) => p.userId === myUserId);
  const amHost = session.host.id === myUserId;
  const readyCount = Object.values(readyUsers).filter(Boolean).length;
  const allReady = readyCount === session.participants.length && session.participants.length > 0;
  const isEmptySession = amHost && session.participants.length <= 1 && (session.status === "WATCHING" || session.status === "POST_WATCH");

  function renderPoll(poll: Poll) {
    const totalVotes = Object.keys(poll.votes).length;
    const myVote = poll.votes[myUserId];
    return (
      <div className="bg-[var(--surface-2)] rounded-lg p-3 my-2">
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

  // Show invite code only in lobby
  const showInviteCode = session.status === "LOBBY" || session.status === "COUNTDOWN";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Connection lost banner */}
      {!isConnected && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-black text-center py-2 text-sm font-medium">
          Connection lost — trying to reconnect...
        </div>
      )}

      {/* Pause accept/reject overlay. Visible to everyone in the
          session (including the requester, who auto-accepts on send)
          so all participants can see the expiration wipe and live
          accept count. The button slot swaps to a status line once
          the current user has accepted — keeping the requester and
          already-accepted recipients in the loop instead of dropping
          the popup the moment they accept. */}
      {activePause && !isPaused && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-500/95 text-black px-6 py-4 rounded-xl shadow-2xl max-w-sm w-full mx-4">
          <div className="flex items-center gap-3 mb-3">
            {/* Circular countdown timer */}
            <div className="relative w-8 h-8 flex-shrink-0">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="3"
                  strokeDasharray="94.2" strokeDashoffset="0" strokeLinecap="round"
                  style={{ animation: "countdown-wipe 20s linear forwards" }} />
              </svg>
              <PauseCircle className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="font-semibold">
              {activePause.requestedByUserId === myUserId
                ? "You requested a pause"
                : `${activePause.requestedBy} wants to pause!`}
            </span>
          </div>
          {activePause.accepted[myUserId] ? (
            <p className="text-center text-xs text-black/70 font-semibold py-2">
              Waiting for everyone to accept…
            </p>
          ) : (
            <div className="flex gap-2">
              <button onClick={acceptPause}
                className="flex-1 bg-black/20 hover:bg-black/30 text-black font-semibold py-2 rounded-lg transition-colors">
                Accept Pause
              </button>
            </div>
          )}
          <p className="text-[10px] text-black/60 mt-2 text-center">
            {Object.values(activePause.accepted).filter(Boolean).length}/{session?.participants.length ?? 0} accepted
          </p>
          <style jsx>{`
            @keyframes countdown-wipe {
              from { stroke-dashoffset: 0; }
              to { stroke-dashoffset: 94.2; }
            }
          `}</style>
        </div>
      )}

      {/* Paused overlay with resume ready-up */}
      {isPaused && resumeCountdown === null && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
            <PauseCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white mb-2">Paused</h2>
            <p className="text-sm text-[var(--foreground-muted)] mb-2">Ready up when you&apos;re ready to resume</p>
            <p className="text-[10px] text-[var(--foreground-muted)] mb-6">A 5-second countdown will begin when everyone is ready</p>
            <p className="text-xs text-[var(--foreground-muted)] mb-3">
              {Object.values(resumeReadyUsers).filter(Boolean).length}/{session?.participants.length ?? 0} ready to resume
            </p>
            <button onClick={toggleResumeReady}
              className={`w-full text-sm font-semibold py-3 rounded-lg transition-colors ${resumeReadyUsers[myUserId] ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white"}`}>
              {resumeReadyUsers[myUserId] ? "Ready to Resume ✓" : "Ready to Resume"}
            </button>
            {amHost && (
              <button onClick={forceResume}
                className="w-full mt-2 text-xs text-[var(--ratist-red)] hover:underline py-2">
                Force Resume (Host)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resume countdown overlay */}
      {resumeCountdown !== null && resumeCountdown > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-[var(--foreground-muted)] mb-4">Resuming in...</p>
            <div className="text-8xl font-bold text-[var(--ratist-red)] animate-pulse">{resumeCountdown}</div>
            <p className="text-sm text-[var(--foreground-muted)] mt-4">Get ready to press play!</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <MonitorPlay className="w-5 h-5 text-[var(--ratist-red)] flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white truncate">{session.movieTitle ?? "Screening Room"}</h1>
            <p className="text-xs text-[var(--foreground-muted)]">
              Hosted by {session.host.name} · {session.participants.length} participant{session.participants.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {showInviteCode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={copyInviteCode} className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-l-lg px-3 py-2 text-sm text-white hover:border-[var(--ratist-red)] transition-colors" title="Copy code">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              <span className="font-mono tracking-widest text-xs">{session.inviteCode}</span>
            </button>
            <button onClick={copyInviteLink} className="bg-[var(--surface)] border border-[var(--border)] rounded-r-lg px-2.5 py-2 text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors" title="Copy invite link">
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Empty session notice */}
      {isEmptySession && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 mb-4 text-center">
          <p className="text-sm text-yellow-400 font-medium mb-2">All other participants have left the session.</p>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">You can end the session or continue on your own.</p>
          <button onClick={() => { completeSession(); setPostWatchPhase("compare"); }}
            className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
            End Session
          </button>
        </div>
      )}

      {/* ── LOBBY ── */}
      {session.status === "LOBBY" && (
        <div className="space-y-5">
          {/* Movie selection */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">{session.mediaType === "tv" ? "TV Show" : "Movie"}</h2>
              {amHost && !session.movieTitle && (
                <button onClick={toggleSuggestions}
                  className={`text-[10px] px-3 py-1 rounded-full transition-colors ${suggestionsOpen ? "bg-green-500/20 text-green-400" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"}`}>
                  {suggestionsOpen ? "Suggestions Open" : "Open Suggestions"}
                </button>
              )}
            </div>

            {session.movieTitle ? (
              <div className="flex items-center gap-4">
                {session.posterPath && (
                  <div className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0">
                    <Image src={`${TMDB_IMG}${session.posterPath}`} alt={session.movieTitle} width={64} height={96} className="object-cover w-full h-full" />
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold">{session.movieTitle}</p>
                  {amHost && <button onClick={() => apiPatch({ movieId: null, tmdbId: null, movieTitle: null, posterPath: null })} className="text-xs text-[var(--ratist-red)] hover:underline mt-1">Change {session.mediaType === "tv" ? "show" : "movie"}</button>}
                </div>
              </div>
            ) : suggestionsOpen ? (
              <ScreeningMovieSuggestions
                sessionId={id}
                myUserId={myUserId}
                myName={user?.displayName ?? "Anonymous"}
                isHost={amHost}
                onSelectMovie={(m) => selectMovie({ id: m.id, title: m.title, posterPath: m.posterPath, releaseDate: "" }, "movie")}
              />
            ) : amHost ? (
              <div className="relative">
                <div className="flex items-center gap-1 mb-2">
                  <button onClick={() => { if (searchType !== "movie") { setSearchType("movie"); setMovieQuery(""); setMovieResults([]); } }}
                    className={`text-[10px] px-3 py-1 rounded-full transition-colors ${searchType === "movie" ? "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 text-white" : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    Movie
                  </button>
                  <button onClick={() => { if (searchType !== "tv") { setSearchType("tv"); setMovieQuery(""); setMovieResults([]); } }}
                    className={`text-[10px] px-3 py-1 rounded-full transition-colors ${searchType === "tv" ? "bg-blue-600/20 border border-blue-500/40 text-blue-400" : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    TV Show
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-[var(--foreground-muted)]" />
                  <input type="text" value={movieQuery} onChange={(e) => setMovieQuery(e.target.value)} placeholder={searchType === "tv" ? "Search for a show..." : "Search for a movie..."}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                  {movieQuery && <button onClick={() => { setMovieQuery(""); setMovieResults([]); }}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>}
                </div>
                {movieResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {movieResults.map((m) => (
                      <button key={m.id} onClick={() => selectMovie(m, searchType)} className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
                        <div className="w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                          {m.posterPath && <Image src={`${TMDB_SM}${m.posterPath}`} alt={m.title} width={32} height={48} className="object-cover w-full h-full" />}
                        </div>
                        <div>
                          <p className="text-sm text-white">{searchType === "tv" && <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-400 bg-blue-600/20 px-1 py-0.5 rounded leading-none mr-1.5"><Tv className="w-2.5 h-2.5" />TV</span>}{m.title}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">Waiting for the host to pick a movie or show...</p>
            )}
          </section>

          {/* Movie Trivia */}
          {session.tmdbId && <ScreeningTrivia tmdbId={session.tmdbId} />}

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
            <p className="text-xs text-[var(--foreground-muted)] mb-3">Your predictions will be hidden until after the {session.mediaType === "tv" ? "show" : "movie"}.</p>
            <div className="space-y-3">
              <TextareaWithEmoji
                value={plotGuess} onChange={(e) => { setPlotGuess(e.target.value); setPredictionSaved(false); }}
                placeholder="What do you think will happen? Any plot predictions?"
                rows={2}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
              />
              <div className="flex flex-wrap items-center gap-3">
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
            <p className="text-[10px] text-yellow-400/70 mb-3">If you&apos;re watching on a service with ads, let any pre-roll ads play before readying up.</p>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white mb-1">Ready Up</h2>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {readyCount}/{session.participants.length} ready
                  {allReady && !amHost && <span className="text-yellow-400 ml-2">— Waiting on host to start</span>}
                </p>
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

          {/* Lobby chat */}
          <CompactChat
            sessionId={id}
            myUserId={myUserId}
            myName={user?.displayName ?? "Anonymous"}
            myPhotoURL={user?.photoURL ?? undefined}
            chatMessages={chatMessages}
            maxHeight="180px"
            label="Lobby Chat" phase="lobby"
          />

          {/* Leave / Cancel */}
          <div className="text-center">
            {amHost ? (
              <button onClick={cancelSession} className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                Cancel Session
              </button>
            ) : (
              <button onClick={leaveSession} className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                Leave Session
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── COUNTDOWN ── */}
      {session.status === "COUNTDOWN" && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg text-[var(--foreground-muted)] mb-4">Get ready to press play!</p>
          <div className="text-8xl font-bold text-[var(--ratist-red)] animate-pulse">
            {countdown ?? "..."}
          </div>
          <p className="text-sm text-[var(--foreground-muted)] mt-4">Press play when the countdown hits 0</p>
        </div>
      )}

      {/* ── WATCHING ── */}
      {session.status === "WATCHING" && (
        <div className="space-y-3">
          {/* Row 1: Movie info + elapsed timer */}
          <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            {session.posterPath && (
              <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0">
                <Image src={`${TMDB_SM}${session.posterPath}`} alt="" width={40} height={56} className="object-cover w-full h-full" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{session.movieTitle}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Now watching</p>
            </div>
            <div className="text-lg font-mono text-[var(--ratist-red)] font-bold flex-shrink-0">{elapsedDisplay}</div>
          </div>

          {/* Row 2: Actions — responsive wrap */}
          <div className="flex flex-wrap items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            {/* Bookmark */}
            <input type="text" value={bookmarkNote} onChange={(e) => setBookmarkNote(e.target.value)}
              placeholder="Bookmark note..."
              className="flex-1 min-w-[120px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
            <button onClick={saveBookmark}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ${bookmarkSaved ? "bg-green-500/20 text-green-400" : "bg-[var(--surface-2)] border border-[var(--border)] text-white hover:border-[var(--ratist-red)]"}`}>
              <Bookmark className="w-3 h-3" /> {bookmarkSaved ? "Saved!" : "Bookmark"}
            </button>

            <div className="w-px h-5 bg-[var(--border)] hidden sm:block" />

            {/* Done status + buttons */}
            <span className="text-xs text-[var(--foreground-muted)] flex-shrink-0">{session.participants.filter((p) => p.hasFinished).length}/{session.participants.length} done</span>
            {!me?.hasFinished ? (
              <button onClick={() => markFinished()} className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-white hover:border-[var(--ratist-red)] flex-shrink-0">
                Done Watching
              </button>
            ) : (
              <button onClick={undoFinished} className="text-xs text-green-400 hover:text-yellow-400 flex-shrink-0 transition-colors" title="Undo">Done ✓ (undo)</button>
            )}
            {amHost && (
              <button onClick={() => { if (confirm("End for everyone? This will move all participants to the post-watch phase.")) markFinished(true); }}
                className="text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] rounded-lg px-3 py-1.5 hover:bg-[var(--ratist-red)]/30 flex-shrink-0">
                Force End
              </button>
            )}
          </div>

          {/* Chat */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col" style={{ height: "420px" }}>
            {/* Chat header with pause + create poll */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[var(--ratist-red)]" /> Chat
              </h2>
              <div className="flex items-center gap-3">
                <button onClick={() => { setPingOnMessage(!pingOnMessage); pingOnMessageRef.current = !pingOnMessage; }}
                  className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors" title={pingOnMessage ? "Mute message pings" : "Ping on new messages"}>
                  {pingOnMessage ? <Bell className="w-3.5 h-3.5 text-[var(--ratist-red)]" /> : <BellOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={sendPauseRequest} disabled={!!activePause || isPaused} className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-30">
                  <PauseCircle className="w-3 h-3" /> Pause
                </button>
                <button onClick={() => setShowPollForm(!showPollForm)} className="flex items-center gap-1 text-xs text-[var(--ratist-red)] hover:underline">
                  <BarChart3 className="w-3 h-3" /> {showPollForm ? "Cancel" : "Poll"}
                </button>
              </div>
            </div>

            {/* Poll form */}
            {showPollForm && (
              <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]/50 space-y-2">
                <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Poll question..."
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                <div className="flex flex-wrap gap-2">
                  {pollOptions.map((opt, i) => (
                    <input key={i} type="text" value={opt} onChange={(e) => { const opts = [...pollOptions]; opts[i] = e.target.value; setPollOptions(opts); }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 min-w-[80px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {pollOptions.length < 6 && <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-[10px] text-[var(--ratist-red)]">+ Option</button>}
                  <button onClick={createPoll} className="ml-auto text-xs bg-[var(--ratist-red)] text-white rounded-lg px-4 py-1">Submit</button>
                </div>
              </div>
            )}

            {/* Messages + polls timeline */}
            <div ref={chatContainerRef} onScroll={() => {
              if (!chatContainerRef.current) return;
              const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
              setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 60);
            }} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 relative">
              {buildChatTimeline().map((item) => {
                if (item.type === "poll") {
                  return <div key={item.key}>{renderPoll(item.data)}</div>;
                }
                const msg = item.data as RTDBChatMessage & { key: string; system?: boolean };
                const isMine = msg.userId === myUserId;
                const isSystem = msg.userId === "system" || (msg as any).system;
                const isPreWatch = session?.startedAt ? msg.timestamp < new Date(session.startedAt).getTime() : true;
                const elapsed = !isPreWatch && session?.startedAt ? Math.max(0, Math.floor((msg.timestamp - new Date(session.startedAt).getTime() - totalPausedMsRef.current) / 1000)) : 0;
                const elapsedStr = !isPreWatch && elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "";

                if (isSystem) {
                  return (
                    <div key={msg.key} className="text-center py-1">
                      <span className="text-[10px] text-yellow-400/80 bg-yellow-400/10 px-3 py-1 rounded-full">
                        {elapsedStr && <span className="mr-1">{elapsedStr}</span>}
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={msg.key} data-msg-ts={msg.timestamp} className={`flex items-start gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
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
              {showScrollBtn && (
                <button onClick={() => {
                  const c = chatContainerRef.current;
                  if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
                }}
                  className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-[var(--surface-2)] border border-[var(--border)] rounded-full p-2 shadow-lg z-10">
                  <ChevronDown className="w-3 h-3 text-white" />
                </button>
              )}
            </div>

            {/* Quick emoji row */}
            <div className="flex items-center gap-1 px-4 py-1.5 border-t border-[var(--border)] overflow-x-auto">
              {QUICK_EMOJIS.map((e) => (
                <button key={e} onClick={() => sendChat("", e)} className="text-lg hover:scale-125 transition-transform flex-shrink-0">{e}</button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[var(--border)]">
              <input
                ref={chatInputRef}
                type="text"
                defaultValue=""
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendTextFromInput(); } }}
                placeholder="Type a message..."
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              <button onClick={sendTextFromInput}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white p-2 rounded-lg transition-colors flex-shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Leave session (non-host) */}
          {!amHost && (
            <div className="text-center mt-4">
              <button onClick={leaveSession} className="text-[10px] text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                Leave Session
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── POST WATCH ── */}
      {(session.status === "POST_WATCH" || session.status === "COMPLETE") && (() => {
        const myRating = session.ratings.find((r) => r.userId === myUserId);
        const ratedCount = session.ratings.length;
        const totalParticipants = session.participants.length;
        const allRated = ratedCount === totalParticipants;

        return (
        <div className="space-y-6">
          {/* Phase indicator */}
          <div className="flex items-center gap-2 justify-center">
            <button onClick={() => setPostWatchPhase("rate")}
              className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${postWatchPhase === "rate" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"}`}>
              1. Rate
            </button>
            <div className="w-8 h-px bg-[var(--border)]" />
            <button onClick={() => setPostWatchPhase("compare")}
              className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${postWatchPhase === "compare" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"}`}>
              2. Compare
            </button>
          </div>

          {/* ── RATE PHASE ── */}
          {postWatchPhase === "rate" && (
            <>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 text-center">
                <h2 className="text-lg font-bold text-white mb-2">Rate {session.movieTitle}</h2>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {ratedCount}/{totalParticipants} have submitted their rating
                </p>
              </div>

              {/* Rating form */}
              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <ScreeningRateForm
                  onSubmit={submitRating}
                  submitting={ratingSubmitting}
                  submitted={!!myRating}
                />
              </section>

              {/* Progress + proceed */}
              {allRated && (
                <div className="text-center">
                  <p className="text-sm text-green-400 mb-3">Everyone has rated!</p>
                  <button onClick={() => setPostWatchPhase("compare")}
                    className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors">
                    View Comparison
                  </button>
                </div>
              )}
              {!allRated && myRating && (
                <div className="text-center">
                  <p className="text-xs text-[var(--foreground-muted)] mb-2">Waiting for others ({ratedCount}/{totalParticipants})...</p>
                </div>
              )}
              {!allRated && amHost && (
                <div className="text-center">
                  <button onClick={() => setPostWatchPhase("compare")}
                    className="text-xs text-[var(--ratist-red)] hover:underline">
                    Skip to comparison (host)
                  </button>
                </div>
              )}
              {/* Post-watch chat */}
              <CompactChat
                sessionId={id}
                myUserId={myUserId}
                myName={user?.displayName ?? "Anonymous"}
                myPhotoURL={user?.photoURL ?? undefined}
                chatMessages={chatMessages}
                maxHeight="200px"
                label="Post-Watch Chat" phase="postwatch"
              />

              {/* Leave session (non-host) */}
              {!amHost && (
                <div className="text-center mt-4">
                  <button onClick={leaveSession} className="text-[10px] text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                    Leave Session
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── COMPARE PHASE ── */}
          {postWatchPhase === "compare" && (() => {
            // Compute pause request counts from chat system messages
            const pauseCounts: Record<string, number> = {};
            for (const msg of chatMessages) {
              if ((msg as any).system && msg.text?.includes("requesting a pause")) {
                // Match participant by name
                const requester = session.participants.find((p) => msg.text?.includes(p.user.name));
                if (requester) pauseCounts[requester.userId] = (pauseCounts[requester.userId] ?? 0) + 1;
              }
            }
            return (
            <>
              {/* Rating comparison */}
              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white">Rating Comparison</h2>
                  <ShareButton
                    text={`Check out our Screening Room recap for ${session.movieTitle ?? (session.mediaType === "tv" ? "a show" : "a movie")}!`}
                    url={typeof window !== "undefined" ? `${window.location.origin}/screening-room/${id}/recap` : ""}
                    cardImageUrl={`/api/og/screening?id=${id}`}
                  />
                </div>
                <ScreeningRatingCompare ratings={session.ratings} tmdbId={session.tmdbId} myUserId={myUserId} />
              </section>

              {/* Superlatives + heatmap use watching-phase messages only */}
              {(() => {
                const _startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : 0;
                const _finishedAtMs = session.finishedAt ? new Date(session.finishedAt).getTime() : Infinity;
                const watchingChatMsgs = chatMessages.filter((m) => {
                  if (m.userId === "system") return false;
                  if ((m as any).phase === "lobby" || (m as any).phase === "postwatch") return false;
                  if (m.timestamp < _startedAtMs) return false;
                  if (_finishedAtMs < Infinity && m.timestamp > _finishedAtMs) return false;
                  return true;
                });
                const chatMsgsForSuperlatives = watchingChatMsgs.length > 0 ? watchingChatMsgs
                  : (session.chatHighlights ?? []).filter((h) => h.user.id && h.user.id !== "system").map((h) => ({ userId: h.user.id, timestamp: 0 }));
                return (
                  <>
                    <ScreeningSuperlatives
                      participants={session.participants}
                      predictions={session.predictions}
                      ratings={session.ratings}
                      polls={session.polls}
                      bookmarks={session.bookmarks}
                      chatMessages={chatMsgsForSuperlatives}
                      pauseRequestCounts={pauseCounts}
                    />
                    {watchingChatMsgs.length > 0 && (
                      <ScreeningHeatmap chatMessages={watchingChatMsgs} startedAt={session.startedAt} />
                    )}
                  </>
                );
              })()}

              {/* Predictions reveal */}
              {session.predictions.length > 0 && (
                <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Prediction Reveal</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {session.predictions.map((pred) => {
                      const pUser = session.participants.find((p) => p.userId === pred.userId)?.user;
                      const actualRating = session.ratings.find((r) => r.userId === pred.userId)?.ratistRating;
                      return (
                        <div key={pred.userId} className="bg-[var(--surface-2)] rounded-lg p-4">
                          <p className="text-sm font-semibold text-white mb-1">{pUser?.name ?? "Unknown"}</p>
                          {pred.ratingGuess != null && (
                            <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                              <span>Predicted: <span className="text-[var(--ratist-red)] font-bold">{pred.ratingGuess}/10</span></span>
                              {actualRating != null && (
                                <span>→ Actual: <span className="text-green-400 font-bold">{actualRating.toFixed(1)}/10</span></span>
                              )}
                            </div>
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

              {/* Chat Highlights */}
              {session.chatHighlights && session.chatHighlights.length > 0 && (() => {
                // Group by windowGroup
                const groups = new Map<number, typeof session.chatHighlights>();
                for (const h of session.chatHighlights) {
                  const list = groups.get(h.windowGroup) ?? [];
                  list.push(h);
                  groups.set(h.windowGroup, list);
                }
                const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);

                return (
                  <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-[var(--ratist-red)]" /> Chat Highlights
                    </h2>
                    <p className="text-xs text-[var(--foreground-muted)] mb-4">The most active moments from your watch session.</p>
                    <div className="space-y-4">
                      {sortedGroups.map(([groupIdx, msgs]) => {
                        const sessionStart = session.startedAt ? new Date(session.startedAt).getTime() : 0;
                        const startElapsed = Math.max(0, Math.floor((new Date(msgs[0].timestamp).getTime() - sessionStart) / 1000));
                        const endElapsed = Math.max(0, Math.floor((new Date(msgs[msgs.length - 1].timestamp).getTime() - sessionStart) / 1000));
                        const fmtElapsed = (s: number) => { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
                        return (
                          <div key={groupIdx} className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
                              <span className="text-[10px] text-[var(--ratist-red)] font-medium">Peak Moment #{groupIdx + 1} · {msgs[0].reactCount} messages</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--foreground-muted)]">{fmtElapsed(startElapsed)} — {fmtElapsed(endElapsed)}</span>
                                {chatMessages.length > 0 && (
                                  <button onClick={() => {
                                    const targetTs = new Date(msgs[0].timestamp).getTime();
                                    // Find closest message by timestamp
                                    const allMsgEls = document.querySelectorAll("[data-msg-ts]");
                                    let closest: HTMLElement | null = null;
                                    let closestDiff = Infinity;
                                    allMsgEls.forEach((el) => {
                                      const ts = Number(el.getAttribute("data-msg-ts"));
                                      const diff = Math.abs(ts - targetTs);
                                      if (diff < closestDiff) { closestDiff = diff; closest = el as HTMLElement; }
                                    });
                                    if (closest) (closest as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
                                  }} className="text-[9px] text-[var(--ratist-red)] hover:underline">Jump to chat</button>
                                )}
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto p-3 space-y-1.5 resize-y" style={{ minHeight: "80px" }}>
                              {msgs.map((h) => {
                                const isPoll = h.text?.startsWith("[Poll]");
                                return (
                                  <div key={h.id} className={`flex items-start gap-2 ${isPoll ? "bg-[var(--surface)]/50 rounded-lg px-2 py-1.5 -mx-1" : ""}`}>
                                    <span className="text-[10px] text-[var(--foreground-muted)] w-16 flex-shrink-0 pt-0.5">{isPoll ? "Poll" : h.user.name}</span>
                                    {h.emoji ? (
                                      <span className="text-lg">{h.emoji}</span>
                                    ) : isPoll ? (
                                      <p className="text-xs text-[var(--ratist-red)]">{h.text.replace("[Poll] ", "")}</p>
                                    ) : (
                                      <p className="text-xs text-white">{h.text}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* Post-watch chat */}
              <CompactChat
                sessionId={id}
                myUserId={myUserId}
                myName={user?.displayName ?? "Anonymous"}
                myPhotoURL={user?.photoURL ?? undefined}
                chatMessages={chatMessages}
                maxHeight="200px"
                label="Post-Watch Chat" phase="postwatch"
              />

              {/* Footer */}
              <div className="text-center pt-4">
                <Link href="/screening-room" className="text-sm text-[var(--ratist-red)] hover:underline">
                  ← Back to Screening Rooms
                </Link>
              </div>
            </>
            );
          })()}
        </div>
        );
      })()}
    </div>
  );
}
