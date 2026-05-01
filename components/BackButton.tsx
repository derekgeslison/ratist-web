"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface Props {
  fallback: string;
  label: string;
  className?: string;
}

// Tries router.back() when there's same-origin history; falls back to
// the static link otherwise (fresh tab, direct URL hit, navigated in
// from off-site). The Link is the accessible semantic anchor — onClick
// only intervenes when we're confident a back step won't bounce off-site.
export default function BackButton({ fallback, label, className }: Props) {
  const router = useRouter();
  const defaultClass = "inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors";

  function handleClick(e: React.MouseEvent) {
    if (typeof window === "undefined") return;
    const ref = document.referrer;
    if (!ref) return; // first navigation — let the Link handle it
    try {
      if (new URL(ref).origin === window.location.origin) {
        e.preventDefault();
        router.back();
      }
    } catch { /* malformed referrer — fall through to Link */ }
  }

  return (
    <Link href={fallback} onClick={handleClick} className={className ?? defaultClass}>
      <ArrowLeft className="w-4 h-4" /> {label}
    </Link>
  );
}
