"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import {
  FileText, Map, LayoutDashboard, Users, Trophy, Flag, Megaphone, ScrollText,
  Clapperboard, Ticket, MessageCircle, Newspaper, ShieldAlert, Lightbulb, Cpu,
  ExternalLink, Mail, Sparkles, BookOpen,
} from "lucide-react";
import TwoThumbsIcon from "@/components/TwoThumbsIcon";

type IconComp = React.ComponentType<{ className?: string }>;

interface TopTab {
  group: string;
  label: string;
  icon: IconComp;
  href: string;
}

interface SubTab {
  label: string;
  icon: IconComp;
  href: string;
  pathPrefix: string;
  typeValue?: string;
  countKey?: string; // which stats.queues key to read
}

interface StatsQueues {
  ideas?: number;
  reports?: number;
  feedback?: number;
  contact?: number;
  fraud?: number;
  aiFlagged?: number;
  inviteCodeRequests?: number;
}

const TOP_TABS: TopTab[] = [
  { group: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin" },
  { group: "posts", label: "Posts", icon: FileText, href: "/admin/posts?type=BLOG" },
  { group: "spotlights", label: "Spotlights", icon: Megaphone, href: "/admin/spotlights" },
  { group: "community", label: "Community", icon: Flag, href: "/admin/moderation" },
  { group: "users", label: "Users", icon: Users, href: "/admin/users" },
  { group: "subscriptions", label: "Subscriptions", icon: Ticket, href: "/admin/subscriptions" },
  { group: "programs", label: "Programs", icon: Trophy, href: "/admin/oscar-picks" },
  { group: "insights", label: "Insights", icon: ScrollText, href: "/admin/logs" },
];

const SUB_TABS: Record<string, SubTab[]> = {
  posts: [
    { label: "Blog", icon: FileText, href: "/admin/posts?type=BLOG", pathPrefix: "/admin/posts", typeValue: "BLOG" },
    { label: "News", icon: Newspaper, href: "/admin/news", pathPrefix: "/admin/news" },
    { label: "Two Thumbs", icon: TwoThumbsIcon, href: "/admin/posts?type=PUNCH_AND_JUDY", pathPrefix: "/admin/posts", typeValue: "PUNCH_AND_JUDY" },
    { label: "Movie Maps", icon: Map, href: "/admin/posts?type=MOVIE_MAP", pathPrefix: "/admin/posts", typeValue: "MOVIE_MAP" },
    { label: "Ideas", icon: Lightbulb, href: "/admin/ideas", pathPrefix: "/admin/ideas", countKey: "ideas" },
  ],
  community: [
    { label: "Moderation", icon: Flag, href: "/admin/moderation", pathPrefix: "/admin/moderation", countKey: "reports" },
    { label: "Feedback", icon: MessageCircle, href: "/admin/feedback", pathPrefix: "/admin/feedback", countKey: "feedback" },
    { label: "Contact", icon: Mail, href: "/admin/contact", pathPrefix: "/admin/contact", countKey: "contact" },
    { label: "Fraud", icon: ShieldAlert, href: "/admin/fraud", pathPrefix: "/admin/fraud", countKey: "fraud" },
    { label: "Invite Codes", icon: Ticket, href: "/admin/invite-code-requests", pathPrefix: "/admin/invite-code-requests", countKey: "inviteCodeRequests" },
  ],
  programs: [
    { label: "Oscar Picks", icon: Trophy, href: "/admin/oscar-picks", pathPrefix: "/admin/oscar-picks" },
    { label: "Movie Club", icon: Clapperboard, href: "/admin/movie-club", pathPrefix: "/admin/movie-club" },
    { label: "Companions", icon: BookOpen, href: "/admin/watch-companions", pathPrefix: "/admin/watch-companions" },
    { label: "Collection Prompts", icon: Sparkles, href: "/admin/collection-prompts", pathPrefix: "/admin/collection-prompts" },
    { label: "Ratist Collections", icon: BookOpen, href: "/admin/collections", pathPrefix: "/admin/collections" },
  ],
  insights: [
    { label: "Activity Log", icon: ScrollText, href: "/admin/logs", pathPrefix: "/admin/logs" },
    { label: "AI Usage", icon: Cpu, href: "/admin/ai-usage", pathPrefix: "/admin/ai-usage", countKey: "aiFlagged" },
    { label: "Affiliate Clicks", icon: ExternalLink, href: "/admin/affiliate-clicks", pathPrefix: "/admin/affiliate-clicks" },
  ],
};

function activeGroup(pathname: string): string {
  if (pathname === "/admin") return "dashboard";
  if (pathname.startsWith("/admin/posts") || pathname.startsWith("/admin/news") || pathname.startsWith("/admin/ideas")) return "posts";
  if (pathname.startsWith("/admin/spotlights")) return "spotlights";
  if (pathname.startsWith("/admin/moderation") || pathname.startsWith("/admin/feedback") || pathname.startsWith("/admin/contact") || pathname.startsWith("/admin/fraud") || pathname.startsWith("/admin/invite-code-requests")) return "community";
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/subscriptions")) return "subscriptions";
  if (pathname.startsWith("/admin/oscar-picks") || pathname.startsWith("/admin/movie-club") || pathname.startsWith("/admin/watch-companions") || pathname.startsWith("/admin/collection-prompts") || pathname.startsWith("/admin/collections")) return "programs";
  if (pathname.startsWith("/admin/logs") || pathname.startsWith("/admin/ai-usage") || pathname.startsWith("/admin/affiliate-clicks")) return "insights";
  return "dashboard";
}

function isSubActive(sub: SubTab, pathname: string, typeParam: string | null): boolean {
  if (!pathname.startsWith(sub.pathPrefix)) return false;
  if (sub.typeValue) return typeParam === sub.typeValue;
  return true;
}

function AdminNav({ queues }: { queues: StatsQueues }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const group = activeGroup(pathname);
  const subs = SUB_TABS[group] ?? [];

  return (
    <>
      <nav className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
        {TOP_TABS.map(({ group: g, label, icon: Icon, href }) => {
          const isActive = g === group;
          return (
            <Link
              key={g}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? "bg-[var(--ratist-red)]/10 text-white border border-[var(--ratist-red)]/40"
                  : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      {subs.length > 0 && (
        <nav className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 mt-3 pl-1">
          {subs.map(({ label, icon: Icon, href, pathPrefix, typeValue, countKey }) => {
            const active = isSubActive({ label, icon: Icon, href, pathPrefix, typeValue }, pathname, typeParam);
            const count = countKey ? (queues[countKey as keyof StatsQueues] ?? 0) : 0;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? "bg-[var(--surface)] text-white"
                    : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--ratist-red)] text-white leading-none">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [queues, setQueues] = useState<StatsQueues>({});

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!user) return;

    user.getIdToken().then(async (token) => {
      const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
      setIsAdmin(res.ok);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.queues) setQueues(data.queues);
      }
    }).catch(() => setIsAdmin(false));
  }, [user, loading, router]);

  if (loading || !user || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[var(--foreground-muted)]">Loading…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-lg font-semibold text-white mb-2">Access Denied</p>
        <p className="text-sm text-[var(--foreground-muted)]">You don&apos;t have admin permissions.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 pb-6 border-b border-[var(--border)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-8 bg-[var(--ratist-red)] rounded-full" />
          <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        </div>
        <Suspense fallback={null}>
          <AdminNav queues={queues} />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
