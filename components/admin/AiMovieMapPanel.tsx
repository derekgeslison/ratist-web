"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, Download, RefreshCcw, AlertCircle, ChevronDown } from "lucide-react";

type LinkedMedia = { tmdbId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null };

interface DraftResponse {
  draft: {
    mapType: string;
    title: string;
    summary: string;
  };
  svg: string;
}

interface Props {
  linkedMedia: LinkedMedia[];
}

export default function AiMovieMapPanel({ linkedMedia }: Props) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DraftResponse | null>(null);

  const hasInput = prompt.trim().length > 0 || linkedMedia.length > 0;

  async function generate() {
    if (!user || !hasInput) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/posts/ai-movie-map", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim() || undefined,
          movies: linkedMedia.map((m) => ({ title: m.title, mediaType: m.mediaType })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Draft failed (${res.status})`);
        setLoading(false);
        return;
      }
      setResult(data as DraftResponse);
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  function downloadSvg() {
    if (!result) return;
    const blob = new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename(result.draft.title, "svg"));
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPng() {
    if (!result) return;
    try {
      const pngUrl = await svgToPngDataUrl(result.svg, 2);
      triggerDownload(pngUrl, filename(result.draft.title, "png"));
    } catch {
      setError("PNG export failed — try SVG.");
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--ratist-red)]" />
        <h3 className="text-sm font-semibold text-white">AI Movie Map Draft</h3>
      </div>
      <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
        Generate a starting-point vector diagram. Not meant for the final post — just a skeleton you can open in Illustrator / Photoshop and redraw.
      </p>

      <details className="group bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
        <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-xs font-semibold text-white list-none [&::-webkit-details-marker]:hidden [&::marker]:content-['']">
          <span>Map types & when to use each</span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--foreground-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-3 pb-3 text-xs text-[var(--foreground-muted)] leading-relaxed space-y-2 border-t border-[var(--border)] pt-3">
          <p>Add any of these phrases to your guidance to force a specific type — otherwise the AI picks one.</p>
          <div>
            <div className="text-white font-semibold">timeline</div>
            <div>Parallel horizontal lanes of time-ordered beats. Use for parallel/intercut storylines or forward-vs-reverse chronology. (Memento, Dunkirk, Tenet)</div>
          </div>
          <div>
            <div className="text-white font-semibold">nested_layers</div>
            <div>Concentric rectangles, outer to inner. Use for stories-inside-stories or dream/reality levels. (Inception, The Matrix)</div>
          </div>
          <div>
            <div className="text-white font-semibold">tree</div>
            <div>Top-down branching hierarchy. Use for branching causality, &quot;what-if&quot; splits, timeline fractures. (Primer, The Butterfly Effect)</div>
          </div>
          <div>
            <div className="text-white font-semibold">web</div>
            <div>Nodes on a ring with edges through the center. Use for ensembles with no single hierarchy or timeline. (Magnolia, Crash, Babel, Love Actually)</div>
          </div>
          <div>
            <div className="text-white font-semibold">sequence</div>
            <div>Single horizontal line with reorder arrows. Use when a linear plot is TOLD out of order and the map shows the &quot;real&quot; order. (Pulp Fiction, Arrival, 500 Days of Summer)</div>
          </div>
        </div>
      </details>

      <div>
        <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Guidance (optional)</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={linkedMedia.length > 0
            ? `Extra direction, e.g. "focus on the dream levels" or "thematic web of grief"`
            : `Describe the movie and what you want mapped, e.g. "Memento — both timelines"`}
          rows={3}
          maxLength={800}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)] resize-none"
        />
      </div>

      {linkedMedia.length > 0 && (
        <div className="text-xs text-[var(--foreground-muted)]">
          Using linked: <span className="text-white">{linkedMedia.map((m) => m.title).join(", ")}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={generate}
        disabled={loading || !hasInput}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <><RefreshCcw className="w-4 h-4 animate-spin" /> Drafting…</>
        ) : (
          <><Sparkles className="w-4 h-4" /> {result ? "Regenerate" : "Draft map"}</>
        )}
      </button>

      {result && (
        <div className="space-y-3 pt-3 border-t border-[var(--border)]">
          <div>
            <div className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{result.draft.mapType.replace(/_/g, " ")}</div>
            <div className="text-sm font-semibold text-white">{result.draft.title}</div>
            {result.draft.summary && <div className="text-xs text-[var(--foreground-muted)] mt-1 leading-relaxed">{result.draft.summary}</div>}
          </div>
          <div className="bg-black rounded-lg overflow-hidden border border-[var(--border)]">
            {/* eslint-disable-next-line react/no-danger */}
            <div
              className="w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
              dangerouslySetInnerHTML={{ __html: result.svg }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadSvg}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-white rounded-lg text-xs font-semibold hover:border-[var(--ratist-red)] transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> SVG
            </button>
            <button
              onClick={downloadPng}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-white rounded-lg text-xs font-semibold hover:border-[var(--ratist-red)] transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
          </div>
          <p className="text-[10px] text-[var(--foreground-muted)] leading-relaxed">
            SVG opens in Illustrator as editable layers. PNG is rasterized — use for reference underlays in Photoshop.
          </p>
        </div>
      )}
    </div>
  );
}

function filename(title: string, ext: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "movie-map";
  return `${base}-draft.${ext}`;
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function svgToPngDataUrl(svg: string, scale = 2): Promise<string> {
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const w = viewBoxMatch ? parseInt(viewBoxMatch[1], 10) : 1400;
  const h = viewBoxMatch ? parseInt(viewBoxMatch[2], 10) : 900;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.fillStyle = "#0b0b0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
