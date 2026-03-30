"use client";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

interface Props { profileFirebaseUid: string; profileUserId: string }

export default function CompareTasteButton({ profileFirebaseUid, profileUserId }: Props) {
  const { user } = useAuth();
  if (user?.uid === profileFirebaseUid) return null;
  return (
    <Link
      href={`/profile/${profileUserId}/compare`}
      className="inline-flex items-center gap-1.5 text-xs bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-[var(--foreground-muted)] hover:text-white px-3 py-1.5 rounded-full transition-colors"
    >
      Compare taste
    </Link>
  );
}
