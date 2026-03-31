"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GripVertical, Star, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import ShareButton from "@/components/ShareButton";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface RankedMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  ratistRating: number | null;
  rank: number;
}

const CURRENT_YEAR = new Date().getFullYear();
const PRESET_YEARS = Array.from({ length: CURRENT_YEAR - 2023 + 1 }, (_, i) => String(CURRENT_YEAR - i));

function SortableItem({
  movie,
  index,
  total,
  onMoveTo,
}: {
  movie: RankedMovie;
  index: number;
  total: number;
  onMoveTo: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: movie.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [inputVal, setInputVal] = useState("");

  function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(inputVal, 10);
    if (!isNaN(num) && num >= 1 && num <= total) {
      onMoveTo(index, num - 1);
      setInputVal("");
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 sm:gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--ratist-red)]/50 transition-colors">
      <span className="text-lg sm:text-xl font-bold text-[var(--foreground-muted)] w-7 sm:w-8 text-center shrink-0">{index + 1}</span>

      {/* Up/down arrows (always visible, great for mobile) */}
      <div className="flex flex-col shrink-0">
        <button
          onClick={() => index > 0 && onMoveTo(index, index - 1)}
          disabled={index === 0}
          className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors p-0.5"
          aria-label="Move up"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => index < total - 1 && onMoveTo(index, index + 1)}
          disabled={index === total - 1}
          className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors p-0.5"
          aria-label="Move down"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Drag handle (hidden on small screens since arrows are better for mobile) */}
      <button {...attributes} {...listeners} className="hidden sm:block text-[var(--foreground-muted)] hover:text-white cursor-grab active:cursor-grabbing shrink-0 touch-none">
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
        {movie.posterPath ? (
          <Image src={posterUrl(movie.posterPath, "w92")} alt="" fill sizes="40px" className="object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <Link href={`/movies/${movie.tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{movie.title}</Link>
        <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
      </div>
      {movie.ratistRating != null && (
        <span className="text-sm font-bold text-[var(--ratist-red)] shrink-0">{movie.ratistRating.toFixed(1)}</span>
      )}
      {/* Move to # (hidden on mobile to save space) */}
      <form onSubmit={handleMoveSubmit} className="hidden sm:flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={1}
          max={total}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="#"
          className="w-12 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-[var(--ratist-red)]"
        />
        <button type="submit" className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors px-1">→</button>
      </form>
    </div>
  );
}

export default function RankingsPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<RankedMovie[]>([]);
  const [filter, setFilter] = useState<"all" | string>("all");
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    user.getIdToken().then((token) => {
      fetch(`/api/tools/rankings?filter=${filter}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setMovies(data.movies ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user, filter]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMovies((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function handleMoveTo(fromIndex: number, toIndex: number) {
    setMovies((items) => arrayMove(items, fromIndex, toIndex));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <Star className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Personal Rankings</h1>
        </div>
        {movies.length >= 1 && user && (
          <ShareButton
            label={filter === "all" ? "Share rankings" : `Share ${filter} rankings`}
            text={`Check out my ${filter === "all" ? "all-time" : filter} top movies on The Ratist!\n\nTop picks: ${movies.slice(0, 3).map((m) => m.title).join(", ")}${movies.length > 3 ? "..." : ""}`}
            url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/profile/${user.uid}`}
            cardImageUrl={`/api/og/rankings?userId=${encodeURIComponent(user.uid)}${filter !== "all" ? `&year=${filter}` : ""}`}
          />
        )}
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Drag to reorder, or type a number to move a movie to a specific rank.</p>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see and rank your movies.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filter === "all" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>All Time</button>
            {PRESET_YEARS.map((year) => (
              <button key={year} onClick={() => setFilter(year)} className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filter === year ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>{year}</button>
            ))}
          </div>

          {loading ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">Loading your movies...</p>
          ) : movies.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">No movies found for this filter. <Link href="/movies" className="text-[var(--ratist-red)] hover:underline">Rate or mark movies as seen.</Link></p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={movies.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {movies.map((movie, index) => (
                    <SortableItem
                      key={movie.id}
                      movie={movie}
                      index={index}
                      total={movies.length}
                      onMoveTo={handleMoveTo}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}
