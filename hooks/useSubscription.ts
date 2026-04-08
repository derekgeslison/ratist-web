"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [hasPass, setHasPass] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Don't resolve until auth has finished loading
    if (authLoading) return;

    if (!user) { setHasPass(false); setLoading(false); return; }

    setLoading(true);
    user.getIdToken().then((token) =>
      fetch("/api/subscription/status", { headers: { Authorization: `Bearer ${token}` } })
    )
      .then((r) => r.json())
      .then((d) => setHasPass(d.hasBackstagePass ?? false))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  return { hasPass, loading };
}
