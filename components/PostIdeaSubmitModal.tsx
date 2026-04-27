"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Send, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import MediaLinker from "@/components/forum/MediaLinker";
import PersonLinker from "@/components/forum/PersonLinker";
import TextareaWithEmoji from "@/components/TextareaWithEmoji";

interface Media {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
}
interface Person {
  tmdbId: number;
  name: string;
  profilePath: string | null;
}

interface Props {
  type: "PUNCH_AND_JUDY" | "MOVIE_MAP";
  label: string;
  onClose: () => void;
}

export default function PostIdeaSubmitModal({ type, label, onClose }: Props) {
  const { user } = useAuth();
  const [media, setMedia] = useState<Media[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (!user) return;
    if (description.trim().length < 10) {
      setError("Please write at least 10 characters so admins have something to work with.");
      return;
    }
    setSubmitting(true);
    setError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/post-ideas", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        description: description.trim(),
        media: media[0] ?? null,
        person: people[0] ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? `Failed to submit (${res.status})`);
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--background)] border border-[var(--border)] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background)]">
          <h2 className="text-base font-semibold text-white">Suggest a {label}</h2>
          <button onClick={onClose} className="text-[var(--foreground-muted)] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!user ? (
          <div className="p-6 text-center space-y-4">
            <p className="text-sm text-[var(--foreground-muted)]">Sign in to submit an idea.</p>
            <Link
              href={`/auth/sign-in?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
              className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
            >
              Sign In
            </Link>
          </div>
        ) : success ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-white font-semibold">Idea submitted</p>
            <p className="text-sm text-[var(--foreground-muted)]">Thanks — admins review these when planning new posts.</p>
            <button onClick={onClose} className="text-sm text-[var(--ratist-red)] hover:underline">Close</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <MediaLinker selected={media} onChange={setMedia} max={1} />
            <PersonLinker selected={people} onChange={setPeople} max={1} />
            <div>
              <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
                Your idea <span className="text-xs opacity-60">(required, min 10 characters)</span>
              </label>
              <TextareaWithEmoji
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === "PUNCH_AND_JUDY"
                  ? "e.g. Is Nolan a visionary director? What makes Chinatown a masterpiece?"
                  : "e.g. Map the timeline of Tenet. Untangle the dream layers in Inception."}
                rows={5}
                maxLength={2000}
                className="w-full bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded-lg p-3 focus:outline-none focus:border-[var(--ratist-red)] resize-y placeholder:text-[var(--foreground-muted)]"
              />
              <div className="flex items-center justify-end text-xs text-[var(--foreground-muted)] mt-1">
                {description.length}/2000
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || description.trim().length < 10}
                className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
