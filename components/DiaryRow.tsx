"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { Calendar, RotateCcw, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";

interface Props {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  ratistRating: number | null;
  voteAverage?: number | null;
  dayNumber: number | null;
  editable?: boolean;
  dateValue?: string;
  onDateChange?: (date: string | null) => void;
  isRewatch?: boolean;
  notes?: string | null;
  logId?: string | null;
  onDeleteRewatch?: (logId: string) => void;
  onEditNotes?: (logId: string, notes: string) => void;
}

export default function DiaryRow({
  tmdbId, title, posterPath, year, ratistRating, voteAverage,
  dayNumber, editable, dateValue, onDateChange, isRewatch, notes,
  logId, onDeleteRewatch, onEditNotes,
}: Props) {
  const [editingDate, setEditingDate] = useState(false);
  const [pendingDate, setPendingDate] = useState(dateValue ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--border)]/10 last:border-0">
      {/* Day number */}
      <div className="w-8 shrink-0 text-center">
        {dayNumber != null && (
          <span className="text-xl font-bold text-white">{dayNumber}</span>
        )}
      </div>

      {/* Poster */}
      <Link href={`/movies/${tmdbId}`} className="relative w-9 h-[54px] shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
        {posterPath && (
          <Image src={posterUrl(posterPath, "w92")} alt={title} fill sizes="36px" className="object-cover" />
        )}
      </Link>

      {/* Title + year + rewatch indicator + notes */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Link href={`/movies/${tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
            {title}
          </Link>
          {isRewatch && (
            <span title="Rewatch"><RotateCcw className="w-3 h-3 text-[var(--foreground-muted)] shrink-0" /></span>
          )}
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">{year}</p>
        {/* Notes display/edit */}
        {editingNotes && logId ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              autoFocus
              className="flex-1 bg-[var(--surface)] border border-[var(--ratist-red)] text-white text-xs rounded px-2 py-1 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") { onEditNotes?.(logId, notesValue); setEditingNotes(false); }
                if (e.key === "Escape") setEditingNotes(false);
              }}
              onBlur={() => { onEditNotes?.(logId, notesValue); setEditingNotes(false); }}
            />
          </div>
        ) : notes ? (
          <button onClick={() => logId && setEditingNotes(true)} className="text-xs text-[var(--foreground-muted)]/70 italic line-clamp-1 mt-0.5 pr-1 text-left hover:text-white transition-colors">
            {notes}
          </button>
        ) : isRewatch && logId && onEditNotes ? (
          <button onClick={() => setEditingNotes(true)} className="text-[10px] text-[var(--foreground-muted)]/50 hover:text-[var(--foreground-muted)] transition-colors mt-0.5">
            + add note
          </button>
        ) : null}
      </div>

      {/* Ratings */}
      <div className="flex items-center gap-2 shrink-0">
        {voteAverage != null && voteAverage > 0 && (
          <RatingBadge type="community" score={voteAverage} size="sm" />
        )}
        {ratistRating != null ? (
          <RatingBadge type="ratist" score={ratistRating} size="sm" />
        ) : (
          <Link
            href={`/movies/${tmdbId}/rate`}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
          >
            Rate
          </Link>
        )}
      </div>

      {/* Actions: edit date / delete rewatch */}
      {editable && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Date edit */}
          {onDateChange && (
            editingDate ? (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={pendingDate}
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value;
                    setPendingDate(val);
                    // Debounce save — arrow clicks fire rapidly, actual date
                    // selection is the last change in a sequence
                    if (saveTimer.current) clearTimeout(saveTimer.current);
                    if (val) {
                      saveTimer.current = setTimeout(() => {
                        if (val !== (dateValue ?? "")) {
                          onDateChange(val);
                          setEditingDate(false);
                        }
                      }, 600);
                    }
                  }}
                  onBlur={() => {
                    // Also save on blur as fallback
                    if (saveTimer.current) clearTimeout(saveTimer.current);
                    if (pendingDate !== (dateValue ?? "")) {
                      onDateChange(pendingDate || null);
                    }
                    setEditingDate(false);
                  }}
                  className="w-28 bg-[var(--surface)] border border-[var(--ratist-red)] text-white text-xs rounded px-1 py-0.5 focus:outline-none [color-scheme:dark]"
                />
                {/* Remove date button — onMouseDown prevents input blur from hiding it */}
                {(dateValue || pendingDate) && (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); onDateChange(null); setPendingDate(""); setEditingDate(false); }}
                    className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                    title="Remove date"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setPendingDate(dateValue ?? ""); setEditingDate(true); }}
                className="p-1 text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
                title="Edit watched date"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
            )
          )}
          {/* Delete rewatch */}
          {isRewatch && logId && onDeleteRewatch && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onDeleteRewatch(logId); setConfirmDelete(false); }}
                  className="text-[10px] text-red-400 hover:text-red-300 font-semibold transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[10px] text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1 text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                title="Remove rewatch entry"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
