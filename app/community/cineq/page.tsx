"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import Image from "next/image";
import { Brain, Film, Tv, Monitor, Trophy, Zap, ArrowLeft, RotateCcw, ChevronRight } from "lucide-react";
import ShareButton from "@/components/ShareButton";

interface QuizQuestion { index: number; mediaType: string; phases: string[][]; options: string[]; answerIdx: number; }
interface AnswerResult { questionIndex: number; selectedOption: string; timeElapsed: number; wrongGuesses: number; correct: boolean; points: number; answer: string | null; posterPath: string | null; }
interface Stats { weightedLifetime: number; avgRawScore: number; bestDailyScore: number; totalDailyQuizzes: number; totalPracticeQuizzes: number; accuracy: number; avgWrongGuessesPerQuiz: number; dailyStreak: number; playedToday: string[]; }

const SECS = 25;
const PTS_SEC = 4;
const WRONG_PEN = 25;
const PHASE_INT = 5;

type Screen = "menu" | "pickDifficulty" | "ready" | "countdown" | "quiz" | "questionEnd" | "results";

const TYPES = [
  { value: "movie", label: "Movies", icon: Film, color: "text-[var(--ratist-red)]", bg: "bg-[var(--ratist-red)]" },
  { value: "tv", label: "TV Shows", icon: Tv, color: "text-blue-400", bg: "bg-blue-600" },
  { value: "both", label: "Both", icon: Monitor, color: "text-purple-400", bg: "bg-purple-600" },
] as const;
const DIFFS = [
  { value: "easy", label: "Easy", desc: "Popular titles, helpful clues early", color: "bg-green-600 hover:bg-green-500" },
  { value: "medium", label: "Medium", desc: "Balanced clue order", color: "bg-yellow-600 hover:bg-yellow-500" },
  { value: "hard", label: "Hard", desc: "Vague early clues, obscure titles", color: "bg-red-600 hover:bg-red-500" },
] as const;

