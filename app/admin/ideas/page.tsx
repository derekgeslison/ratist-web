"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { Lightbulb, Check, X, Trash2, FileText, Film, Tv, User as UserIcon } from "lucide-react";
import TwoThumbsIcon from "@/components/TwoThumbsIcon";
import { Map } from "lucide-react";

type IdeaType = "PUNCH_AND_JUDY" | "MOVIE_MAP";
type Status = "pending" | "accepted" | "rejected" | "completed";

interface Idea {
  id: string;
  type: IdeaType;
  description: string;
  media: { tmdbId: number; mediaType: string | null; title: string | null; posterPath: string | null } | null;
  person: { tmdbId: number; name: string | null; profilePath: string | null } | null;
  status: Status;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  submitter: { id: string; firebaseUid: string; name: string; avatarUrl: string | null } | null;
}

const TABS: { key: IdeaType; label: string; Icon: React.ComponentType<{ className?: string; size?: number }> }[] = [
  { key: "PUNCH_AND_JUDY", label: "Two Thumbs", Icon: TwoThumbsIcon },
  { key: "MOVIE_MAP", label: "Movie Maps", Icon: Map },
];

const STATUS_STYLE: Record<Status, string> = {
  pending: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10",
  accepted: "border-blue-500/50 text-blue-400 bg-blue-500/10",
  completed: "border-green-500/50 text-green-400 bg-green-500/10",
  rejected: "border-[var(--border)] text-[var(--foreground-muted)]",
};

const STATUS_OPTIONS: { key: Status; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminIdeasPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<IdeaType>("PUNCH_AND_JUDY");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/post-ideas", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setError("Access denied."); setLoading(false); return; }
    const data = await res.json();
    setIdeas(data.items ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  async function patch(id: string, body: Record<string, unknown>) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/post-ideas", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (res.ok) await load();
  }

  async function del(id: string) {
    if (!user || !confirm("Delete this idea?")) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/post-ideas?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) await load();
  }

  function draftPrefillHref(idea: Idea) {
    const params = new URLSearchParams({ type: idea.type });
    return `/admin/posts/new?${params.toString()}`;
  }

  const filtered = ideas.filter((i) => i.type === activeTab);
  const counts = {
    PUNCH_AND_JUDY: ideas.filter((i) => i.type === "PUNCH_AND_JUDY" && i.status === "pending").length,
    MOVIE_MAP: ideas.filter((i) => i.type === "MOVIE_MAP" && i.status === "pending").length,
  };

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-[var(--ratist-red)]" />
        <h2 className="text-lg font-semibold text-white">Idea Inbox</h2>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] -mb-px">
        {TABS.map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                active ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" size={16} />
              {label}
              {counts[key] > 0 && (
                <span className="text-[10px] font-semibold bg-[var(--ratist-red)] text-white rounded-full px-1.5 py-0.5">{counts[key]}</span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)] py-10 text-center">No ideas yet in this category.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <div key={idea.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[idea.status]}`}>{idea.status}</span>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {new Date(idea.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  {idea.submitter ? (
                    <Link href={`/profile/${idea.submitter.firebaseUid}`} className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white">
                      {idea.submitter.avatarUrl && (
                        <Image src={idea.submitter.avatarUrl} alt="" width={16} height={16} className="rounded-full w-4 h-4 object-cover" />
                      )}
                      {idea.submitter.name}
                    </Link>
                  ) : (
                    <span className="text-xs text-[var(--foreground-muted)]">Anonymous</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={draftPrefillHref(idea)}
                    className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-lg px-2 py-1 transition-colors"
                    title="Start a draft post"
                  >
                    <FileText className="w-3 h-3" /> Draft
                  </Link>
                  <button
                    onClick={() => del(idea.id)}
                    className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(idea.media || idea.person) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {idea.media && (
                    <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1">
                      {idea.media.posterPath && (
                        <div className="relative w-6 h-9 rounded overflow-hidden shrink-0">
                          <Image src={`https://image.tmdb.org/t/p/w92${idea.media.posterPath}`} alt="" fill sizes="24px" className="object-cover" />
                        </div>
                      )}
                      {idea.media.mediaType === "tv" ? <Tv className="w-3 h-3 text-blue-400" /> : <Film className="w-3 h-3 text-green-400" />}
                      <span className="text-xs text-white">{idea.media.title}</span>
                    </div>
                  )}
                  {idea.person && (
                    <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1">
                      {idea.person.profilePath ? (
                        <div className="relative w-6 h-6 rounded-full overflow-hidden shrink-0">
                          <Image src={`https://image.tmdb.org/t/p/w92${idea.person.profilePath}`} alt="" fill sizes="24px" className="object-cover" />
                        </div>
                      ) : (
                        <UserIcon className="w-3 h-3 text-[var(--foreground-muted)]" />
                      )}
                      <span className="text-xs text-white">{idea.person.name}</span>
                    </div>
                  )}
                </div>
              )}

              <p className="text-sm text-white whitespace-pre-wrap">{idea.description}</p>

              {/* Admin notes */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--foreground-muted)] hover:text-white">Admin notes</summary>
                <div className="mt-2 space-y-2">
                  <textarea
                    value={noteDrafts[idea.id] ?? idea.adminNotes ?? ""}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [idea.id]: e.target.value }))}
                    placeholder="Private notes for admins..."
                    rows={2}
                    maxLength={2000}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-[var(--ratist-red)] resize-y"
                  />
                  <button
                    onClick={() => patch(idea.id, { adminNotes: noteDrafts[idea.id] ?? "" })}
                    disabled={noteDrafts[idea.id] === undefined || noteDrafts[idea.id] === (idea.adminNotes ?? "")}
                    className="text-xs text-[var(--ratist-red)] hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    Save notes
                  </button>
                </div>
              </details>

              {/* Status controls */}
              <div className="flex items-center gap-1 pt-2 border-t border-[var(--border)]/50 flex-wrap">
                {STATUS_OPTIONS.map((s) => {
                  const active = idea.status === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => !active && patch(idea.id, { status: s.key })}
                      disabled={active}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? STATUS_STYLE[s.key] + " cursor-default"
                          : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--foreground-muted)]"
                      }`}
                    >
                      {s.key === "accepted" && !active && <Check className="w-3 h-3 inline mr-1" />}
                      {s.key === "rejected" && !active && <X className="w-3 h-3 inline mr-1" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
