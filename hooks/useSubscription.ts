"use client";

import { useAuth } from "@/context/AuthContext";

/**
 * Read-only view onto the subscription state cached in AuthContext.
 * Previously each consumer issued its own /api/subscription/status
 * fetch on mount; now there's exactly one fetch per session (driven
 * by AuthContext) and everything else reads from context.
 */
export function useSubscription() {
  const { subscription } = useAuth();
  return subscription;
}
