"use client";

import { useEffect, useRef } from "react";

interface Props {
  slot: string;
  format?: "auto" | "rectangle" | "leaderboard";
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;

/**
 * Google AdSense unit.
 * Renders nothing if NEXT_PUBLIC_ADSENSE_PUBLISHER_ID is not configured.
 * The publisher ID and slot IDs must be set in environment variables.
 */
export default function AdUnit({ slot, format = "auto", className = "" }: Props) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!PUBLISHER_ID || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded yet
    }
  }, []);

  if (!PUBLISHER_ID) return null;

  const style: React.CSSProperties =
    format === "rectangle"
      ? { display: "inline-block", width: "300px", height: "250px" }
      : format === "leaderboard"
      ? { display: "inline-block", width: "728px", height: "90px" }
      : { display: "block" };

  return (
    <div className={`flex justify-center ${className}`}>
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={slot}
        data-ad-format={format === "auto" ? "auto" : undefined}
        data-full-width-responsive={format === "auto" ? "true" : undefined}
      />
    </div>
  );
}
