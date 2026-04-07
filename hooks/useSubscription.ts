"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export function useSubscription() {
  const { user } = useAuth();
  const [hasPass, setHasPass] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setHasPass(false); setLoading(false); return; }
    user.getIdToken().then((token) =>
      fetch("/api/subscription/status", { headers: { Authorization: `Bearer ${token}` } })
    )
      .then((r) => r.json())
      .then((d) => setHasPass(d.hasBackstagePass ?? false))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  return { hasPass, loading };
}
