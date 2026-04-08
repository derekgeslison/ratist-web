"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ticket, Check } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/context/AuthContext";
import type { LucideIcon } from "lucide-react";

export interface FeatureHighlight {
  title: string;
  description: string;
}

interface Props {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconColor?: string;
  highlights: FeatureHighlight[];
  /** Placeholder images — replace with real screenshots/gifs later */
  images?: { src: string; alt: string }[];
  /** Extra requirement text (e.g. "Requires 250+ Ratist reviews") */
  extraRequirement?: string;
  children?: React.ReactNode;
}

export default function FeatureShowcase({ title, subtitle, icon: Icon, iconColor = "text-[var(--ratist-red)]", highlights, images, extraRequirement, children }: Props) {
  const { user } = useAuth();
  const { hasPass } = useSubscription();
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-amber-400 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 mb-4">
          <Icon className={`w-8 h-8 ${iconColor}`} />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        <p className="text-lg text-[var(--foreground-muted)] max-w-xl mx-auto">{subtitle}</p>
        {extraRequirement && (
          <p className="text-sm text-amber-400 mt-2">{extraRequirement}</p>
        )}
      </div>

      {/* Screenshot/GIF gallery */}
      {images && images.length > 0 && (
        <div className="mb-10">
          <div className={`grid ${images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-4`}>
            {images.map((img, i) => (
              <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
                <Image src={img.src} alt={img.alt} fill className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder for screenshots */}
      {(!images || images.length === 0) && (
        <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="aspect-video rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
            <p className="text-sm text-[var(--foreground-muted)]">Screenshot placeholder</p>
          </div>
          <div className="aspect-video rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
            <p className="text-sm text-[var(--foreground-muted)]">Screenshot placeholder</p>
          </div>
        </div>
      )}

      {/* Highlights */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">What you get</h2>
        <div className="space-y-3">
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <Check className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">{h.title}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{h.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Additional content from page */}
      {children}

      {/* CTA */}
      <div className="bg-[var(--surface)] border border-amber-400/30 rounded-2xl p-8 text-center">
        {hasPass ? (
          <>
            <p className="text-lg font-semibold text-amber-400 mb-2">You have the Backstage Pass!</p>
            <p className="text-sm text-[var(--foreground-muted)]">This feature is available to you.</p>
          </>
        ) : (
          <>
            <Ticket className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white mb-2">Unlock with the Backstage Pass</h2>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">Get access to {title} and all other premium features.</p>
            {user ? (
              <Link href="/backstage-pass" className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors">
                <Ticket className="w-4 h-4" /> Get the Backstage Pass — from $3.99/month
              </Link>
            ) : (
              <Link href="/auth/signin" className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors">
                Sign in to subscribe
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
