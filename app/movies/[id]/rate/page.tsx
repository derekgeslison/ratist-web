"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

const CRITERIA = {
  "Story": {
    weight: 5,
    fields: [
      { key: "plot", label: "Plot", required: true, desc: "Was the movie coherent? Were complexities executed well?" },
      { key: "premiseOriginality", label: "Premise / Originality", required: false, desc: "Was the premise well understood? Did the movie stand out?" },
      { key: "storytelling", label: "Story-telling", required: true, desc: "Did the movie flow well? Was the story in and of itself interesting?" },
      { key: "characterDev", label: "Character Development", required: false, desc: "Do you know enough about the main characters? Their motivations, fears, desires?" },
      { key: "pacingClimax", label: "Pacing / Climax", required: true, desc: "Was there a continuous rise in excitement? Was the movie well paced?" },
    ],
  },
  "Production & Style": {
    weight: 3,
    fields: [
      { key: "cinematography", label: "Cinematography", required: true, desc: "Was the movie visually pleasing? Were there creative or beautiful shots?" },
      { key: "locationCost", label: "Location & Costuming", required: false, desc: "Did the location and costumes match the content and characters?" },
      { key: "realism", label: "Realism / Believability", required: false, desc: "Did the plot and characters seem feasible within the film's world?" },
      { key: "artisticEffect", label: "Artistic Effect", required: true, desc: "How artistic was the movie? Did it force you to think and interpret?" },
      { key: "visualEffects", label: "Visual Effects", required: false, desc: "(If applicable) Were the VFX high quality? Did they add or detract?" },
      { key: "musicSound", label: "Music & Sound Effects", required: false, desc: "Did the music add to the experience? Were sound effects accurate and good quality?" },
    ],
  },
  "Emotive Effect": {
    weight: 3,
    fields: [
      { key: "overallEmotion", label: "Overall Emotion", required: true, desc: "Did the movie create excitement, intrigue, or any strong emotion? How intense?" },
      { key: "relatability", label: "Relatability", required: true, desc: "Were you able to relate to characters or plot points?" },
      { key: "meaning", label: "Meaning / Message", required: false, desc: "Did the plot have a reason behind it? Was there a moral to the story?" },
      { key: "movingness", label: "Movingness", required: false, desc: "Were you moved by the story? Did it generate new thoughts or perspectives?" },
    ],
  },
  "Acting & Casting": {
    weight: 3,
    fields: [
      { key: "casting", label: "Casting", required: true, desc: "Did they cast the right actors for each role? Was casting based on merit or marketing?" },
      { key: "actingQuality", label: "Acting Quality", required: true, desc: "Did the actors seem capable and skilled? Did they nail the part?" },
      { key: "dialogueScripting", label: "Dialogue / Scripting", required: false, desc: "Did the dialogue sound natural? Did it give actors opportunities to shine?" },
    ],
  },
  "Pure Entertainment": {
    weight: 2,
    fields: [
      { key: "appeal", label: "Appeal", required: true, desc: "Was the movie overall appealing? Is it worth watching more than once?" },
      { key: "superficialAllure", label: "Superficial Allure", required: false, desc: "Is the appeal based heavily in sex appeal, action, or 'wow factor'? (Not included in score)" },
      { key: "choreography", label: "Choreography", required: false, desc: "Were physical actions of characters and objects good and natural?" },
    ],
  },
};

const GENRE_FIELDS = [
  { key: "genreAction", label: "Action / Adventure" },
  { key: "genreHorror", label: "Horror" },
  { key: "genreDrama", label: "Drama" },
  { key: "genreHistorical", label: "Historical" },
  { key: "genreScifi", label: "Science Fiction" },
  { key: "genreThriller", label: "Thriller" },
  { key: "genreComedy", label: "Comedy" },
  { key: "genreBookAdapt", label: "Book Adaptation" },
  { key: "genreFantasy", label: "Fantasy" },
  { key: "genreRomance", label: "Romance" },
  { key: "genreDocumentary", label: "Documentary" },
  { key: "genreFamily", label: "Family" },
  { key: "genreFilmNoir", label: "Film-Noir" },
  { key: "genreMusical", label: "Musical" },
  { key: "genreBiopic", label: "Biopic" },
  { key: "genreCrime", label: "Crime" },
  { key: "genreWestern", label: "Western" },
  { key: "genreMystery", label: "Mystery" },
];

interface MovieInfo { title: string; poster_path: string | null; release_date: string }

