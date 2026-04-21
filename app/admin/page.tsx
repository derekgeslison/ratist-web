"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  FileText, Map, Edit, Eye, EyeOff, Trash2, Users, Star, Film, BookOpen, Shield,
  Ticket, Lightbulb, Flag, MessageCircle, ShieldAlert, Newspaper, Cpu, AlertCircle,
} from "lucide-react";
import TwoThumbsIcon from "@/components/TwoThumbsIcon";

interface Post {
  id: string;
  type: "BLOG" | "PUNCH_AND_JUDY" | "MOVIE_MAP";
  title: string;
  slug: string;
  published: boolean;
  updatedAt: string;
  author: { name: string };
}

interface SiteStats {
  users: { total: number; day: number; week: number; month: number };
  ratings: { total: number; day: number; week: number; reviews: number };
  movies: { total: number };
  seenEntries: number;
  publishedPosts: number;
  subscribers: { active: number; week: number; month: number };
  queues: {
    ideas: number;
    reports: number;
    feedback: number;
    fraud: number;
    news: number;
    aiFlagged: number;
  };
}

const TYPE_META = {
  BLOG: { label: "Blog", icon: FileText, color: "text-blue-400" },
  PUNCH_AND_JUDY: { label: "Two Thumbs", icon: TwoThumbsIcon, color: "text-orange-400" },
  MOVIE_MAP: { label: "Movie Map", icon: Map, color: "text-green-400" },
};

