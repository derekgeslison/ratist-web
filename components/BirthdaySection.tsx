"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Cake } from "lucide-react";

interface BirthdayPerson {
  id: number;
  name: string;
  profilePath: string | null;
  department: string;
  age: number | null;
}

export default function BirthdaySection() {
  const [people, setPeople] = useState<BirthdayPerson[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/tmdb/birthdays")
      .then((r) => r.json())
      .then((data) => setPeople(data.birthdays ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || people.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Cake className="w-5 h-5 text-[var(--ratist-red)]" />
        <h2 className="text-lg font-semibold text-white">Born Today</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {people.map((person) => (
          <Link
            key={person.id}
            href={`/celebrities/${person.id}`}
            className="flex-shrink-0 w-24 text-center group"
          >
            <div className="relative w-20 h-20 mx-auto rounded-full overflow-hidden bg-[var(--surface-2)] mb-2 border-2 border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
              {person.profilePath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w185${person.profilePath}`}
                  alt={person.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-bold text-[var(--foreground-muted)]">
                  {person.name[0]}
                </div>
              )}
            </div>
            <p className="text-xs font-medium text-white line-clamp-1">{person.name}</p>
            {person.age != null && (
              <p className="text-[10px] text-[var(--foreground-muted)]">Turns {person.age}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
