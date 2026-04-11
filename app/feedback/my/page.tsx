"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface FeedbackItem {
  id: string;
  category: string;
  message: string;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug Report",
  inaccurate_info: "Inaccurate Info",
  feature_request: "Feature Request",
  account_issue: "Account Issue",
  content_issue: "Content Issue",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-green-500/20 text-green-400",
};

export default function MyFeedbackPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) => {
      fetch("/api/feedback/my", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setItems(data.items ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to view your feedback.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/feedback" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Submit New Feedback
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-xl font-bold text-white">My Feedback</h1>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-[var(--foreground-muted)] mb-3">You haven&apos;t submitted any feedback yet.</p>
          <Link href="/feedback" className="text-sm text-[var(--ratist-red)] hover:underline">Submit Feedback</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? STATUS_COLORS.open}`}>
                  {item.status.replace("_", " ")}
                </span>
                <span className="text-xs text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </span>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <p className="text-sm text-white/90 whitespace-pre-wrap mb-3">{item.message}</p>

              {item.adminReply && (
                <div className="bg-[var(--ratist-red)]/5 border border-[var(--ratist-red)]/20 rounded-lg p-3">
                  <p className="text-[10px] text-[var(--ratist-red)] font-semibold mb-1">
                    Admin Response · {item.repliedAt ? new Date(item.repliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                  </p>
                  <p className="text-sm text-white/90 whitespace-pre-wrap">{item.adminReply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
