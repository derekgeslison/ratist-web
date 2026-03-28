"use client";

import { useRouter, useSearchParams } from "next/navigation";

const DEPARTMENTS = ["Acting", "Directing", "Writing", "Production", "Sound", "Camera"];

export default function CelebritiesFilter({ currentDept }: { currentDept?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setDept(dept: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (dept) {
      params.set("dept", dept);
    } else {
      params.delete("dept");
    }
    params.delete("page");
    router.push(`/celebrities?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      <button
        onClick={() => setDept(null)}
        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${!currentDept ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
      >
        All
      </button>
      {DEPARTMENTS.map((d) => (
        <button
          key={d}
          onClick={() => setDept(d)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${currentDept === d ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
