"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Upload, CheckCircle, XCircle, AlertCircle, ArrowLeft, Bookmark, Plus } from "lucide-react";

type Platform = "letterboxd" | "imdb";

interface ParsedRow {
  title?: string;
  year?: number;
  imdbId?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

interface WatchlistMeta {
  id: string;
  name: string;
  isDefault: boolean;
  isOwner: boolean;
  myRole: string | null;
}

/** CSV parser mirroring /profile/import — handles quoted fields, escaped
 *  quotes, and CRLF line endings. The Letterboxd watchlist export uses
 *  the same shape as their other exports so the same parser works. */
function parseCsvFull(csv: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(current.trim()); current = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && i + 1 < csv.length && csv[i + 1] === "\n") i++;
        row.push(current.trim());
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = []; current = "";
      } else current += ch;
    }
  }
  row.push(current.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

/** Letterboxd watchlist.csv columns: Date,Name,Year,Letterboxd URI.
 *  We only need Name + Year. Dedup by title+year. */
function parseLetterboxd(csv: string): ParsedRow[] {
  const allRows = parseCsvFull(csv);
  if (allRows.length < 2) return [];
  const headerIdx = allRows.findIndex((r) => r.some((c) => c.toLowerCase() === "name"));
  if (headerIdx === -1) return [];
  const headers = allRows[headerIdx].map((h) => h.toLowerCase());
  const nameIdx = headers.indexOf("name");
  const yearIdx = headers.indexOf("year");
  if (nameIdx === -1) return [];
  const seen = new Set<string>();
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cols = allRows[i];
    const title = (cols[nameIdx] ?? "").trim();
    if (!title) continue;
    const yearStr = yearIdx >= 0 ? (cols[yearIdx] ?? "").trim() : "";
    const key = `${title.toLowerCase()}::${yearStr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ title, year: yearStr ? parseInt(yearStr) : undefined });
  }
  return rows;
}

/** IMDb List.json structure: { Lists: [{ List Class, List Type, Items: [{ Entity Identifier }] }] }
 *  We pick the list where List Class === "WATCHLIST" (or List Type === "Titles"
 *  if a user has multiple title lists they want to bring across). For each
 *  item, Entity Identifier is the IMDb tt id. */
function parseIMDbJson(text: string): { rows: ParsedRow[]; warning?: string } {
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { return { rows: [], warning: "File isn't valid JSON. Make sure you uploaded IMDb.List.json from the IMDb.List folder." }; }
  if (!data || typeof data !== "object" || !Array.isArray((data as { Lists?: unknown }).Lists)) {
    return { rows: [], warning: "Couldn't find a Lists array. Make sure you uploaded the IMDb.List.json file IMDb gave you." };
  }
  const lists = (data as { Lists: Array<Record<string, unknown>> }).Lists;
  // Prefer the canonical Watchlist (List Class = "WATCHLIST"). If absent
  // (some accounts only have custom title lists), fall back to the
  // largest "Titles" list.
  const watchlistEntry = lists.find((l) => l["List Class"] === "WATCHLIST" && l["List Type"] === "Titles");
  const titleLists = lists.filter((l) => l["List Type"] === "Titles");
  const list = watchlistEntry
    ?? titleLists.sort((a, b) => Number(b["List Size"] ?? 0) - Number(a["List Size"] ?? 0))[0];
  if (!list || !Array.isArray(list.Items)) {
    return { rows: [], warning: "No watchlist found in the file. IMDb may not have included a Titles list yet — try requesting a fresh data export." };
  }
  const items = list.Items as Array<Record<string, unknown>>;
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const ent = it["Entity Identifier"];
    if (typeof ent !== "string" || !ent.startsWith("tt")) continue;
    if (seen.has(ent)) continue;
    seen.add(ent);
    rows.push({ imdbId: ent });
  }
  return { rows };
}

const BATCH_SIZE = 10;

export default function WatchlistImportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const fileRef = useRef<HTMLInputElement>(null);

  const [platform, setPlatform] = useState<Platform | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const [watchlists, setWatchlists] = useState<WatchlistMeta[]>([]);
  // "Create a new watchlist" inline form. Reveals when the user clicks
  // the "+ Create new" row; collapses on cancel or after a successful
  // create-and-import.
  const [creatingNew, setCreatingNew] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListPrivate, setNewListPrivate] = useState(false);

  // Pre-resolve preview only matters for IMDb — Letterboxd already has
  // titles in the CSV. Lazy: we don't pre-resolve the full list (cost),
  // just count them; server resolves at import time.
  const [resolving, setResolving] = useState(false);
  const [previewTitles, setPreviewTitles] = useState<Record<string, string>>({});

  // Load the user's watchlists so the destination picker can populate.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const lists: WatchlistMeta[] = (data.watchlists ?? []).filter(
          (w: WatchlistMeta) => w.isOwner || w.myRole === "editor",
        );
        setWatchlists(lists);
        // No auto-selection — even if the user has "auto-add to
        // default" enabled in their watchlist settings, that
        // preference deliberately doesn't apply here. The import
        // surface forces an explicit pick so a setting can't silently
        // dump hundreds of titles into the wrong list.
      } catch { /* non-fatal — they can still pick after manual load */ }
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) {
    router.push(`/auth/signin?redirect=${encodeURIComponent(pathname)}`);
    return null;
  }

  // Resolve a small batch of IMDb ids → titles for the preview table.
  // We don't resolve the whole list here because we'd be paying for
  // hundreds of TMDB calls before the user even hits Import. Server
  // does the full resolve at import time.
  async function resolvePreview(parsed: ParsedRow[]) {
    const needs = parsed.filter((r) => r.imdbId).slice(0, 5);
    if (needs.length === 0) return;
    setResolving(true);
    const out: Record<string, string> = {};
    for (const r of needs) {
      try {
        const res = await fetch(`/api/tmdb/find?imdbId=${r.imdbId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.title) out[r.imdbId!] = data.year ? `${data.title} (${data.year})` : data.title;
        }
      } catch { /* skip */ }
    }
    setPreviewTitles(out);
    setResolving(false);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setError("");
    setResult(null);
    setPreviewTitles({});
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!platform) {
        setError("Pick a platform (Letterboxd or IMDb) first.");
        return;
      }
      if (platform === "letterboxd") {
        const parsed = parseLetterboxd(text);
        if (parsed.length === 0) {
          setError("No titles found. Make sure you uploaded watchlist.csv from your Letterboxd data export.");
          return;
        }
        setRows(parsed);
      } else {
        const { rows: parsed, warning } = parseIMDbJson(text);
        if (warning) { setError(warning); return; }
        if (parsed.length === 0) {
          setError("No titles found in the watchlist.");
          return;
        }
        setRows(parsed);
        await resolvePreview(parsed);
      }
    };
    reader.readAsText(file);
  }

  async function startImport(opts: { listId: string } | { createNew: true }) {
    if (!user || rows.length === 0) return;
    setError("");

    // Resolve destination. Explicit listId path is the common case
    // (user clicked an existing-list row). createNew path runs the
    // POST /api/watchlist call first, then imports into the freshly
    // created list. Doing the create up-front means a failed create
    // doesn't burn TMDB resolutions before we know where to put them.
    let targetListId: string;
    if ("createNew" in opts) {
      const name = newListName.trim();
      if (!name) { setError("Give the new watchlist a name."); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, isPrivate: newListPrivate }),
        });
        if (!res.ok) { setError("Couldn't create the new watchlist."); return; }
        const data = await res.json();
        if (!data.watchlist?.id) { setError("New watchlist response was malformed."); return; }
        targetListId = data.watchlist.id;
      } catch { setError("Couldn't create the new watchlist."); return; }
    } else {
      targetListId = opts.listId;
    }

    setImporting(true);
    setProgress(0);
    setResult(null);

    const token = await user.getIdToken();
    let totalImported = 0, totalSkipped = 0, totalFailed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/watchlist/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch, listId: targetListId }),
        });
        if (res.ok) {
          const data: ImportResult = await res.json();
          totalImported += data.imported;
          totalSkipped += data.skipped;
          totalFailed += data.failed;
          allErrors.push(...data.errors);
        } else {
          totalFailed += batch.length;
        }
      } catch {
        totalFailed += batch.length;
      }
      setProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / rows.length) * 100)));
    }

    setResult({ imported: totalImported, skipped: totalSkipped, failed: totalFailed, errors: allErrors });
    setImporting(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link href="/watchlist" className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to watchlists
        </Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Bookmark className="w-6 h-6 text-[var(--ratist-red)]" /> Import a Watchlist
        </h1>
        <p className="text-[var(--foreground-muted)] text-sm mt-1">
          Bring your saved-for-later list across from Letterboxd or IMDb. After your file is uploaded, you&apos;ll pick which watchlist to add it to.
        </p>
      </div>

      {/* Platform */}
      <div className="mb-6">
        <p className="text-sm font-medium text-white mb-3">Platform</p>
        <div className="flex gap-3">
          {(["letterboxd", "imdb"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPlatform(p); setRows([]); setFileName(""); setError(""); setResult(null); setPreviewTitles({}); }}
              className={`px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                platform === p
                  ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                  : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white"
              }`}
            >
              {p === "letterboxd" ? "Letterboxd" : "IMDb"}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      {platform && (
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--foreground-muted)]">
          {platform === "letterboxd" ? (
            <>
              <p className="font-medium text-white mb-2">How to export from Letterboxd</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to <strong className="text-white">letterboxd.com</strong></li>
                <li>Go to <strong className="text-white">Settings</strong></li>
                <li>Click the <strong className="text-white">Data</strong> tab</li>
                <li>Click <strong className="text-white">Export your data</strong></li>
                <li>Upload the <code className="bg-[var(--surface-2)] px-1 rounded">watchlist.csv</code> file below</li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-medium text-white mb-2">How to export from IMDb</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to <strong className="text-white">imdb.com</strong></li>
                <li>Go to <strong className="text-white">Account Settings</strong></li>
                <li>Click the <strong className="text-white">Request my data</strong> tab</li>
                <li>Click <strong className="text-white">Submit request</strong></li>
                <li>Open the <code className="bg-[var(--surface-2)] px-1 rounded">IMDb.List</code> folder from the export</li>
                <li>Upload the <code className="bg-[var(--surface-2)] px-1 rounded">IMDb.List.json</code> file below</li>
              </ol>
            </>
          )}
        </div>
      )}

      {/* File upload */}
      {platform && (
        <div
          className="mb-6 border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center hover:border-[var(--ratist-red)] transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload className="w-8 h-8 text-[var(--foreground-muted)] mx-auto mb-3" />
          {fileName ? (
            <p className="text-sm text-white font-medium">{fileName}</p>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              Drop your {platform === "letterboxd" ? "watchlist.csv" : "IMDb.List.json"} here, or <span className="text-[var(--ratist-red)]">click to browse</span>
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={platform === "letterboxd" ? ".csv" : ".json"}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !result && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white">
              Found <strong>{rows.length}</strong> {rows.length === 1 ? "title" : "titles"}
              {resolving && <span className="text-xs text-[var(--foreground-muted)] ml-2">Looking up preview titles...</span>}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">Preview: first 5</p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-4">
            <ul className="divide-y divide-[var(--border)]/50">
              {rows.slice(0, 5).map((r, i) => {
                const label = r.title
                  ? (r.year ? `${r.title} (${r.year})` : r.title)
                  : (r.imdbId && previewTitles[r.imdbId])
                    ? previewTitles[r.imdbId]
                    : r.imdbId ?? "(unknown)";
                return (
                  <li key={i} className="px-4 py-2 text-sm text-white truncate">{label}</li>
                );
              })}
            </ul>
          </div>

          {importing ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-[var(--foreground-muted)]">Importing...</span>
                <span className="text-white font-medium">{progress}%</span>
              </div>
              <div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--ratist-red)] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            // Destination picker — only revealed after we know what
            // we'd be importing. No pre-selection — user must click a
            // list (or create a new one) to start the import. Even if
            // their account has "auto-add to default" enabled
            // elsewhere, that preference deliberately doesn't apply
            // here; an import is too destructive to fall back to a
            // default destination.
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-sm font-semibold text-white mb-1">Add these to which watchlist?</p>
              <p className="text-xs text-[var(--foreground-muted)] mb-3">Pick an existing list or create a new one. We&apos;ll start the import as soon as you choose.</p>
              {watchlists.length === 0 ? (
                <p className="text-xs text-[var(--foreground-muted)] py-3 text-center">Loading your watchlists...</p>
              ) : (
                <div className="space-y-1">
                  {watchlists.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => startImport({ listId: w.id })}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/70 hover:border-[var(--ratist-red)] border border-transparent transition-colors text-left"
                    >
                      <span className="text-sm text-white truncate">
                        {w.name}
                        {w.isDefault && <span className="text-xs text-[var(--foreground-muted)] ml-1.5">(default)</span>}
                      </span>
                      <Bookmark className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />
                    </button>
                  ))}
                  {!creatingNew ? (
                    <button
                      onClick={() => setCreatingNew(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--ratist-red)] hover:bg-[var(--surface-2)]/40 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Create a new watchlist…
                    </button>
                  ) : (
                    <div className="space-y-2 p-3 rounded-lg border border-[var(--ratist-red)]/30 bg-[var(--surface-2)]/40 mt-1">
                      <input
                        type="text"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        maxLength={80}
                        autoFocus
                        placeholder="New watchlist name (e.g. From Letterboxd)"
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                      />
                      <label className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newListPrivate}
                          onChange={(e) => setNewListPrivate(e.target.checked)}
                          className="accent-[var(--ratist-red)]"
                        />
                        Make this list private
                      </label>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => startImport({ createNew: true })}
                          disabled={!newListName.trim()}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-4 h-4" /> Create &amp; import {rows.length} {rows.length === 1 ? "title" : "titles"}
                        </button>
                        <button
                          onClick={() => { setCreatingNew(false); setNewListName(""); setNewListPrivate(false); }}
                          className="px-3 py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{result.imported}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Added</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <AlertCircle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{result.skipped}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Already on list</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{result.failed}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Not found</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <details className="text-sm">
              <summary className="text-[var(--foreground-muted)] cursor-pointer hover:text-white">
                Show {result.errors.length} not-found {result.errors.length === 1 ? "title" : "titles"}
              </summary>
              <ul className="mt-2 space-y-1 text-[var(--foreground-muted)] pl-4">
                {result.errors.map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
            </details>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/watchlist"
              className="flex-1 text-center bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Go to my watchlist →
            </Link>
            <button
              onClick={() => { setRows([]); setFileName(""); setResult(null); setPreviewTitles({}); }}
              className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors"
            >
              Import more
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
