"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Menu, X, User, LogOut, ChevronDown, Eye, Bookmark, MessageSquare, Settings, BookOpen, Swords, Star, Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import QuickSearch from "./QuickSearch";

const READ_LINKS = [
  { href: "/blog", label: "Blog", icon: BookOpen },
  { href: "/punch-and-judy", label: "Punch & Judy", icon: Swords },
];

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [readMenuOpen, setReadMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const readMenuRef = useRef<HTMLDivElement>(null);

  // Poll notification count + listen for instant updates
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    let cancelled = false;
    async function check() {
      const token = await user!.getIdToken();
      const res = await fetch("/api/notifications?countOnly=1", { headers: { Authorization: `Bearer ${token}` } });
      if (!cancelled && res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
      }
    }
    function onNotifUpdate(e: Event) {
      const count = (e as CustomEvent).detail?.unreadCount;
      if (typeof count === "number") setUnreadCount(count);
      else check();
    }
    window.addEventListener("ratist:notif-update", onNotifUpdate);
    check();
    const interval = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("ratist:notif-update", onNotifUpdate); };
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (readMenuRef.current && !readMenuRef.current.contains(e.target as Node)) {
        setReadMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setReadMenuOpen(false);
    setUserMenuOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/movies", label: "Movies & TV" },
    { href: "/celebrities", label: "Celebrities" },
    { href: "/community", label: "Community" },
    { href: "/tools", label: "Tools" },
  ];

  const isReadActive = READ_LINKS.some((l) => pathname?.startsWith(l.href));

  return (
    <header className="sticky top-0 z-50 bg-[var(--surface)] border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          {/* Logo */}
          <Link href="/" className="shrink-0">
            <Image src="/logo-full.png" alt="The Ratist" width={160} height={80} className="h-12 w-auto" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {/* Read dropdown */}
            <div className="relative" ref={readMenuRef}>
              <button
                onClick={() => setReadMenuOpen(!readMenuOpen)}
                className={`flex items-center gap-1 text-sm transition-colors ${isReadActive ? "text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
              >
                Read <ChevronDown className={`w-3 h-3 transition-transform ${readMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {readMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
                  {READ_LINKS.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <Icon className="w-4 h-4 text-[var(--ratist-red)]" /> {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Search + Auth */}
          <div className="flex items-center gap-3">
            <QuickSearch className="hidden sm:block" />

            {user ? (
              <div className="flex items-center gap-3">
                {/* Notification bell */}
                <Link href="/notifications" className="relative hidden sm:block text-[var(--foreground-muted)] hover:text-white transition-colors">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-[var(--ratist-red)] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>

              <div className="relative hidden sm:block" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  {user.photoURL ? (
                    <Image src={user.photoURL} alt="" width={28} height={28} className="rounded-full w-7 h-7 object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-white text-xs font-bold">
                      {(user.displayName ?? user.email ?? "U")[0].toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
                    <Link href={`/profile/${user.uid}`} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <User className="w-4 h-4" /> My Profile
                    </Link>
                    <Link href="/seen" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <Eye className="w-4 h-4" /> Film Diary
                    </Link>
                    <Link href="/ratings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <Star className="w-4 h-4" /> My Ratings
                    </Link>
                    <Link href="/watchlist" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <Bookmark className="w-4 h-4" /> My Watchlists
                    </Link>
                    <Link href="/tools/rankings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <MessageSquare className="w-4 h-4" /> My Rankings
                    </Link>
                    <Link href="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <Settings className="w-4 h-4" /> Preferences
                    </Link>
                    <Link href="/about" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <BookOpen className="w-4 h-4" /> About The Ratist
                    </Link>
                    <div className="border-t border-[var(--border)]" />
                    <button onClick={() => { signOut(); setUserMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
              </div>
            ) : (
              <Link
                href="/auth/signin"
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white px-4 py-1.5 rounded-full transition-colors"
              >
                Sign In
              </Link>
            )}

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-[var(--foreground-muted)] hover:text-white"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[var(--surface)] border-t border-[var(--border)] px-4 pb-4 max-h-[calc(100vh-64px)] overflow-y-auto">
          <div className="pt-3 pb-2">
            <QuickSearch
              inputClassName="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                {link.label}
              </Link>
            ))}
            <div className="border-t border-[var(--border)] my-1" />
            <p className="py-1 text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium">Read</p>
            {READ_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors pl-2">
                {label}
              </Link>
            ))}
            <div className="border-t border-[var(--border)] my-1" />
            {user ? (
              <>
                <Link href={`/profile/${user.uid}`} onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">My Profile</Link>
                <Link href="/seen" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Film Diary</Link>
                <Link href="/ratings" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">My Ratings</Link>
                <Link href="/watchlist" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">My Watchlists</Link>
                <Link href="/notifications" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors flex items-center gap-2">
                  Notifications{unreadCount > 0 && <span className="bg-[var(--ratist-red)] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </Link>
                <Link href="/settings" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Preferences</Link>
                <Link href="/about" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">About The Ratist</Link>
                <button onClick={() => { signOut(); setMenuOpen(false); }} className="text-left py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Sign Out</button>
              </>
            ) : (
              <>
                <Link href="/about" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">About The Ratist</Link>
                <Link href="/auth/signin" onClick={() => setMenuOpen(false)} className="py-2 text-sm text-[var(--ratist-red)] font-medium">Sign In</Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
