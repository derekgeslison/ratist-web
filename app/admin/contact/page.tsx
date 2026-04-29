"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { Mail, ChevronDown, Megaphone, Newspaper, Handshake, Shield, MessageCircle, HelpCircle } from "lucide-react";

interface ContactItem {
  id: string;
  category: string;
  name: string;
  email: string;
  company: string | null;
  subject: string | null;
  message: string;
  status: string;
  adminNotes: string | null;
  handledAt: string | null;
  handler: { name: string; firebaseUid: string } | null;
  createdAt: string;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  general:      { label: "General",      icon: MessageCircle, color: "text-blue-400" },
  advertising:  { label: "Advertising",  icon: Megaphone,     color: "text-amber-400" },
  press:        { label: "Press",        icon: Newspaper,     color: "text-purple-400" },
  partnerships: { label: "Partnerships", icon: Handshake,     color: "text-emerald-400" },
  dmca:         { label: "DMCA / Legal", icon: Shield,        color: "text-red-400" },
  other:        { label: "Other",        icon: HelpCircle,    color: "text-[var(--foreground-muted)]" },
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
};

export default function AdminContactPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "advertising" | "press" | "dmca">("open");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesStatus, setNotesStatus] = useState("in_progress");

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/admin/contact", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setItems(data.items ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  async function saveNotes(id: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/contact", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes: notesText, status: notesStatus }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setItems((prev) => prev.map((i) => i.id === id ? data.item : i));
      setNotesId(null);
      setNotesText("");
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/contact", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setItems((prev) => prev.map((i) => i.id === id ? data.item : i));
    }
  }

  const filtered = items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "open") return i.status === "open" || i.status === "in_progress";
    return i.category === filter;
  });

  const openCount = items.filter((i) => i.status === "open" || i.status === "in_progress").length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Mail className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Contact Inquiries</h1>
        <span className="text-sm text-[var(--foreground-muted)]">({openCount} open)</span>
      </div>
      <p className="text-sm text-[var(--foreground-muted)] mb-5">
        Submissions from the public <Link href="/contact" className="text-[var(--ratist-red)] hover:underline">/contact</Link> page. Reply to inquirers via your own email client at the address listed on each item.
      </p>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5 text-xs">
        {([
          ["open", `Open (${openCount})`],
          ["all", "All"],
          ["advertising", "Advertising"],
          ["press", "Press"],
          ["dmca", "DMCA / Legal"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full border transition-colors ${
              filter === key
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] py-10 text-center">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--foreground-muted)] py-10 text-center">
          {filter === "open" ? "No open inquiries." : "No matching inquiries."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other;
            const Icon = meta.icon;
            return (
              <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? STATUS_COLORS.open}`}>
                      {item.status.replace("_", " ")}
                    </span>
                    <span className={`flex items-center gap-1 text-xs ${meta.color} bg-[var(--surface-2)] px-2 py-0.5 rounded-full`}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                    <span className="text-xs text-[var(--foreground-muted)]">
                      {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <div className="relative shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      className="appearance-none bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white cursor-pointer pr-6"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground-muted)] pointer-events-none" />
                  </div>
                </div>

                {/* Sender */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                  <span className="text-sm font-semibold text-white">{item.name}</span>
                  <a href={`mailto:${item.email}`} className="text-xs text-[var(--ratist-red)] hover:underline">
                    {item.email}
                  </a>
                  {item.company && (
                    <span className="text-xs text-[var(--foreground-muted)]">· {item.company}</span>
                  )}
                </div>

                {item.subject && (
                  <p className="text-sm font-medium text-white/90 mb-2">{item.subject}</p>
                )}

                <p className="text-sm text-white/90 whitespace-pre-wrap mb-3">{item.message}</p>

                {item.adminNotes && (
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 mb-2">
                    <p className="text-[10px] text-[var(--foreground-muted)] mb-1">
                      Internal notes
                      {item.handler ? ` · ${item.handler.name}` : ""}
                      {item.handledAt ? ` · ${new Date(item.handledAt).toLocaleDateString()}` : ""}
                    </p>
                    <p className="text-sm text-white/90 whitespace-pre-wrap">{item.adminNotes}</p>
                  </div>
                )}

                {notesId === item.id ? (
                  <div className="mt-2">
                    <textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Internal notes — not sent to the inquirer..."
                      rows={3}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-2"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <select value={notesStatus} onChange={(e) => setNotesStatus(e.target.value)} className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white">
                        <option value="in_progress">Mark In Progress</option>
                        <option value="resolved">Mark Resolved</option>
                        <option value="closed">Close</option>
                      </select>
                      <button onClick={() => setNotesId(null)} className="text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                      <button onClick={() => saveNotes(item.id)} disabled={!notesText.trim()} className="text-xs bg-[var(--ratist-red)] text-white px-3 py-1 rounded-full disabled:opacity-40">Save Note</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setNotesId(item.id); setNotesText(item.adminNotes ?? ""); setNotesStatus(item.status === "open" ? "in_progress" : item.status); }} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                      {item.adminNotes ? "Edit Notes" : "Add Notes"}
                    </button>
                    <a
                      href={`mailto:${item.email}?subject=${encodeURIComponent(`Re: ${item.subject || meta.label + " inquiry"}`)}`}
                      className="text-xs text-[var(--ratist-red)] hover:underline"
                    >
                      Reply by Email →
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
