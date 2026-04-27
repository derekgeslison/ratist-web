"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TextareaWithEmoji from "@/components/TextareaWithEmoji";

const CATEGORIES = [
  { value: "bug", label: "Bug Report" },
  { value: "inaccurate_info", label: "Inaccurate Info" },
  { value: "feature_request", label: "Feature Request" },
  { value: "account_issue", label: "Account Issue" },
  { value: "content_issue", label: "Content Issue" },
  { value: "other", label: "Other" },
];

export default function FeedbackPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !message.trim()) return;
    if (!user && !email.trim()) { setError("Email is required"); return; }
    setSubmitting(true);
    setError("");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers,
      body: JSON.stringify({ category, message, email: email || undefined }),
    }).catch(() => null);

    if (res?.ok) {
      setSubmitted(true);
    } else {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? "Failed to submit feedback");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-green-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Feedback Submitted</h1>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">
          Thank you for your feedback! Our team will review it and may follow up if needed.
        </p>
        <Link href="/" className="text-sm text-[var(--ratist-red)] hover:underline">Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-xl font-bold text-white">Submit Feedback</h1>
      </div>

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--foreground-muted)]">
          Found a bug? Have a feature idea? Let us know — we read every submission.
        </p>
        {user && (
          <Link href="/feedback/my" className="text-xs text-[var(--ratist-red)] hover:underline shrink-0 ml-4">
            My Submissions
          </Link>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          >
            <option value="">Select a category...</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Your Feedback</label>
          <TextareaWithEmoji
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue, suggestion, or feedback in detail..."
            required
            rows={6}
            maxLength={5000}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1 text-right">{message.length}/5000</p>
        </div>

        {/* Email (non-logged-in users) */}
        {!user && (
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
              Email <span className="text-xs opacity-60">(required so we can follow up)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !category || !message.trim()}
          className="w-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold py-2.5 rounded-full disabled:opacity-40 transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </button>
      </form>
    </div>
  );
}
