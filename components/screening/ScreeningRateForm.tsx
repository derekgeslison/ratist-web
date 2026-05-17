"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { scoreColor } from "@/lib/score-color";
import TextareaWithEmoji from "@/components/TextareaWithEmoji";

type ReviewMode = "basic" | "standard";

const CRITERIA = {
  "Story": {
    fields: [
      { key: "plot", label: "Plot", required: true },
      { key: "premiseOriginality", label: "Premise / Originality" },
      { key: "storytelling", label: "Story-telling", required: true },
      { key: "characterDev", label: "Character Development" },
      { key: "pacingClimax", label: "Pacing / Climax", required: true },
    ],
  },
  "Production & Style": {
    fields: [
      { key: "cinematography", label: "Cinematography", required: true },
      { key: "locationCost", label: "Location & Costuming" },
      { key: "realism", label: "Realism / Believability" },
      { key: "artisticEffect", label: "Artistic Effect", required: true },
      { key: "visualEffects", label: "Visual Effects" },
      { key: "musicSound", label: "Music & Sound" },
    ],
  },
  "Emotive Effect": {
    fields: [
      { key: "overallEmotion", label: "Overall Emotion", required: true },
      { key: "relatability", label: "Relatability", required: true },
      { key: "meaning", label: "Meaning / Message", required: true },
      { key: "movingness", label: "Movingness" },
    ],
  },
  "Acting & Casting": {
    fields: [
      { key: "casting", label: "Casting & Subjects", required: true },
      { key: "actingQuality", label: "Performance Quality", required: true },
      { key: "dialogueScripting", label: "Dialogue & Writing" },
    ],
  },
  "Pure Entertainment": {
    fields: [
      { key: "appeal", label: "Appeal", required: true },
      { key: "choreography", label: "Choreography" },
    ],
  },
};

interface Props {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
  submitted: boolean;
  initialData?: Record<string, unknown>;
}

export default function ScreeningRateForm({ onSubmit, submitting, submitted, initialData }: Props) {
  const [mode, setMode] = useState<ReviewMode>((initialData?.reviewType as ReviewMode) ?? "standard");
  const [values, setValues] = useState<Record<string, number | null>>(() => {
    if (!initialData) return {};
    const loaded: Record<string, number | null> = {};
    for (const cat of Object.values(CRITERIA)) {
      for (const field of cat.fields) {
        if (initialData[field.key] != null) loaded[field.key] = Number(initialData[field.key]);
      }
    }
    return loaded;
  });
  const [overallRating, setOverallRating] = useState<number | null>(initialData?.overallRating != null ? Number(initialData.overallRating) : null);
  const [reviewText, setReviewText] = useState(String(initialData?.reviewText ?? ""));
  const [editing, setEditing] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(CRITERIA).map((k) => [k, true]))
  );
  // Mirror the official /rate page's "Required fields only" toggle —
  // makes the standard-form path materially shorter for users who just
  // want to fill the asterisked fields and ship.
  const [requiredOnly, setRequiredOnly] = useState(false);

  function setField(key: string, val: number | null) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function toggleSection(name: string) {
    setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  async function handleSubmit() {
    if (mode === "basic" && overallRating == null) return;
    await onSubmit({
      reviewType: mode,
      overallRating,
      reviewText: reviewText || null,
      ...values,
    });
    setEditing(false);
  }

  if (submitted && !editing) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
        <p className="text-green-400 font-semibold mb-1">Rating Submitted!</p>
        <p className="text-xs text-[var(--foreground-muted)] mb-3">Waiting for others to finish...</p>
        <button onClick={() => setEditing(true)} className="text-xs text-[var(--ratist-red)] hover:underline">
          Edit my rating
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setMode("basic")}
          className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-colors ${mode === "basic" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"}`}>
          Quick
        </button>
        <button onClick={() => setMode("standard")}
          className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-colors ${mode === "standard" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"}`}>
          Ratist
        </button>
      </div>

      {/* Overall rating (both modes) */}
      <div className="bg-[var(--surface-2)] rounded-lg p-4">
        <label className="text-xs text-[var(--foreground-muted)] mb-2 block">Overall Rating *</label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={10} step={0.5} value={overallRating ?? 5}
            onChange={(e) => setOverallRating(parseFloat(e.target.value))}
            onPointerDown={() => { if (overallRating == null) setOverallRating(5); }}
            className={`flex-1 ${overallRating != null ? "accent-[var(--ratist-red)]" : "accent-gray-500"}`} />
          <span className="text-lg font-bold min-w-[40px] text-center" style={{ color: overallRating ? scoreColor(overallRating) : "white" }}>
            {overallRating?.toFixed(1) ?? "—"}
          </span>
          {overallRating != null && (
            <button type="button" onClick={() => setOverallRating(null)} className="text-[var(--foreground-muted)] hover:text-red-400 text-xs" title="Clear">✕</button>
          )}
        </div>
      </div>

      {/* Standard mode: required-only toggle + category fields */}
      {mode === "standard" && (
        <>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setRequiredOnly((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${requiredOnly ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${requiredOnly ? "left-4" : "left-0.5"}`} />
            </button>
            <span className="text-xs text-[var(--foreground-muted)]" onClick={() => setRequiredOnly((v) => !v)}>
              Required fields only
            </span>
          </label>
        <div className="space-y-3">
          {Object.entries(CRITERIA).map(([catName, cat]) => (
            <div key={catName} className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
              <button onClick={() => toggleSection(catName)}
                className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-xs font-semibold text-white">{catName}</span>
                {openSections[catName] ? <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />}
              </button>
              {openSections[catName] && (
                <div className="px-4 pb-3 space-y-3">
                  {cat.fields.filter((f) => !requiredOnly || f.required).map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] text-[var(--foreground-muted)] mb-1 block">
                        {f.label} {f.required && <span className="text-[var(--ratist-red)]">*</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="range" min={1} max={10} step={0.5} value={values[f.key] ?? 5}
                          onChange={(e) => setField(f.key, parseFloat(e.target.value))}
                          // Register a value on plain click — without
                          // this, a user who taps the slider track but
                          // doesn't drag past the visual midpoint ends
                          // up with no value persisted, then sees the
                          // field "drop" when they carry their movie-
                          // club / screening-room rating to the
                          // official review.
                          onPointerDown={() => { if (values[f.key] == null) setField(f.key, 5); }}
                          className={`flex-1 ${values[f.key] != null ? "accent-[var(--ratist-red)]" : "accent-gray-500"}`} />
                        <span className="text-xs font-bold min-w-[30px] text-center" style={{ color: values[f.key] ? scoreColor(values[f.key]!) : "#666" }}>
                          {values[f.key]?.toFixed(1) ?? "—"}
                        </span>
                        {values[f.key] != null && (
                          <button type="button" onClick={() => setField(f.key, null)} className="text-[var(--foreground-muted)] hover:text-red-400 text-xs" title="Clear">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* Review text */}
      <TextareaWithEmoji
        value={reviewText} onChange={(e) => setReviewText(e.target.value)}
        placeholder="Any thoughts? (optional)"
        rows={2}
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
      />

      {/* Submit */}
      <button onClick={handleSubmit} disabled={submitting || (mode === "basic" && overallRating == null)}
        className="w-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">
        {submitting ? "Submitting..." : "Submit Rating"}
      </button>
      <p className="text-[10px] text-[var(--foreground-muted)] text-center">This rating stays in the screening room and won&apos;t be posted as your official review.</p>
    </div>
  );
}
