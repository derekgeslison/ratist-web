"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { FileText, Map, Plus, Edit, Eye, EyeOff, Trash2, Users, Star, Film, BookOpen, Shield } from "lucide-react";
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
}

const TYPE_META = {
  BLOG: { label: "Blog", icon: FileText, color: "text-blue-400" },
  PUNCH_AND_JUDY: { label: "Two Thumbs", icon: TwoThumbsIcon, color: "text-orange-400" },
  MOVIE_MAP: { label: "Movie Map", icon: Map, color: "text-green-400" },
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Policy notification
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

  const counts = { BLOG: 0, PUNCH_AND_JUDY: 0, MOVIE_MAP: 0 };
  posts.forEach((p) => counts[p.type]++);

  return (
    <div className="space-y-8">
      {/* Site stats */}
      {stats && (
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Site Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

      {/* Post type shortcuts */}
      <div className="grid grid-cols-3 gap-4">
        {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((type) => {
          const { label, icon: Icon, color } = TYPE_META[type];
          return (
            <Link
              key={type}
              href={`/admin/posts/new?type=${type}`}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)] transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${color}`} />
                <Plus className="w-4 h-4 text-[var(--foreground-muted)] group-hover:text-[var(--ratist-red)] transition-colors" />
              </div>
              <p className="text-2xl font-bold text-white">{counts[type]}</p>
              <p className="text-xs text-[var(--foreground-muted)]">{label} post{counts[type] !== 1 ? "s" : ""}</p>
            </Link>
          );
        })}
      </div>

      {/* Posts table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-white">All Posts</h2>
          <Link
            href="/admin/posts/new"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Post
          </Link>
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
