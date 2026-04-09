"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function BadgesRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace(`/profile/${user.uid}/badges`);
    } else {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-sm text-[var(--foreground-muted)]">Loading badges...</div>
    </div>
  );
}
