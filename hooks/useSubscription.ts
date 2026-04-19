"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [hasPass, setHasPass] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Don't resolve until auth has finished loading
    if (authLoading) return;

    if (!user) { setHasPass(false); setStatus(null); setExpiry(null); setLoading(false); return; }

    setLoading(true);
    user.getIdToken().then((token) =>
      fetch("/api/subscription/status", { headers: { Authorization: `Bearer ${token}` } })
    )
      .then((r) => r.json())
      .then((d) => {
        setHasPass(d.hasBackstagePass ?? false);
        setStatus(d.status ?? null);
        setExpiry(d.expiry ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  return { hasPass, status, expiry, loading };
}
