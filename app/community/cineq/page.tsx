"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import Image from "next/image";
import { Brain, Film, Tv, Monitor, Clock, Trophy, Zap, ArrowLeft, ChevronRight, RotateCcw, Share2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuizQuestion {
  index: number;
  mediaType: string;
  phases: string[][];
  options: string[];
  answerIdx: number;
}

interface AnswerResult {
  questionIndex: number;
  selectedOption: string;
  timeElapsed: number;
  wrongGuesses: number;
  correct: boolean;
  points: number;
  answer: string | null;
  posterPath: string | null;
}

interface QuizState {
  dailyId?: string;
  mode: "daily" | "practice";
  mediaType: string;
  difficulty: string;
  questions: QuizQuestion[];
}

interface Stats {
  weightedLifetime: number;
  avgRawScore: number;
  bestDailyScore: number;
  totalDailyQuizzes: number;
  totalPracticeQuizzes: number;
  accuracy: number;
  avgWrongGuessesPerQuiz: number;
  dailyStreak: number;
  playedToday: string[];
}

const SECONDS_PER_QUESTION = 25;
const POINTS_PER_SEC = 4;
const WRONG_PENALTY = 25;
const PHASE_INTERVAL = 5; // seconds between phases

type Screen = "menu" | "quiz" | "results";

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CineQPage() {
  const { user, loading: authLoading } = useAuth();
  const [screen, setScreen] = useState<Screen>("menu");
  const [stats, setStats] = useState<Stats | null>(null);

  // Quiz setup
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<{ questionIndex: number; selectedOption: string; timeElapsed: number; wrongGuesses: number }[]>([]);
  const [runningTotal, setRunningTotal] = useState(0);

  // Active question state
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [disabledOptions, setDisabledOptions] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Results
  const [results, setResults] = useState<{ rawScore: number; weightedScore: number; difficultyMultiplier: number; results: AnswerResult[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Loading
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/cineq/stats", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setStats(await res.json());
  }, [user]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Timer logic
  useEffect(() => {
    if (screen !== "quiz" || answered || !quiz) return;
    timerRef.current = setInterval(() => {
      setTimeElapsed((t) => {
        const next = Math.round((t + 0.1) * 10) / 10;
        // Update phase
        const phase = Math.min(4, Math.floor(next / PHASE_INTERVAL));
        setCurrentPhase(phase);
        // Time's up — record 0 points and advance
        if (next >= SECONDS_PER_QUESTION) {
          setAnswered(true);
          setSelectedOption(null);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        return Math.min(next, SECONDS_PER_QUESTION);
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, answered, quiz, currentQ]);

  // Handle time expired — record 0 points and advance
  useEffect(() => {
    if (!answered || selectedOption !== null || !quiz) return;
    // Time ran out with no correct answer
    const q = quiz.questions[currentQ];
    const answer = {
      questionIndex: q.index,
      selectedOption: "",
      timeElapsed: SECONDS_PER_QUESTION,
      wrongGuesses,
    };
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentQ + 1 < quiz.questions.length) {
        setCurrentQ((c) => c + 1);
        resetQuestion();
      } else {
        submitQuiz(newAnswers);
      }
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, selectedOption]);

  // Calculate current question potential points
  const potentialPoints = Math.max(0, Math.round((100 - timeElapsed * POINTS_PER_SEC - wrongGuesses * WRONG_PENALTY) * 10) / 10);

  // ─── Start quiz ────────────────────────────────────────────────────────────

  async function startQuiz(mode: "daily" | "practice", mediaType: string, difficulty: string) {
    if (!user) return;
    setLoadingQuiz(true);
    setQuizError("");
    try {
      const token = await user.getIdToken();
      const endpoint = mode === "daily" ? "/api/cineq/daily" : "/api/cineq/practice";
      const res = await fetch(`${endpoint}?mediaType=${mediaType}&difficulty=${difficulty}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyPlayed) setQuizError("You've already completed this daily quiz!");
        else setQuizError(data.error ?? "Failed to load quiz");
        setLoadingQuiz(false);
        return;
      }
      setQuiz({ dailyId: data.dailyId, mode, mediaType, difficulty, questions: data.questions });
      setCurrentQ(0);
      setAnswers([]);
      setRunningTotal(0);
      resetQuestion();
      setScreen("quiz");
    } catch {
      setQuizError("Network error. Please try again.");
    }
    setLoadingQuiz(false);
  }

  function resetQuestion() {
    setTimeElapsed(0);
    setCurrentPhase(0);
    setWrongGuesses(0);
    setDisabledOptions(new Set());
    setAnswered(false);
    setSelectedOption(null);
  }

  // ─── Handle answer ─────────────────────────────────────────────────────────

  function handleGuess(option: string) {
    if (answered || disabledOptions.has(option) || !quiz) return;
    const q = quiz.questions[currentQ];
    const isCorrect = q.options[q.answerIdx] === option;

    if (isCorrect) {
      // Correct! Lock in score and advance
      setSelectedOption(option);
      setAnswered(true);
      if (timerRef.current) clearInterval(timerRef.current);

      const qPoints = Math.max(0, Math.round((100 - timeElapsed * POINTS_PER_SEC - wrongGuesses * WRONG_PENALTY) * 10) / 10);
      const answer = {
        questionIndex: q.index,
        selectedOption: option,
        timeElapsed: Math.round(timeElapsed * 10) / 10,
        wrongGuesses,
      };
      const newAnswers = [...answers, answer];
      setAnswers(newAnswers);
      setRunningTotal((prev) => Math.round((prev + qPoints) * 10) / 10);

      setTimeout(() => {
        if (currentQ + 1 < quiz.questions.length) {
          setCurrentQ((c) => c + 1);
          resetQuestion();
        } else {
          submitQuiz(newAnswers);
        }
      }, 1500);
    } else {
      // Wrong — disable this option and deduct penalty
      setWrongGuesses((w) => w + 1);
      setDisabledOptions((prev) => new Set(prev).add(option));
    }
  }

  // ─── Submit quiz ───────────────────────────────────────────────────────────

  async function submitQuiz(finalAnswers: typeof answers) {
    if (!user || !quiz) return;
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/cineq/submit", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyId: quiz.dailyId,
          mode: quiz.mode,
          mediaType: quiz.mediaType,
          difficulty: quiz.difficulty,
          answers: finalAnswers,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setScreen("results");
        fetchStats(); // refresh stats
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (authLoading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--foreground-muted)]">Loading...</div>;

  if (!user) return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <Brain className="w-10 h-10 text-[var(--ratist-red)] mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Cine-Q</h1>
      <p className="text-[var(--foreground-muted)] mb-6">Test your movie and TV knowledge with timed trivia.</p>
      <Link href="/auth/signin" className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-3 rounded-full transition-colors">
        Sign in to play
      </Link>
    </div>
  );

  // ─── Menu Screen ───────────────────────────────────────────────────────────

  if (screen === "menu") {
    const dailyTypes = [
      { value: "movie", label: "Movies", icon: Film, color: "text-[var(--ratist-red)]" },
      { value: "tv", label: "TV Shows", icon: Tv, color: "text-blue-400" },
      { value: "both", label: "Both", icon: Monitor, color: "text-purple-400" },
    ];
    const difficulties = [
      { value: "easy", label: "Easy", color: "bg-green-600" },
      { value: "medium", label: "Medium", color: "bg-yellow-600" },
      { value: "hard", label: "Hard", color: "bg-red-600" },
    ];

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Cine-Q</h1>
        </div>
        <p className="text-[var(--foreground-muted)] mb-8">Clues drip in over 25 seconds — guess the movie or show as fast as you can for more points!</p>

        {quizError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">{quizError}</div>
        )}

        {/* Stats summary */}
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
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" /> Daily Challenge
        </h2>
        <div className="space-y-3 mb-8">
          {dailyTypes.map(({ value, label, icon: Icon, color }) => {
            const played = stats?.playedToday?.some((p) => p.startsWith(value + "-"));
            return (
              <div key={value} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <span className="text-white font-medium">{label}</span>
                  {played && <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">Played today</span>}
                </div>
                <div className="flex gap-2">
                  {difficulties.map(({ value: diff, label: diffLabel, color: diffColor }) => {
                    const thisPlayed = stats?.playedToday?.includes(`${value}-${diff}`);
                    return (
                      <button
                        key={diff}
                        onClick={() => startQuiz("daily", value, diff)}
                        disabled={loadingQuiz || !!thisPlayed}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          thisPlayed
                            ? "bg-[var(--surface-2)] text-[var(--foreground-muted)] opacity-50 cursor-not-allowed"
                            : `${diffColor} text-white hover:opacity-90`
                        }`}
                      >
                        {thisPlayed ? `${diffLabel} ✓` : diffLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Practice Mode */}
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-400" /> Practice / For Fun
        </h2>
        <div className="space-y-3">
          {dailyTypes.map(({ value, label, icon: Icon, color }) => (
            <div key={value} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <span className="text-white font-medium">{label}</span>
              </div>
              <div className="flex gap-2">
                {difficulties.map(({ value: diff, label: diffLabel, color: diffColor }) => (
                  <button
                    key={diff}
                    onClick={() => startQuiz("practice", value, diff)}
                    disabled={loadingQuiz}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${diffColor} text-white hover:opacity-90 disabled:opacity-50`}
                  >
                    {diffLabel}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Leaderboard link */}
        <Link href="/community/cineq/leaderboard" className="block mt-8 text-center text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
          View Daily Leaderboard →
        </Link>
      </div>
    );
  }

  // ─── Quiz Screen ───────────────────────────────────────────────────────────

  if (screen === "quiz" && quiz) {
    const q = quiz.questions[currentQ];
    const progressPct = ((currentQ) / quiz.questions.length) * 100;
    const timerPct = Math.max(0, (1 - timeElapsed / SECONDS_PER_QUESTION) * 100);

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[var(--ratist-red)]" />
            <span className="text-sm text-[var(--foreground-muted)]">
              Q{currentQ + 1}/{quiz.questions.length}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--foreground-muted)]">Total: <span className="text-white font-bold">{runningTotal.toFixed(1)}</span></span>
            <span className={`text-sm font-mono font-bold ${timeElapsed > 20 ? "text-red-400" : timeElapsed > 15 ? "text-yellow-400" : "text-white"}`}>
              {Math.max(0, SECONDS_PER_QUESTION - timeElapsed).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-[var(--surface-2)] rounded-full mb-2">
          <div className="h-full bg-[var(--ratist-red)] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Timer bar */}
        <div className="h-1.5 bg-[var(--surface-2)] rounded-full mb-6">
          <div
            className={`h-full rounded-full transition-all duration-100 ${timerPct > 40 ? "bg-emerald-500" : timerPct > 20 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${timerPct}%` }}
          />
        </div>

        {/* Points display */}
        <div className="text-center mb-6">
          <p className={`text-3xl font-bold transition-colors ${answered ? "text-[var(--foreground-muted)]" : potentialPoints > 60 ? "text-emerald-400" : potentialPoints > 30 ? "text-yellow-400" : "text-red-400"}`}>
            {answered ? (selectedOption ? `+${Math.max(0, Math.round((100 - timeElapsed * POINTS_PER_SEC - wrongGuesses * WRONG_PENALTY) * 10) / 10).toFixed(1)}` : "+0.0") : potentialPoints.toFixed(1)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">{answered ? "Points earned" : "Potential points"}</p>
        </div>

        {/* Clues */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6 space-y-3">
          {q.phases.slice(0, currentPhase + 1).map((phase, pi) => (
            <div key={pi} className={`${pi === currentPhase ? "animate-in" : ""}`}>
              {phase.map((clue, ci) => (
                <p key={ci} className={`text-sm ${pi === currentPhase ? "text-white font-medium" : "text-[var(--foreground-muted)]"}`}>
                  {clue}
                </p>
              ))}
              {pi < currentPhase && <hr className="border-[var(--border)] my-2" />}
            </div>
          ))}
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          {q.options.map((option, oi) => {
            const isDisabled = disabledOptions.has(option);
            const isCorrectAnswer = oi === q.answerIdx;
            const isSelected = selectedOption === option;
            const showCorrect = answered && isCorrectAnswer;
            const showWrongSelected = answered && selectedOption === null && !isCorrectAnswer;
            return (
              <button
                key={option}
                onClick={() => handleGuess(option)}
                disabled={answered || isDisabled}
                className={`p-3 rounded-xl text-sm font-medium transition-all text-left ${
                  showCorrect
                    ? "bg-green-600 text-white border-2 border-green-500"
                    : isSelected
                      ? "bg-green-600 text-white border-2 border-green-500"
                      : isDisabled
                        ? "bg-red-900/20 text-red-400/50 border-2 border-red-500/20 line-through"
                        : answered
                          ? "bg-[var(--surface)] border-2 border-[var(--border)] text-[var(--foreground-muted)] opacity-50"
                          : "bg-[var(--surface)] border-2 border-[var(--border)] text-white hover:border-[var(--ratist-red)]"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {submitting && <p className="text-center text-[var(--foreground-muted)] mt-4">Submitting results...</p>}
      </div>
    );
  }

  // ─── Results Screen ────────────────────────────────────────────────────────

  if (screen === "results" && results && quiz) {
    const diffLabel = quiz.difficulty.charAt(0).toUpperCase() + quiz.difficulty.slice(1);
    const typeLabel = quiz.mediaType === "both" ? "Movies & TV" : quiz.mediaType === "tv" ? "TV Shows" : "Movies";

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <Brain className="w-10 h-10 text-[var(--ratist-red)] mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white mb-1">Quiz Complete!</h1>
          <p className="text-sm text-[var(--foreground-muted)]">{typeLabel} · {diffLabel} · {quiz.mode === "daily" ? "Daily" : "Practice"}</p>
        </div>

        {/* Score summary */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-6 text-center">
          <p className="text-4xl font-bold text-white mb-1">{results.rawScore.toFixed(1)}</p>
          <p className="text-sm text-[var(--foreground-muted)]">Raw Score / 1000</p>
          {results.difficultyMultiplier > 1 && (
            <p className="text-sm text-emerald-400 mt-2">
              {results.difficultyMultiplier}x difficulty bonus → <span className="font-bold">{results.weightedScore.toFixed(1)}</span> weighted
            </p>
          )}
        </div>

        {/* Per-question breakdown */}
        <h2 className="text-sm font-semibold text-white mb-3">Question Breakdown</h2>
        <div className="space-y-2 mb-8">
          {results.results.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${r.correct ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <span className="text-sm font-bold text-[var(--foreground-muted)] w-6">{i + 1}</span>
              {r.posterPath && (
                <Image src={`https://image.tmdb.org/t/p/w92${r.posterPath}`} alt="" width={28} height={42} className="rounded w-7 h-10 object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{r.answer ?? "Unknown"}</p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {r.timeElapsed.toFixed(1)}s · {r.wrongGuesses} wrong
                </p>
              </div>
              <span className={`text-sm font-bold ${r.correct ? "text-green-400" : "text-red-400"}`}>
                {r.correct ? `+${r.points.toFixed(1)}` : "0"}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => { setScreen("menu"); setResults(null); setQuiz(null); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] text-white rounded-xl text-sm font-semibold hover:border-[var(--ratist-red)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </button>
          {quiz.mode === "practice" && (
            <button
              onClick={() => startQuiz("practice", quiz.mediaType, quiz.difficulty)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Play Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
