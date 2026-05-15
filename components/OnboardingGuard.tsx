"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const ALLOWED_PATHS = ["/onboarding", "/auth", "/terms", "/privacy", "/about", "/profile/import"];

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, needsOnboarding, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !needsOnboarding) return;
    // Allow onboarding page itself and auth/terms pages
    if (ALLOWED_PATHS.some((p) => pathname.startsWith(p))) return;
    router.replace("/onboarding");
  }, [user, needsOnboarding, loading, pathname, router]);

  return <>{children}</>;
}
