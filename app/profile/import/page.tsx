"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Upload, CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

type Platform = "letterboxd" | "imdb";

interface ParsedRow {
  title: string;
  year?: number;
  rating?: number;
  review?: string;
  watchedDate?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function parseLetterboxd(csv: string): ParsedRow[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  // Find header row — works with both ratings.csv and reviews.csv
  const headerIdx = lines.findIndex((l) => l.toLowerCase().startsWith("date,name") || l.toLowerCase().startsWith("date,"));
  if (headerIdx === -1) return [];
  const headers = lines[headerIdx].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const get = (key: string) => cols[headers.indexOf(key)]?.replace(/^"|"$/g, "").trim() ?? "";
    const title = get("name");
    if (!title) continue;
    const yearStr = get("year");
    const ratingStr = get("rating");
    const watchedDate = get("watched date") || get("date");
    const reviewText = get("review");
    rows.push({
      title,
      year: yearStr ? parseInt(yearStr) : undefined,
      rating: ratingStr ? Math.min(10, parseFloat(ratingStr) * 2) : undefined,
      review: reviewText || undefined,
      watchedDate: watchedDate || undefined,
    });
  }
  return rows;
}

function parseIMDb(csv: string): ParsedRow[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /const|your rating|title/i.test(l));
  if (headerIdx === -1) return [];
  const headers = lines[headerIdx].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const get = (key: string) => cols[headers.indexOf(key)]?.replace(/^"|"$/g, "").trim() ?? "";
    // IMDb has "title" and "year" columns
    const title = get("title");
    if (!title) continue;
    const yearStr = get("year");
    const ratingStr = get("your rating");
    const dateRated = get("date rated");
    rows.push({
      title,
      year: yearStr ? parseInt(yearStr) : undefined,
      rating: ratingStr ? parseFloat(ratingStr) : undefined,
      watchedDate: dateRated ? dateRated.split(" ")[0] : undefined,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function detectPlatform(csv: string): Platform | null {
  const firstLine = csv.split("\n")[0].toLowerCase();
  if (firstLine.includes("letterboxd uri") || firstLine.includes("name,year")) return "letterboxd";
  if (firstLine.includes("const,") || firstLine.includes("your rating,date rated")) return "imdb";
  // Try second line
  const secondLine = csv.split("\n").find((l, i) => i > 0 && l.trim()) ?? "";
  if (secondLine.startsWith("tt")) return "imdb";
  return null;
}

const BATCH_SIZE = 10;

export default function ImportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  if (authLoading) return null;
  if (!user) {
    router.push("/auth/signin");
    return null;
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      const detected = detectPlatform(csv);
      const activePlatform = platform ?? detected;
      setPlatform(activePlatform);
      setFileName(file.name);
      setError("");
      setResult(null);

      if (!activePlatform) {
        setError("Could not detect CSV format. Please select Letterboxd or IMDb above before uploading.");
        return;
      }

      const parsed = activePlatform === "letterboxd" ? parseLetterboxd(csv) : parseIMDb(csv);
      if (parsed.length === 0) {
        setError("No movies found in the file. Make sure you exported the Ratings/Diary list (not watchlist).");
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  async function startImport() {
    if (!user || rows.length === 0) return;
    setImporting(true);
    setProgress(0);
    setResult(null);

    const token = await user.getIdToken();
    let totalImported = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: batch, source: platform }),
        });
        if (res.ok) {
          const data: ImportResult = await res.json();
          totalImported += data.imported;
          totalSkipped += data.skipped;
          totalFailed += data.failed;
          allErrors.push(...data.errors);
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
        <Link href={`/profile/${user.uid}`} className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to profile
        </Link>
        <h1 className="text-2xl font-bold text-white">Import Ratings</h1>
        <p className="text-[var(--foreground-muted)] text-sm mt-1">
          Import your movie history from Letterboxd or IMDb. Your overall rating and review will be pre-filled — you can complete the full Ratist rating later.
        </p>
      </div>

      {/* Platform selection */}
      <div className="mb-6">
        <p className="text-sm font-medium text-white mb-3">Platform</p>
        <div className="flex gap-3">
          {(["letterboxd", "imdb"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPlatform(p); setRows([]); setFileName(""); setError(""); setResult(null); }}
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

      {/* How to export instructions */}
      {platform && (
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--foreground-muted)]">
          {platform === "letterboxd" ? (
            <>
              <p className="font-medium text-white mb-2">How to export from Letterboxd</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to <strong className="text-white">letterboxd.com</strong> → Settings</li>
                <li>Click <strong className="text-white">Data</strong> in the left sidebar</li>
                <li>Click <strong className="text-white">Export your data</strong></li>
                <li>Upload the <code className="bg-[var(--surface-2)] px-1 rounded">reviews.csv</code> file below (or <code className="bg-[var(--surface-2)] px-1 rounded">ratings.csv</code>)</li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-medium text-white mb-2">How to export from IMDb</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to <strong className="text-white">imdb.com</strong> → Your Activity</li>
                <li>Open <strong className="text-white">Your Ratings</strong></li>
                <li>Click the <strong className="text-white">three dots menu (⋮)</strong> → <strong className="text-white">Export</strong></li>
                <li>Upload the downloaded CSV file below</li>
              </ol>
            </>
          )}
        </div>
      )}

      {/* File upload */}
      <div
        className="mb-6 border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center hover:border-[var(--ratist-red)] transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <Upload className="w-8 h-8 text-[var(--foreground-muted)] mx-auto mb-3" />
        {fileName ? (
          <p className="text-sm text-white font-medium">{fileName}</p>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)]">
            Drop your CSV file here, or <span className="text-[var(--ratist-red)]">click to browse</span>
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

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
              Found <strong>{rows.length}</strong> movies
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">Preview: first 5 rows</p>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-2 text-[var(--foreground-muted)] font-medium">Title</th>
                  <th className="text-left px-4 py-2 text-[var(--foreground-muted)] font-medium">Year</th>
                  <th className="text-left px-4 py-2 text-[var(--foreground-muted)] font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="px-4 py-2 text-white">{r.title}</td>
                    <td className="px-4 py-2 text-[var(--foreground-muted)]">{r.year ?? "—"}</td>
                    <td className="px-4 py-2 text-[var(--foreground-muted)]">{r.rating != null ? r.rating.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importing ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-[var(--foreground-muted)]">Importing...</span>
                <span className="text-white font-medium">{progress}%</span>
              </div>
              <div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--ratist-red)] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={startImport}
              className="w-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Import {rows.length} movies
            </button>
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
              <p className="text-xs text-[var(--foreground-muted)]">Imported</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <AlertCircle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{result.skipped}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Already rated</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{result.failed}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Not found</p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--foreground-muted)] space-y-2">
            <p>
              Imported movies show your overall score with an{" "}
              <span className="text-blue-400 font-medium">Imported</span> badge. Your scores and reviews are visible on your profile right away.
            </p>
            <p>
              To get the most out of The Ratist — personalized score estimates, accurate taste matching, and better recommendations — complete the full rating form on movies you feel strongly about. The more detailed ratings you have, the better we can understand your taste.
            </p>
          </div>

          {result.errors.length > 0 && (
            <details className="text-sm">
              <summary className="text-[var(--foreground-muted)] cursor-pointer hover:text-white">
                Show {result.errors.length} not-found titles
              </summary>
              <ul className="mt-2 space-y-1 text-[var(--foreground-muted)] pl-4">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href={`/profile/${user.uid}`}
              className="flex-1 text-center bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-3 rounded-xl transition-colors"
            >
              View my profile →
            </Link>
            <button
              onClick={() => { setRows([]); setFileName(""); setResult(null); }}
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