export default function CineQPage() {
  const { user, loading: authLoading } = useAuth();
  const [screen, setScreen] = useState<Screen>("menu");
  const [stats, setStats] = useState<Stats | null>(null);

  // Setup
  const [mode, setMode] = useState<"daily" | "practice">("daily");
  const [mediaType, setMediaType] = useState("");
  const [difficulty, setDifficulty] = useState("");

  // Quiz state
  const [dailyId, setDailyId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<{ questionIndex: number; selectedOption: string; timeElapsed: number; wrongGuesses: number }[]>([]);
  const [runningTotal, setRunningTotal] = useState(0);

  // Active question
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [disabledOptions, setDisabledOptions] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown
  const [countdownSec, setCountdownSec] = useState(5);

  // Results
  const [results, setResults] = useState<{ attemptId?: string; rawScore: number; weightedScore: number; difficultyMultiplier: number; results: AnswerResult[] } | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/cineq/stats", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setStats(await res.json());
  }, [user]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Warn before leaving during quiz
  useEffect(() => {
    if (screen !== "quiz" && screen !== "questionEnd" && screen !== "countdown" && screen !== "ready") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [screen]);

  // Countdown timer
  useEffect(() => {
    if (screen !== "countdown") return;
    if (countdownSec <= 0) { setScreen("quiz"); return; }
    const t = setTimeout(() => setCountdownSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [screen, countdownSec]);

  // Question timer
  useEffect(() => {
    if (screen !== "quiz" || answered) return;
    timerRef.current = setInterval(() => {
      setTimeElapsed((t) => {
        const next = Math.round((t + 0.1) * 10) / 10;
        setCurrentPhase(Math.min(4, Math.floor(next / PHASE_INT)));
        if (next >= SECS) {
          setAnswered(true); setSelectedOption(null);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        return Math.min(next, SECS);
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, answered, currentQ]);

  // 0 points → end question immediately
  const potentialPoints = Math.max(0, Math.round((100 - timeElapsed * PTS_SEC - wrongGuesses * WRONG_PEN) * 10) / 10);
  useEffect(() => {
    if (screen === "quiz" && !answered && potentialPoints <= 0) {
      setAnswered(true); setSelectedOption(null);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [screen, answered, potentialPoints]);

  // When answered (correct, timeout, or 0 points) → move to questionEnd
  useEffect(() => {
    if (!answered || screen !== "quiz") return;
    const q = questions[currentQ];
    if (!q) return;
    const isCorrect = selectedOption === q.options[q.answerIdx];
    const qPoints = isCorrect ? Math.max(0, Math.round((100 - timeElapsed * PTS_SEC - wrongGuesses * WRONG_PEN) * 10) / 10) : 0;
    const answer = { questionIndex: q.index, selectedOption: selectedOption ?? "", timeElapsed: Math.round(timeElapsed * 10) / 10, wrongGuesses };
    setAnswers((prev) => [...prev, answer]);
    setRunningTotal((prev) => Math.round((prev + qPoints) * 10) / 10);
    setScreen("questionEnd");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  function resetQuestion() {
    setTimeElapsed(0); setCurrentPhase(0); setWrongGuesses(0);
    setDisabledOptions(new Set()); setAnswered(false); setSelectedOption(null);
  }

  function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ((c) => c + 1); resetQuestion(); setScreen("quiz");
    } else {
      submitQuiz([...answers]);
    }
  }

  async function startQuiz(m: "daily" | "practice", mt: string, diff: string) {
    if (!user) return;
    setLoadingQuiz(true); setQuizError("");
    try {
      const token = await user.getIdToken();
      const endpoint = m === "daily" ? "/api/cineq/daily" : "/api/cineq/practice";
      const res = await fetch(`${endpoint}?mediaType=${mt}&difficulty=${diff}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { setQuizError(data.error ?? "Failed to load quiz"); setLoadingQuiz(false); setScreen("menu"); return; }
      setDailyId(data.dailyId ?? ""); setAttemptId(data.attemptId ?? "");
      setQuestions(data.questions); setCurrentQ(0); setAnswers([]);
      setRunningTotal(0); resetQuestion(); setCountdownSec(5); setScreen("countdown");
    } catch { setQuizError("Network error. Please try again."); setScreen("menu"); }
    setLoadingQuiz(false);
  }

  function handleGuess(option: string) {
    if (answered || disabledOptions.has(option)) return;
    const q = questions[currentQ];
    if (q.options[q.answerIdx] === option) {
      setSelectedOption(option); setAnswered(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      setWrongGuesses((w) => w + 1);
      setDisabledOptions((prev) => new Set(prev).add(option));
    }
  }

  async function submitQuiz(finalAnswers: typeof answers) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/cineq/submit", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dailyId: dailyId || undefined, attemptId: attemptId || undefined, mode, mediaType, difficulty, answers: finalAnswers }),
      });
      if (res.ok) { setResults(await res.json()); setScreen("results"); fetchStats(); }
    } catch { /* ignore */ }
  }

  // ─── Renders ───────────────────────────────────────────────────────────────

  if (authLoading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--foreground-muted)]">Loading...</div>;
  if (!user) return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <Brain className="w-10 h-10 text-[var(--ratist-red)] mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Cine-Q</h1>
      <p className="text-[var(--foreground-muted)] mb-6">Test your movie and TV knowledge with timed trivia.</p>
      <Link href="/auth/signin" className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-3 rounded-full transition-colors">Sign in to play</Link>
    </div>
  );

  // ── MENU ──
  if (screen === "menu") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Community Hub
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-6 h-6 text-pink-400" />
          <h1 className="text-2xl font-bold text-white">Cine-Q</h1>
        </div>
        <p className="text-[var(--foreground-muted)] mb-8">Clues drip in over 25 seconds. Guess the movie or show as fast as you can!</p>

        {quizError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">{quizError}</div>}

        {stats && stats.totalDailyQuizzes > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "Lifetime Pts", value: stats.weightedLifetime.toLocaleString() },
              { label: "Avg Score", value: stats.avgRawScore.toFixed(1) },
              { label: "Streak", value: `${stats.dailyStreak}d` },
              { label: "Accuracy", value: `${stats.accuracy}%` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Daily Challenge */}
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" /> Daily Challenge
        </h2>
        <div className="grid sm:grid-cols-3 gap-3 mb-10">
          {TYPES.map(({ value, label, icon: Icon, color, bg }) => {
            const played = stats?.playedToday?.some((p) => p.startsWith(value + "-"));
            return (
              <button
                key={value}
                onClick={() => { if (played) return; setMode("daily"); setMediaType(value); setScreen("pickDifficulty"); }}
                disabled={!!played}
                className={`group flex flex-col items-center gap-2 p-5 rounded-xl border transition-colors text-center ${
                  played ? "border-green-500/30 bg-green-500/5 opacity-60 cursor-not-allowed" : "border-[var(--border)] bg-[var(--surface)] hover:border-pink-400"
                }`}
              >
                <Icon className={`w-8 h-8 ${color}`} />
                <span className="text-white font-semibold">{label}</span>
                {played && <span className="text-[10px] text-green-400 font-medium">Completed today</span>}
              </button>
            );
          })}
        </div>

        {/* Practice */}
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-400" /> Practice / For Fun
        </h2>
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {TYPES.map(({ value, label, icon: Icon, color }) => (
            <button
              key={value}
              onClick={() => { setMode("practice"); setMediaType(value); setScreen("pickDifficulty"); }}
              className="group flex flex-col items-center gap-2 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-emerald-400 transition-colors text-center"
            >
              <Icon className={`w-8 h-8 ${color}`} />
              <span className="text-white font-semibold">{label}</span>
            </button>
          ))}
        </div>

        <Link href="/community/cineq/leaderboard" className="block text-center text-sm text-[var(--foreground-muted)] hover:text-pink-400 transition-colors">
          View Daily Leaderboard →
        </Link>
      </div>
    );
  }

  // ── PICK DIFFICULTY ──
  if (screen === "pickDifficulty") {
    const typeInfo = TYPES.find((t) => t.value === mediaType);
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <button onClick={() => setScreen("menu")} className="text-sm text-[var(--foreground-muted)] hover:text-white mb-6 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h2 className="text-xl font-bold text-white mb-2">Choose Difficulty</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">{typeInfo?.label} · {mode === "daily" ? "Daily Challenge" : "Practice"}</p>
        <div className="space-y-3">
          {DIFFS.map(({ value, label, desc, color }) => {
            const played = mode === "daily" && stats?.playedToday?.includes(`${mediaType}-${value}`);
            return (
              <button
                key={value}
                onClick={() => { if (played) return; setDifficulty(value); setScreen("ready"); }}
                disabled={!!played}
                className={`w-full p-4 rounded-xl text-left transition-colors ${played ? "bg-[var(--surface)] border border-green-500/30 opacity-50 cursor-not-allowed" : `${color} text-white`}`}
              >
                <p className="font-bold text-lg">{label}</p>
                <p className="text-sm opacity-80">{desc}</p>
                {played && <p className="text-xs text-green-400 mt-1">Already played today</p>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── READY ──
  if (screen === "ready") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <Brain className="w-12 h-12 text-pink-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Ready?</h2>
        <p className="text-[var(--foreground-muted)] mb-8">10 questions · 25 seconds each · {difficulty} difficulty</p>
        <button
          onClick={() => startQuiz(mode, mediaType, difficulty)}
          disabled={loadingQuiz}
          className="px-8 py-4 bg-pink-600 hover:bg-pink-500 text-white text-lg font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          {loadingQuiz ? "Loading quiz..." : "Start!"}
        </button>
      </div>
    );
  }

  // ── COUNTDOWN ──
  if (screen === "countdown") {
    return (
      <div className="max-w-md mx-auto px-4 py-32 text-center">
        <p className="text-8xl font-black text-white mb-4 animate-pulse">{countdownSec}</p>
        <p className="text-[var(--foreground-muted)]">Get ready...</p>
      </div>
    );
  }

  // ── QUIZ ──
  if (screen === "quiz" && questions[currentQ]) {
    const q = questions[currentQ];
    const timerPct = Math.max(0, (1 - timeElapsed / SECS) * 100);

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-[var(--foreground-muted)]">Question {currentQ + 1} of {questions.length}</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--foreground-muted)]">Total: <span className="text-white font-bold">{runningTotal.toFixed(1)}</span></span>
            <span className={`text-lg font-mono font-bold ${timeElapsed > 20 ? "text-red-400" : timeElapsed > 15 ? "text-yellow-400" : "text-white"}`}>
              {Math.max(0, SECS - timeElapsed).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Timer bar */}
        <div className="h-2 bg-[var(--surface-2)] rounded-full mb-6">
          <div className={`h-full rounded-full transition-all duration-100 ${timerPct > 40 ? "bg-emerald-500" : timerPct > 20 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${timerPct}%` }} />
        </div>

        {/* Points */}
        <div className="text-center mb-5">
          <p className={`text-4xl font-black transition-colors ${potentialPoints > 60 ? "text-emerald-400" : potentialPoints > 30 ? "text-yellow-400" : "text-red-400"}`}>
            {potentialPoints.toFixed(1)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">Potential points</p>
        </div>

        {/* Clues */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-5">
          {q.phases.slice(0, currentPhase + 1).map((phase, pi) => (
            <div key={pi} className={pi > 0 ? "mt-3 pt-3 border-t border-[var(--border)]" : ""}>
              {phase.map((clue, ci) => (
                <p key={ci} className={`text-sm ${pi === currentPhase ? "text-white font-medium" : "text-[var(--foreground-muted)]"}`}>{clue}</p>
              ))}
            </div>
          ))}
          {/* Phase placeholders */}
          {currentPhase < 4 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)] flex gap-2">
              {Array.from({ length: 4 - currentPhase }, (_, i) => (
                <span key={i} className="text-[var(--foreground-muted)] opacity-30 text-sm">...</span>
              ))}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          {q.options.map((option, oi) => {
            const isDisabled = disabledOptions.has(option);
            return (
              <button
                key={option}
                onClick={() => handleGuess(option)}
                disabled={isDisabled}
                className={`p-3 rounded-xl text-sm font-medium transition-all text-left ${
                  isDisabled
                    ? "bg-red-900/20 text-red-400/50 border-2 border-red-500/20 line-through"
                    : "bg-[var(--surface)] border-2 border-[var(--border)] text-white hover:border-pink-400"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── QUESTION END ──
  if (screen === "questionEnd" && questions[currentQ]) {
    const q = questions[currentQ];
    const correctOption = q.options[q.answerIdx];
    const isCorrect = selectedOption === correctOption;
    const lastAnswer = answers[answers.length - 1];
    const qPoints = isCorrect ? Math.max(0, Math.round((100 - (lastAnswer?.timeElapsed ?? SECS) * PTS_SEC - (lastAnswer?.wrongGuesses ?? 0) * WRONG_PEN) * 10) / 10) : 0;

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-[var(--foreground-muted)]">Question {currentQ + 1} of {questions.length}</span>
          <span className="text-sm text-[var(--foreground-muted)]">Total: <span className="text-white font-bold">{runningTotal.toFixed(1)}</span></span>
        </div>

        <div className="text-center mb-5">
          <p className={`text-3xl font-black ${isCorrect ? "text-emerald-400" : "text-red-400"}`}>
            {isCorrect ? `+${qPoints.toFixed(1)}` : "Incorrect"}
          </p>
        </div>

        {/* Options with correct highlighted */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {q.options.map((option) => {
            const isCorrectOpt = option === correctOption;
            const wasSelected = option === selectedOption;
            const wasDisabled = disabledOptions.has(option);
            return (
              <div
                key={option}
                className={`p-3 rounded-xl text-sm font-medium text-left border-2 ${
                  isCorrectOpt
                    ? "bg-green-600/20 border-green-500 text-green-400"
                    : wasSelected || wasDisabled
                      ? "bg-red-900/20 border-red-500/20 text-red-400/50 line-through"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] opacity-50"
                }`}
              >
                {option}
              </div>
            );
          })}
        </div>

        <button
          onClick={nextQuestion}
          className="w-full py-3 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          {currentQ + 1 < questions.length ? <><ChevronRight className="w-4 h-4" /> Next Question</> : "See Results"}
        </button>
      </div>
    );
  }

  // ── RESULTS ──
  if (screen === "results" && results) {
    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const typeLabel = mediaType === "both" ? "Movies & TV" : mediaType === "tv" ? "TV Shows" : "Movies";
    const correctCount = results.results.filter((r) => r.correct).length;

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <Brain className="w-10 h-10 text-pink-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white mb-1">Quiz Complete!</h1>
          <p className="text-sm text-[var(--foreground-muted)]">{typeLabel} · {diffLabel} · {mode === "daily" ? "Daily" : "Practice"}</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-6 text-center">
          <p className="text-4xl font-bold text-white mb-1">{results.rawScore.toFixed(1)}</p>
          <p className="text-sm text-[var(--foreground-muted)]">Raw Score / 1000</p>
          {results.difficultyMultiplier > 1 && (
            <p className="text-sm text-emerald-400 mt-2">{results.difficultyMultiplier}x bonus → <span className="font-bold">{results.weightedScore.toFixed(1)}</span> weighted</p>
          )}
          <p className="text-sm text-[var(--foreground-muted)] mt-2">{correctCount}/10 correct</p>
        </div>

        {results.attemptId && (
          <div className="mb-6">
            <ShareButton
              label="Share Results"
              text={`I scored ${results.rawScore.toFixed(1)}/1000 on Cine-Q (${typeLabel}, ${diffLabel})! ${correctCount}/10 correct. Can you beat me?`}
              url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/community/cineq`}
              cardImageUrl={`/api/og/cineq?attemptId=${results.attemptId}`}
            />
          </div>
        )}

        <h2 className="text-sm font-semibold text-white mb-3">Breakdown</h2>
        <div className="space-y-2 mb-8">
          {results.results.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${r.correct ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <span className="text-sm font-bold text-[var(--foreground-muted)] w-6">{i + 1}</span>
              {r.posterPath && <Image src={`https://image.tmdb.org/t/p/w92${r.posterPath}`} alt="" width={28} height={42} className="rounded w-7 h-10 object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{r.answer ?? "Unknown"}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{r.timeElapsed.toFixed(1)}s · {r.wrongGuesses} wrong</p>
              </div>
              <span className={`text-sm font-bold ${r.correct ? "text-green-400" : "text-red-400"}`}>{r.correct ? `+${r.points.toFixed(1)}` : "0"}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => { setScreen("menu"); setResults(null); setQuestions([]); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] text-white rounded-xl text-sm font-semibold hover:border-pink-400 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </button>
          {mode === "practice" && (
            <button onClick={() => startQuiz("practice", mediaType, difficulty)} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors">
              <RotateCcw className="w-4 h-4" /> Play Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
