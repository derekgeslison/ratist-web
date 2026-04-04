"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bell, Check, Shield, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  targetType: string | null;
  targetId: string | null;
  link: string | null;
  actor: { name: string; avatarUrl: string | null; firebaseUid: string } | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminModal, setAdminModal] = useState<NotificationItem | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setLoading(false);
    })();
  }, [user]);

  const router = useRouter();

  async function markAllRead() {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    window.dispatchEvent(new CustomEvent("ratist:notif-update", { detail: { unreadCount: 0 } }));
  }

  async function handleClick(n: NotificationItem) {
    if (!user) return;
    // Admin notifications open in a modal — only dismissed via "Acknowledge"
    if (n.type === "admin") {
      setAdminModal(n);
      return;
    }
    if (!n.read) {
      await markRead(n.id);
    }
    if (n.link) router.push(n.link);
  }

  async function markRead(id: string) {
    if (!user) return;
    const token = await user.getIdToken();
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});
    setNotifications((prev) => prev.map((x) => x.id === id ? { ...x, read: true } : x));
    const newUnread = notifications.filter((x) => !x.read && x.id !== id).length;
    window.dispatchEvent(new CustomEvent("ratist:notif-update", { detail: { unreadCount: newUnread } }));
  }

  async function acknowledgeAdmin() {
    if (!adminModal) return;
    await markRead(adminModal.id);
    setAdminModal(null);
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          {unread > 0 && (
            <span className="bg-[var(--ratist-red)] text-white text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
            <Check className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see notifications.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No notifications yet.</p>
        </div>
      ) : (
        <>
        <div className="divide-y divide-[var(--border)]/20">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex items-start gap-3 py-3 w-full text-left transition-colors rounded-lg px-2 -mx-2 ${
                n.read ? "opacity-60" : "hover:bg-[var(--surface)]"
              } cursor-pointer`}
            >
              {n.type === "admin" ? (
                <div className="w-8 h-8 rounded-full bg-[var(--ratist-red)] flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-white" />
                </div>
              ) : n.actor?.avatarUrl ? (
                <Image src={n.actor.avatarUrl} alt={n.actor.name} width={32} height={32} className="rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--foreground-muted)] shrink-0">
                  {n.actor?.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {n.type === "admin" && <p className="text-xs text-[var(--ratist-red)] font-semibold mb-0.5">Message from admins</p>}
                <p className="text-sm text-white line-clamp-2">{n.message}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-[var(--ratist-red)] shrink-0 mt-2" />}
            </button>
          ))}
        </div>

        {/* Admin message modal */}
        {adminModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[var(--ratist-red)] flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Message from admins</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{timeAgo(adminModal.createdAt)}</p>
                </div>
              </div>
              <p className="text-sm text-white leading-relaxed mb-6 whitespace-pre-wrap">{adminModal.message}</p>
              <button
                onClick={acknowledgeAdmin}
                className="w-full py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Acknowledge
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
