"use client";

import { useEffect } from "react";
import { useSubscription } from "@/hooks/useSubscription";

interface Props {
  /** Numeric placement ID from your Ezoic dashboard (after they assign
   *  it). Each ID corresponds to a configured placement on Ezoic's side
   *  — they manage which ad format/size shows in each slot. */
  id: number;
  /** Optional wrapper class for layout-positioning the ad. The
   *  placeholder div itself must NOT be styled (Ezoic's docs are
   *  explicit about this — see implementation/) so the wrapper carries
   *  any margin / sizing / alignment instead. */
  className?: string;
}

/**
 * One Ezoic ad placement. Renders the placeholder div Ezoic looks for
 * and queues a showAds(id) call against the standalone SDK's cmd queue
 * — safe to call before the script has finished loading; Ezoic drains
 * the queue when ready.
 *
 * No-op cases:
 *   - NEXT_PUBLIC_EZOIC_ENABLED isn't "1" (matches EzoicScripts gate)
 *   - The viewer has an active Backstage Pass (ad-free benefit)
 *
 * Cleanup on unmount: we don't call destroyPlaceholders(id) here.
 * EzoicRouteHandler in app/layout.tsx destroys ALL placeholders on
 * route change, which covers the dominant case (per-page ad slots
 * going away on nav). Per-component cleanup would race with the
 * route handler's destroy + reshow cycle.
 */
export default function EzoicAdSlot({ id, className = "" }: Props) {
  const { hasPass } = useSubscription();
  const enabled = process.env.NEXT_PUBLIC_EZOIC_ENABLED === "1";

  useEffect(() => {
    if (!enabled || hasPass) return;
    if (typeof window === "undefined") return;
    // Queue the showAds call — the cmd queue is initialized in
    // EzoicScripts before the standalone SDK loads, so this push is
    // always safe even on a freshly-mounted page.
    try {
      window.ezstandalone?.cmd.push(() => {
        window.ezstandalone?.showAds(id);
      });
    } catch { /* SDK gate failed — silently skip */ }
  }, [id, enabled, hasPass]);

  if (!enabled || hasPass) return null;

  return (
    <div className={className}>
      <div id={`ezoic-pub-ad-placeholder-${id}`} />
    </div>
  );
}
