"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// /profile/me — used by the Android widget Quick Links "Profile" tile.
// The widget can't know the user's Firebase UID, so it deep-links here
// and we forward to /profile/<uid>. Signed-out users get bumped to
// sign-in with a redirect back to their profile.
export default function ProfileMeRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace(`/profile/${user.uid}`);
    } else {
      router.replace("/auth/signin?redirect=/profile/me");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-[var(--foreground-muted)] text-sm">
      Loading profile…
    </div>
  );
}
