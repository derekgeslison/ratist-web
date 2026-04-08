"use client";

import { Ticket } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

/** Shows the gold "BACKSTAGE PASS" badge only for non-subscribers */
export default function BackstagePassBadge() {
  const { hasPass, loading } = useSubscription();
  if (loading || hasPass) return null;
  return (
    <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
      <Ticket className="w-2.5 h-2.5" /> BACKSTAGE PASS
    </span>
  );
}
