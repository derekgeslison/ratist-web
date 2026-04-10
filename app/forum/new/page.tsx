"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AdUnit from "@/components/AdUnit";
import MediaLinker from "@/components/forum/MediaLinker";
import PersonLinker from "@/components/forum/PersonLinker";
import TagInput from "@/components/forum/TagInput";
import PollBuilder from "@/components/forum/PollBuilder";

const THREAD_TYPES = [
  { value: "discussion", label: "Discussion", desc: "General movie or TV discussion" },
  { value: "theory", label: "Theory", desc: "Share a fan theory" },
  { value: "poll", label: "Poll", desc: "Create a community poll" },
  { value: "recommendation", label: "Recommendation", desc: "Ask for or give recommendations" },
  { value: "debate", label: "Debate", desc: "Start an open debate challenge" },
];

interface MediaItem { tmdbId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null }
interface PersonItem { tmdbId: number; name: string; profilePath: string | null }

function NewThreadForm() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threadType, setThreadType] = useState("discussion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hasSpoilers, setHasSpoilers] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>(() => {
    // Pre-fill from URL params
    const tmdbId = searchParams.get("tmdbId");
    const mediaType = searchParams.get("mediaType") as "movie" | "tv" | null;
    const mediaTitle = searchParams.get("title");
    const posterPath = searchParams.get("posterPath");
    if (tmdbId && mediaType && mediaTitle) {
      return [{ tmdbId: Number(tmdbId), mediaType, title: mediaTitle, posterPath }];
    }
    return [];
  });
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || !content.trim()) return;
    if (threadType === "poll" && pollOptions.filter((o) => o.trim()).length < 2) {
      setError("Polls need at least 2 non-empty options");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        threadType,
        title,
        content,
        hasSpoilers,
        media,
        people,
        tags,
      };
      if (threadType === "poll") {
        body.pollOptions = pollOptions.filter((o) => o.trim());
      }
      const res = await fetch("/api/forum/threads", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create thread");
      } else {
        router.push(`/forum/t/${data.thread.slug}`);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to start a new thread.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Forums
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <PenLine className="w-5 h-5 text-cyan-400" />
        <h1 className="text-xl font-bold text-white">Start a New Thread</h1>
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-4" />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Thread type */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-2">Thread Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {THREAD_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setThreadType(t.value)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  threadType === t.value
                    ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--foreground-muted)]"
                }`}
              >
                <p className="text-sm font-semibold text-white">{t.label}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's on your mind?"
            required
            maxLength={200}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1 text-right">{title.length}/200</p>
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts..."
            required
            rows={8}
            maxLength={10000}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1 text-right">{content.length}/10000</p>
        </div>

        {/* Media linker */}
        <MediaLinker selected={media} onChange={setMedia} max={4} />

        {/* Person linker */}
        <PersonLinker selected={people} onChange={setPeople} />

        {/* Tags */}
        <TagInput tags={tags} onChange={setTags} max={10} />

        {/* Spoiler toggle */}
        <button type="button" onClick={() => setHasSpoilers(!hasSpoilers)} className="flex items-center gap-3 cursor-pointer">
          <div className={`relative w-10 h-5 rounded-full transition-colors ${hasSpoilers ? "bg-yellow-500" : "bg-[var(--surface-2)]"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${hasSpoilers ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
          <span className="text-sm text-[var(--foreground-muted)]">Contains spoilers</span>
        </button>

        {/* Poll builder (conditional) */}
        {threadType === "poll" && (
          <PollBuilder options={pollOptions} onChange={setPollOptions} />
        )}

        {/* Debate info */}
        {threadType === "debate" && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
            <p className="text-xs text-orange-400">This creates an open debate challenge. Any user can accept and become your opponent. Only you and your opponent will be able to post replies, alternating turns.</p>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <Link
            href="/forum"
            className="px-5 py-2.5 text-sm font-semibold text-[var(--foreground-muted)] border border-[var(--border)] rounded-full hover:border-white hover:text-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !content.trim()}
            className="px-6 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-full disabled:opacity-40 transition-colors"
          >
            {submitting ? "Posting..." : "Post Thread"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewThreadPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">Loading...</div>}>
      <NewThreadForm />
    </Suspense>
  );
}