export default function RateMoviePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [movie, setMovie] = useState<MovieInfo | null>(null);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [reviewText, setReviewText] = useState("");
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(CRITERIA).map((k) => [k, true]))
  );

  useEffect(() => {
    if (!user) { router.push("/auth/signin"); return; }
    // Fetch movie info
    fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`)
      .catch(() => null);
    // Load existing rating
    user.getIdToken().then((token) => {
      fetch(`/api/movies/${id}/rate`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(({ rating }) => {
          if (rating) {
            const loaded: Record<string, number | null> = {};
            for (const cat of Object.values(CRITERIA)) {
              for (const field of cat.fields) {
                loaded[field.key] = rating[field.key] ?? null;
              }
            }
            for (const g of GENRE_FIELDS) loaded[g.key] = rating[g.key] ?? null;
            setValues(loaded);
            setOverallRating(rating.overallRating ?? null);
            setReviewText(rating.reviewText ?? "");
          }
        });
    });
  }, [user, id, router]);

  // Fetch movie title from TMDB client-side for display
  useEffect(() => {
    fetch(`/api/tmdb/movie/${id}`).then(r => r.json()).then(setMovie).catch(() => null);
  }, [id]);

  function setValue(key: string, val: number) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function allRequiredFilled() {
    for (const cat of Object.values(CRITERIA)) {
      for (const field of cat.fields) {
        if (field.required && !values[field.key]) return false;
      }
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!allRequiredFilled()) { setError("Please fill in all required fields."); return; }
    setSubmitting(true);
    setError("");
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...values, overallRating, reviewText, movieTitle: movie?.title, releaseDate: movie?.release_date ?? null }),
    });
    if (res.ok) {
      router.push(`/movies/${id}?rated=1`);
    } else {
      setError("Failed to save rating. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Movie header */}
      <div className="flex items-center gap-4 mb-8">
        {movie?.poster_path && (
          <Image src={posterUrl(movie.poster_path, "w92")} alt="" width={56} height={84} className="rounded-lg w-14 h-auto" />
        )}
        <div>
          <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Rating</p>
          <h1 className="text-xl font-bold text-white">{movie?.title ?? "Loading..."}</h1>
          <p className="text-sm text-[var(--foreground-muted)]">{movie?.release_date?.slice(0, 4)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {Object.entries(CRITERIA).map(([catName, cat]) => (
          <div key={catName} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenSections((s) => ({ ...s, [catName]: !s[catName] }))}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--surface-2)] transition-colors"
            >
              <div>
                <span className="font-semibold text-white">{catName}</span>
                <span className="ml-2 text-xs text-[var(--foreground-muted)]">Weight: {cat.weight}x</span>
              </div>
              <span className="text-[var(--foreground-muted)] text-sm">{openSections[catName] ? "▲" : "▼"}</span>
            </button>

            {openSections[catName] && (
              <div className="px-5 pb-5 space-y-5 border-t border-[var(--border)]">
                {cat.fields.map((field) => (
                  <div key={field.key} className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-sm font-medium text-white">
                        {field.label}
                        {field.required && <span className="text-[var(--ratist-red)] ml-1">*</span>}
                      </label>
                      {field.key === "superficialAllure" && (
                        <span className="text-xs text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded">not scored</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--foreground-muted)] mb-3">{field.desc}</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={0.5}
                        value={values[field.key] ?? 5}
                        onChange={(e) => setValue(field.key, parseFloat(e.target.value))}
                        className="flex-1 accent-[var(--ratist-red)]"
                      />
                      <span className="text-sm font-bold text-white w-8 text-right">
                        {values[field.key] ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-1">
                      <span>1 — Poor</span><span>10 — Excellent</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Genre accuracy */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenSections((s) => ({ ...s, genres: !s.genres }))}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--surface-2)] transition-colors"
          >
            <div>
              <span className="font-semibold text-white">Genre Accuracy</span>
              <span className="ml-2 text-xs text-[var(--foreground-muted)]">Optional — rate how well the movie represents each genre it belongs to</span>
            </div>
            <span className="text-[var(--foreground-muted)] text-sm">{openSections.genres ? "▲" : "▼"}</span>
          </button>
          {openSections.genres && (
            <div className="px-5 pb-5 border-t border-[var(--border)] grid sm:grid-cols-2 gap-4 pt-4">
              {GENRE_FIELDS.map((g) => (
                <div key={g.key}>
                  <label className="text-sm text-[var(--foreground-muted)] mb-2 block">{g.label}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.5}
                      value={values[g.key] ?? 5}
                      onChange={(e) => setValue(g.key, parseFloat(e.target.value))}
                      className="flex-1 accent-[var(--ratist-red)]"
                    />
                    <span className="text-sm font-bold text-white w-8 text-right">{values[g.key] ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overall rating */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <label className="block text-sm font-semibold text-white mb-1">Overall Rating <span className="text-[var(--foreground-muted)] font-normal text-xs">(optional — your gut feeling, 1–10)</span></label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={overallRating ?? 5}
              onChange={(e) => setOverallRating(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--ratist-red)]"
            />
            <span className="text-sm font-bold text-white w-8 text-right">{overallRating ?? "—"}</span>
          </div>
        </div>

        {/* Review text */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <label className="block text-sm font-semibold text-white mb-2">Written Review <span className="text-[var(--foreground-muted)] font-normal text-xs">(optional)</span></label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your thoughts on this movie..."
            rows={4}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Rating"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