interface Alert {
  key: string;
  label: string;
  count: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "warn" | "info" | "danger";
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyType, setPolicyType] = useState<"privacy" | "terms" | "both">("privacy");
  const [policySummary, setPolicySummary] = useState("");
  const [policySending, setPolicySending] = useState(false);
  const [policyResult, setPolicyResult] = useState<string | null>(null);

  async function fetchAll() {
    if (!user) return;
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };

    const [postsRes, statsRes] = await Promise.all([
      fetch("/api/admin/posts", { headers }),
      fetch("/api/admin/stats", { headers }),
    ]);

    if (!postsRes.ok) {
      setError("Access denied. Your account does not have admin privileges.");
      setLoading(false);
      return;
    }

    const postsData = await postsRes.json();
    setPosts(postsData.posts);

    if (statsRes.ok) {
      setStats(await statsRes.json());
    }

    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, [user]);

  async function togglePublish(post: Post) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch(`/api/admin/posts/${post.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ published: !post.published }),
    });
    await fetchAll();
  }

  async function deletePost(post: Post) {
    if (!user || !confirm(`Delete "${post.title}"?`)) return;
    const token = await user.getIdToken();
    await fetch(`/api/admin/posts/${post.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchAll();
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const alerts: Alert[] = stats
    ? (
        [
          { key: "reports", label: "Pending reports", count: stats.queues.reports, href: "/admin/moderation", icon: Flag, tone: "danger" as const },
          { key: "fraud", label: "Open fraud flags", count: stats.queues.fraud, href: "/admin/fraud", icon: ShieldAlert, tone: "danger" as const },
          { key: "aiFlagged", label: "Flagged AI users", count: stats.queues.aiFlagged, href: "/admin/ai-usage", icon: Cpu, tone: "warn" as const },
          { key: "ideas", label: "New idea submissions", count: stats.queues.ideas, href: "/admin/ideas", icon: Lightbulb, tone: "info" as const },
          { key: "feedback", label: "Open feedback", count: stats.queues.feedback, href: "/admin/feedback", icon: MessageCircle, tone: "info" as const },
          { key: "news", label: "RSS headlines to triage", count: stats.queues.news, href: "/admin/news", icon: Newspaper, tone: "info" as const },
        ] as Alert[]
      ).filter((a) => a.count > 0)
    : [];

  return (
    <div className="space-y-8">
      {/* Needs Attention — alerts for non-zero queues */}
      {alerts.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[var(--ratist-red)]" />
            Needs Attention
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alerts.map(({ key, label, count, href, icon: Icon, tone }) => {
              const toneClasses = {
                danger: "border-red-500/40 bg-red-500/5 hover:border-red-500/70",
                warn: "border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-500/70",
                info: "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60",
              }[tone];
              const iconTone = {
                danger: "text-red-400",
                warn: "text-yellow-400",
                info: "text-blue-400",
              }[tone];
              return (
                <Link
                  key={key}
                  href={href}
                  className={`group flex items-center gap-3 border rounded-xl p-4 transition-colors ${toneClasses}`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${iconTone}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{label}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">Click to review</p>
                  </div>
                  <span className={`text-2xl font-bold ${iconTone}`}>{count}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Site stats */}
      {stats && (
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Site Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-[var(--foreground-muted)]">Users</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.users.total.toLocaleString()}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                +{stats.users.day} today · +{stats.users.week} this week
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-4 h-4 text-[var(--ratist-red)]" />
                <span className="text-xs text-[var(--foreground-muted)]">Subscribers</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.subscribers.active.toLocaleString()}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                +{stats.subscribers.week} this week · +{stats.subscribers.month} this month
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-[var(--foreground-muted)]">Ratings</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.ratings.total.toLocaleString()}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                +{stats.ratings.day} today · {stats.ratings.reviews} reviews
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Film className="w-4 h-4 text-green-400" />
                <span className="text-xs text-[var(--foreground-muted)]">Movies in DB</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.movies.total.toLocaleString()}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                {stats.seenEntries.toLocaleString()} seen entries
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-[var(--foreground-muted)]">Published Posts</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.publishedPosts}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                +{stats.users.month} new users this month
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Policy Update Notification */}
      <section>
        <button
          onClick={() => setPolicyOpen(!policyOpen)}
          className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
        >
          <Shield className="w-4 h-4" />
          Send Policy Update Notification
        </button>
        {policyOpen && (
          <div className="mt-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <p className="text-xs text-[var(--foreground-muted)]">
              This will create a site-wide banner AND send an email to <strong className="text-white">all users</strong> (including those who opted out of marketing emails — policy updates are a legal requirement).
            </p>
            <div>
              <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">What changed?</label>
              <div className="flex gap-2">
                {(["privacy", "terms", "both"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPolicyType(t)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      policyType === t
                        ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                        : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                    }`}
                  >
                    {t === "privacy" ? "Privacy Policy" : t === "terms" ? "Terms of Service" : "Both"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Summary of changes</label>
              <textarea
                value={policySummary}
                onChange={(e) => setPolicySummary(e.target.value)}
                placeholder="Briefly describe what changed and why (this appears in the email)..."
                rows={3}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-3 focus:outline-none focus:border-[var(--ratist-red)] resize-none placeholder:text-[var(--foreground-muted)]"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!user || !policySummary.trim() || policySending) return;
                  if (!confirm("This will email ALL users. Are you sure?")) return;
                  setPolicySending(true);
                  setPolicyResult(null);
                  const token = await user.getIdToken();
                  const res = await fetch("/api/admin/policy-notify", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ policyType, summary: policySummary.trim() }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setPolicyResult(`Sent to ${data.sent} users (${data.failed} failed). Banner created.`);
                    setPolicySummary("");
                  } else {
                    setPolicyResult(`Error: ${data.error}`);
                  }
                  setPolicySending(false);
                }}
                disabled={policySending || !policySummary.trim()}
                className="px-4 py-2 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors disabled:opacity-50"
              >
                {policySending ? "Sending..." : "Send to All Users"}
              </button>
              {policyResult && <span className="text-sm text-[var(--foreground-muted)]">{policyResult}</span>}
            </div>
          </div>
        )}
      </section>

      {/* Recent posts table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-white">Recent Posts</h2>
        </div>
        {posts.length === 0 ? (
          <p className="text-[var(--foreground-muted)] text-sm px-5 py-8 text-center">No posts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {posts.map((post, i) => {
                const { label, icon: Icon, color } = TYPE_META[post.type];
                return (
                  <tr key={post.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""}`}>
                    <td className="px-5 py-3">
                      <Link href={`/admin/posts/${post.id}/edit`} className="text-white hover:text-[var(--ratist-red)] transition-colors font-medium">
                        {post.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs ${color}`}>
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${post.published ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-[var(--border)] text-[var(--foreground-muted)]"}`}>
                        {post.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--foreground-muted)]">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/admin/posts/${post.id}/edit`} className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors" title="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </Link>
                        <button onClick={() => togglePublish(post)} className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors" title={post.published ? "Unpublish" : "Publish"}>
                          {post.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => deletePost(post)} className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
