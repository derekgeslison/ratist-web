"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, TrendingUp, ArrowUp } from "lucide-react";

type SortOption = "newest" | "oldest" | "popular";

const OPTIONS: { value: SortOption; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: "newest", label: "Newest", Icon: Clock },
  { value: "oldest", label: "Oldest", Icon: ArrowUp },
  { value: "popular", label: "Popular", Icon: TrendingUp },
];

export default function PostSortBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get("sort") ?? "newest") as SortOption;

  function setSort(sort: SortOption) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 mb-6">
      <span className="text-xs text-[var(--foreground-muted)]">Sort:</span>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => setSort(value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            current === value
              ? "bg-[var(--ratist-red)]/20 text-white border border-[var(--ratist-red)]/50"
              : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <Icon className="w-3 h-3" /> {label}
        </button>
      ))}
    </div>
  );
}
