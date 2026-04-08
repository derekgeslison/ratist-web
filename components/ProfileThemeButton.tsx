"use client";

import { useState } from "react";
import Link from "next/link";
import { Palette, Ticket } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import ProfileThemeModal from "./ProfileThemeModal";
import type { ProfileTheme } from "@/lib/themes";

interface Props {
  profileFirebaseUid: string;
  currentTheme: ProfileTheme | null;
}

export default function ProfileThemeButton({ profileFirebaseUid, currentTheme }: Props) {
  const { user } = useAuth();
  const { hasPass, loading } = useSubscription();
  const [modalOpen, setModalOpen] = useState(false);

  // Only show on own profile
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;
  if (!isOwnProfile || loading) return null;

  if (!hasPass) {
    return (
      <Link
        href="/backstage-pass/custom-themes"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 rounded-lg text-xs font-semibold text-amber-400 hover:bg-amber-400/20 transition-colors"
      >
        <Ticket className="w-3.5 h-3.5" /> Customize Theme
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:border-[var(--ratist-red)] transition-colors"
      >
        <Palette className="w-3.5 h-3.5" /> Edit Theme
      </button>
      {modalOpen && (
        <ProfileThemeModal
          currentTheme={currentTheme}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
