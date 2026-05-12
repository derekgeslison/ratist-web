"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { BoxOfficeMetric } from "@/lib/box-office";

// Segmented toggle that switches every Profit / ROI column on the
// hosting page between the estimated studio-side P&L formula and the
// naive revenue − budget math. State lives in the URL (?metric=gross)
// so the choice is shareable, survives back-nav, and forces a fresh
// fetch on pages whose SQL sort depends on the metric.
//
// Default is the estimated view (no param). `gross` is explicit.

interface Props {
  metric: BoxOfficeMetric;
}

export default function MetricToggle({ metric }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const setMetric = useCallback(
    (next: BoxOfficeMetric) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "est") params.delete("metric");
      else params.set("metric", "gross");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, searchParams, pathname],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Profit / ROI calculation"
      className="inline-flex items-center gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5"
    >
      <button
        role="radio"
        aria-checked={metric === "est"}
        onClick={() => setMetric("est")}
        className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${metric === "est" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
      >
        Estimated
      </button>
      <button
        role="radio"
        aria-checked={metric === "gross"}
        onClick={() => setMetric("gross")}
        className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${metric === "gross" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
      >
        Gross
      </button>
    </div>
  );
}

/** Read a `metric` URL param value (or fallback to "est"). Server-side
 *  helper so server components can resolve the active metric from
 *  searchParams before doing data fetches. */
export function parseMetric(raw: string | string[] | undefined): BoxOfficeMetric {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "gross" ? "gross" : "est";
}
