import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { type TMDBShow } from "@/lib/tmdb";
import ShowCard from "./ShowCard";

interface Props {
  title: string;
  shows: TMDBShow[];
  viewAllHref?: string;
}

export default function ShowRow({ title, shows, viewAllHref }: Props) {
  if (!shows.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
          >
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-2" style={{ minWidth: "max-content" }}>
          {shows.map((show) => (
            <div key={show.id} className="w-[140px] shrink-0">
              <ShowCard show={show} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
