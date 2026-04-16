"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Film, ArrowRight, Award, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import CelebrityCreditsSection, { type Credit } from "./CelebrityCreditsSection";
import CelebrityAwardsSection from "./CelebrityAwardsSection";
import type { AwardBodyGroup } from "@/lib/awards";

interface Discussion {
  id: string;
  title: string;
  slug: string;
  threadType: string;
  authorName: string;
  postCount: number;
  linkHref?: string;
}

interface Photo {
  file_path: string;
  width: number;
  height: number;
  vote_average: number;
}

interface Props {
  personId: number;
  personName: string;
  filmography: Credit[];
  awards: AwardBodyGroup[];
  photos: Photo[];
  discussions: Discussion[];
}

const TABS = ["Filmography", "Awards", "Media", "Discussions"] as const;
type Tab = (typeof TABS)[number];

export default function CelebrityDetailTabs({
  personId,
  personName,
  filmography,
  awards,
  photos,
  discussions,
}: Props) {
  function tabToHash(tab: Tab): string {
    return tab.toLowerCase();
  }

  function hashToTab(): Tab {
    if (typeof window === "undefined") return "Filmography";
    const hash = window.location.hash.slice(1);
    if (!hash) return "Filmography";
    return TABS.find((t) => tabToHash(t) === hash) ?? "Filmography";
  }

  const [activeTab, setActiveTabState] = useState<Tab>(hashToTab);

  useEffect(() => {
    function sync() { setActiveTabState(hashToTab()); }
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    sync();
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab);
    const hash = tab === "Filmography" ? "" : `#${tabToHash(tab)}`;
    window.history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }

  return (
    <>
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-8">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[var(--ratist-red)] text-white"
                : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {tab}
            {tab === "Filmography" && filmography.length > 0 && (
              <span className="ml-1.5 text-xs text-[var(--foreground-muted)]">({filmography.length})</span>
            )}
            {tab === "Awards" && awards.length > 0 && (
              <span className="ml-1.5 text-xs text-[var(--foreground-muted)]">
                ({awards.reduce((s, g) => s + g.nomCount, 0)})
              </span>
            )}
            {tab === "Media" && photos.length > 0 && (
              <span className="ml-1.5 text-xs text-[var(--foreground-muted)]">({photos.length})</span>
            )}
            {tab === "Discussions" && discussions.length > 0 && (
              <span className="ml-1.5 text-xs text-[var(--foreground-muted)]">({discussions.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── FILMOGRAPHY TAB ── */}
      {activeTab === "Filmography" && (
        <div className="space-y-4 pb-16">
          {filmography.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Film className="w-5 h-5 text-[var(--ratist-red)]" /> Filmography
                </h2>
                <Link
                  href={`/movies?cast=${personId}&castLabels=${encodeURIComponent(personName)}`}
                  className="text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors flex items-center gap-1"
                >
                  Show all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <CelebrityCreditsSection credits={filmography} personId={personId} />
            </>
          ) : (
            <p className="text-center py-16 text-[var(--foreground-muted)]">No filmography data available.</p>
          )}
        </div>
      )}

      {/* ── AWARDS TAB ── */}
      {activeTab === "Awards" && (
        <div className="pb-16">
          <CelebrityAwardsSection awards={awards} tmdbId={personId} />
          {awards.length === 0 && (
            <CelebrityAwardsEmpty tmdbId={personId} />
          )}
        </div>
      )}

      {/* ── MEDIA TAB ── */}
      {activeTab === "Media" && (
        <div className="pb-16">
          {photos.length > 0 ? (
            <>
              <p className="text-xs text-[var(--foreground-muted)] mb-4">Click any image to view full size</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {photos.map((img, i) => (
                  <a
                    key={i}
                    href={`https://image.tmdb.org/t/p/original${img.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-[2/3] rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors block"
                  >
                    <Image
                      src={`https://image.tmdb.org/t/p/w342${img.file_path}`}
                      alt={`${personName} photo ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                      className="object-cover object-top"
                    />
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center py-16 text-[var(--foreground-muted)]">No photos available.</p>
          )}
        </div>
      )}

      {/* ── DISCUSSIONS TAB ── */}
      {activeTab === "Discussions" && (
        <div className="pb-16">
          {discussions.length > 0 ? (
            <div className="space-y-2">
              {discussions.map((d) => (
                <Link
                  key={d.id}
                  href={d.linkHref ?? `/forum/t/${d.slug}`}
                  className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--foreground-muted)]/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{d.title}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{d.authorName !== "The Ratist" && `by ${d.authorName}`}{d.authorName !== "The Ratist" && d.postCount > 0 && " · "}{d.postCount > 0 && `${d.postCount} posts`}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center py-16 text-[var(--foreground-muted)]">No discussions yet.</p>
          )}
        </div>
      )}
    </>
  );
}

function CelebrityAwardsEmpty({ tmdbId }: { tmdbId: number }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setIsAdmin(d.isAdmin === true))
        .catch(() => {})
    );
  }, [user]);

  async function handleRefresh() {
    if (!user) return;
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/awards-refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "celebrity", tmdbId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefreshResult(`Synced ${data.count} awards. Reload to see updates.`);
      } else {
        setRefreshResult(data.error || "Refresh failed");
      }
    } catch {
      setRefreshResult("Refresh failed");
    }
    setRefreshing(false);
  }

  return (
    <div className="text-center py-16 text-[var(--foreground-muted)]">
      <Award className="w-12 h-12 mx-auto mb-4 opacity-40" />
      <p>No awards data available yet.</p>
      <p className="text-sm mt-1">Awards data is being synced — try refreshing the page in a moment.</p>
      {isAdmin && (
        <div className="mt-4">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Syncing..." : "Refresh Awards"}
          </button>
          {refreshResult && <p className="text-xs mt-2">{refreshResult}</p>}
        </div>
      )}
    </div>
  );
}
