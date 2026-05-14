"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";

interface Spotlight {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  linkLabel: string;
  imageUrl: string | null;
  type: string;
  style: string;
  bgColor: string | null;
}

export default function SpotlightCards({ placement }: { placement: string }) {
  const { user } = useAuth();
  const [spotlights, setSpotlights] = useState<Spotlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pass auth so the server can apply audience + policy-cutoff
        // filtering. Anonymous calls still return "everyone" / "signed_out"
        // spotlights.
        const headers: HeadersInit = {};
        if (user) {
          try {
            const token = await user.getIdToken();
            headers["Authorization"] = `Bearer ${token}`;
          } catch { /* fall through */ }
        }
        const res = await fetch(`/api/admin/spotlights?placement=${placement}`, { headers });
        const data = await res.json();
        if (cancelled) return;
        const items = (data.spotlights ?? []).filter((s: { type: string }) => s.type !== "announcement");
        setSpotlights(items);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [placement, user]);

  if (spotlights.length === 0) return null;

  return (
    <section className="space-y-3">
      {spotlights.map((s) => {
        const accent = s.bgColor || "var(--ratist-red)";
        return (
          <Link
            key={s.id}
            href={s.linkUrl}
            className={`flex items-center gap-4 rounded-xl p-5 transition-colors group border ${s.style === "bold" ? "border-2" : ""}`}
            style={{
              borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
              background:
                s.style === "gradient"
                  ? `linear-gradient(to right, color-mix(in srgb, ${accent} 15%, transparent), transparent)`
                  : s.style === "bold"
                    ? `color-mix(in srgb, ${accent} 8%, transparent)`
                    : `linear-gradient(to right, color-mix(in srgb, ${accent} 10%, transparent), transparent)`,
            }}
          >
            {s.imageUrl && (
              <Image src={s.imageUrl} alt="" width={80} height={80} className="w-20 h-20 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: accent }}>
                {s.type === "blog" ? "New Post" : s.type === "punch_and_judy" ? "Two Thumbs" : s.type === "feature" ? "New Feature" : "Spotlight"}
              </p>
              <p className="text-base font-bold text-white transition-colors">{s.title}</p>
              {s.description && <p className="text-sm text-[var(--foreground-muted)] mt-1 line-clamp-2">{s.description}</p>}
            </div>
            <span className="text-sm font-semibold shrink-0 hidden sm:block" style={{ color: accent }}>
              {s.linkLabel} &rarr;
            </span>
          </Link>
        );
      })}
    </section>
  );
}
