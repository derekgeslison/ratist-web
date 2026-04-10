"use client";

import Link from "next/link";
import Image from "next/image";

interface PersonItem {
  tmdbId: number;
  name: string;
  profilePath: string | null;
}

export default function LinkedPeopleRow({ people }: { people: PersonItem[] }) {
  if (people.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {people.map((p) => (
        <Link
          key={p.tmdbId}
          href={`/celebrities/${p.tmdbId}`}
          className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1 hover:border-[var(--ratist-red)] transition-colors"
        >
          {p.profilePath ? (
            <div className="relative w-5 h-5 rounded-full overflow-hidden shrink-0">
              <Image
                src={`https://image.tmdb.org/t/p/w45${p.profilePath}`}
                alt={p.name}
                fill
                sizes="20px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[8px] font-bold text-white shrink-0">
              {p.name[0]}
            </div>
          )}
          <span className="text-xs text-white">{p.name}</span>
        </Link>
      ))}
    </div>
  );
}
