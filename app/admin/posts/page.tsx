"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { Plus, Edit2, Eye, EyeOff, Clock, Trash2 } from "lucide-react";

interface Post {
  id: string;
  type: string;
  title: string;
  slug: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  author: { name: string };
}

const TYPE_LABELS: Record<string, string> = {
  BLOG: "Blog Post",
  PUNCH_AND_JUDY: "Punch & Judy",
  MOVIE_MAP: "Movie Map",
};

function AdminPostsInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const type = searchParams.get("type") ?? "BLOG";
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    user.getIdToken().then((token) =>
      fetch(`/api/admin/posts?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then(async (r) => {
      const d = await r.json();
      if (!r.ok) { setFetchError(d.error ?? `Error ${r.status}`); setLoading(false); return; }
      setPosts(d.posts ?? []);
      setLoading(false);
    }).catch((e) => { setFetchError(String(e)); setLoading(false); });
  }, [user, type]);

  async function deletePost(post: Post) {
    if (!user || !confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/posts/${post.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">{TYPE_LABELS[type] ?? type}</h2>
        <Link
          href={`/admin/posts/new?type=${type}`}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
        >
          <Plus className="w-4 h-4" /> New {TYPE_LABELS[type] ?? "Post"}
        </Link>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading…</p>
      ) : fetchError ? (
        <p className="text-red-400 text-sm py-8 text-center">Error loading posts: {fetchError}</p>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-white font-medium mb-1">No posts yet</p>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">Create your first {TYPE_LABELS[type]?.toLowerCase() ?? "post"} to get started.</p>
          <Link
            href={`/admin/posts/new?type=${type}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> New {TYPE_LABELS[type] ?? "Post"}
          </Link>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-[var(--foreground-muted)] font-medium">Title</th>
                <th className="text-left px-4 py-3 text-[var(--foreground-muted)] font-medium hidden sm:table-cell">Author</th>
                <th className="text-center px-4 py-3 text-[var(--foreground-muted)] font-medium">Status</th>
                <th className="text-left px-4 py-3 text-[var(--foreground-muted)] font-medium hidden md:table-cell">Updated</th>
                <th className="text-right px-4 py-3 text-[var(--foreground-muted)] font-medium hidden lg:table-cell">Views</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {posts.map((post, i) => (
                <tr key={post.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "" : "bg-[var(--surface-2)]/30"}`}>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium line-clamp-1">{post.title}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">/blog/{post.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)] hidden sm:table-cell">{post.author.name}</td>
                  <td className="px-4 py-3 text-center">
                    {post.published ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <Eye className="w-3 h-3" /> Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                        <EyeOff className="w-3 h-3" /> Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)] hidden md:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Clock className="w-3 h-3" />
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--foreground-muted)] hidden lg:table-cell">
                    {post.viewCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3 h-3" />{post.viewCount.toLocaleString()}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/admin/posts/${post.id}/edit`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </Link>
                      <button
                        onClick={() => deletePost(post)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 hover:border-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminPostsPage() {
  return (
    <Suspense>
      <AdminPostsInner />
    </Suspense>
  );
}
