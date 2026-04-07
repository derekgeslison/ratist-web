"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { FileText, Swords, Map, LayoutDashboard, Users, Trophy, Flag, Megaphone, KeyRound, ScrollText, Clapperboard } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!user) return;

    user.getIdToken().then((token) =>
      fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
    ).then((res) => {
      setIsAdmin(res.ok);
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
        <nav className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
          {[
            { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
            { href: "/admin/posts?type=BLOG", label: "Blog", icon: FileText },
            { href: "/admin/posts?type=PUNCH_AND_JUDY", label: "Punch & Judy", icon: Swords },
            { href: "/admin/posts?type=MOVIE_MAP", label: "Movie Maps", icon: Map },
            { href: "/admin/users", label: "Users", icon: Users },
            { href: "/admin/moderation", label: "Moderation", icon: Flag },
            { href: "/admin/spotlights", label: "Spotlights", icon: Megaphone },
            { href: "/admin/logs", label: "Activity Log", icon: ScrollText },
            { href: "/admin/oscar-picks", label: "Oscar Picks", icon: Trophy },
            { href: "/admin/movie-club", label: "Movie Club", icon: Clapperboard },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors whitespace-nowrap shrink-0"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
