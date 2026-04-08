"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { X, Check, Palette, RotateCcw, Upload, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { THEME_PRESETS, type ProfileTheme } from "@/lib/themes";

interface Props {
  currentTheme: ProfileTheme | null;
  onClose: () => void;
}

function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function ProfileThemeModal({ currentTheme, onClose }: Props) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ProfileTheme>(currentTheme ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [headerImage, setHeaderImage] = useState<string | null>(currentTheme?.headerImage ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [headerPosition, setHeaderPosition] = useState(currentTheme?.headerPosition ?? 50);
  const [repositioning, setRepositioning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startY: number; startPos: number } | null>(null);

  async function saveTheme() {
    if (!user) return;
    setSaving(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/profile/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ profileTheme: Object.keys(theme).length > 0 ? { ...theme, headerPosition: headerImage ? headerPosition : undefined } : null }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 600);
    }
    setSaving(false);
  }

  async function uploadHeaderImage(file: File) {
    if (!user) return;
    setUploading(true);
    setUploadError("");
    const token = await user.getIdToken();
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/profile/header-image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (res.ok) {
      const { headerImageUrl } = await res.json();
      setHeaderImage(headerImageUrl);
      setTheme((prev) => ({ ...prev, headerImage: headerImageUrl }));
    } else {
      const data = await res.json().catch(() => ({}));
      setUploadError(data.error ?? "Upload failed.");
    }
    setUploading(false);
  }

  async function removeHeaderImage() {
    if (!user) return;
    setUploading(true);
    const token = await user.getIdToken();
    await fetch("/api/profile/header-image", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setHeaderImage(null);
    setTheme((prev) => {
      const { headerImage: _, ...rest } = prev;
      return rest;
    });
    setUploading(false);
  }

  function selectPreset(presetId: string) {
    if (presetId === "default") {
      setTheme({});
    } else {
      setTheme({ preset: presetId });
    }
  }

  function setCustomColor(key: keyof ProfileTheme, value: string) {
    setTheme((prev) => ({ ...prev, [key]: value, preset: null }));
  }

  function resetTheme() {
    setTheme({});
  }

  const activePreset = theme.preset ?? (Object.keys(theme).filter(k => k !== "headerImage").length === 0 ? "default" : null);

  // Resolve current colors for preview + color inputs
  const preset = theme.preset ? THEME_PRESETS.find((p) => p.id === theme.preset) : null;
  const accent = theme.accentColor || preset?.colors.accentColor || "#cc1034";
  const surface = theme.surfaceColor || preset?.colors.surfaceColor || "#1a1a1a";
  const surface2 = theme.surfaceColor2 || preset?.colors.surfaceColor2 || "#242424";
  const text = theme.textColor || preset?.colors.textColor || "#f0f0f0";
  const muted = theme.mutedColor || preset?.colors.mutedColor || "#a0a0a0";
  const border = theme.borderColor || preset?.colors.borderColor || "#2e2e2e";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--foreground-muted)] hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-bold text-white">Edit Profile Theme</h2>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] mb-5">Choose a preset or create your own colors.</p>

          {/* Preset picker */}
          <div className="mb-5">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Presets</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {THEME_PRESETS.map((p) => {
                const isActive = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectPreset(p.id)}
                    className={`relative rounded-xl border p-2.5 text-left transition-all ${
                      isActive
                        ? "border-[var(--ratist-red)] ring-1 ring-[var(--ratist-red)]"
                        : "border-[var(--border)] hover:border-[var(--foreground-muted)]"
                    }`}
                  >
                    <div className="flex gap-1 mb-1.5">
                      <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ background: p.colors.accentColor }} />
                      <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ background: p.colors.surfaceColor }} />
                      <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ background: p.colors.textColor }} />
                    </div>
                    <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                    {isActive && <Check className="absolute top-2 right-2 w-3 h-3 text-[var(--ratist-red)]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom colors */}
          <div className="mb-5">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Custom Colors</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: "accentColor" as const, label: "Accent", val: accent },
                { key: "surfaceColor" as const, label: "Background", val: surface },
                { key: "textColor" as const, label: "Text", val: text },
              ]).map(({ key, label, val }) => (
                <div key={key} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5">
                  <label className="text-[10px] text-[var(--foreground-muted)] mb-1.5 block">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={val}
                      onChange={(e) => setCustomColor(key, e.target.value)}
                      className="w-7 h-7 rounded border border-[var(--border)] cursor-pointer bg-transparent"
                    />
                    <span className="text-[10px] text-[var(--foreground-muted)] font-mono">{val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Header image */}
          <div className="mb-5">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Header Image</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadHeaderImage(f); setRepositioning(false); } }}
            />
            {headerImage ? (
              <div>
                <div
                  className="relative rounded-xl overflow-hidden border border-[var(--border)]"
                  style={{ cursor: repositioning ? "ns-resize" : undefined }}
                  onPointerDown={(e) => {
                    if (!repositioning) return;
                    e.preventDefault();
                    dragRef.current = { startY: e.clientY, startPos: headerPosition };
                    const el = e.currentTarget;
                    const height = el.getBoundingClientRect().height;

                    function onMove(ev: PointerEvent) {
                      if (!dragRef.current) return;
                      const dy = ev.clientY - dragRef.current.startY;
                      const pctDelta = (dy / height) * -100;
                      const newPos = Math.max(0, Math.min(100, dragRef.current.startPos + pctDelta));
                      setHeaderPosition(Math.round(newPos));
                    }
                    function onUp() {
                      dragRef.current = null;
                      document.removeEventListener("pointermove", onMove);
                      document.removeEventListener("pointerup", onUp);
                    }
                    document.addEventListener("pointermove", onMove);
                    document.addEventListener("pointerup", onUp);
                  }}
                >
                  <div className="aspect-[4/1] relative">
                    <Image
                      src={headerImage}
                      alt="Header"
                      fill
                      className="object-cover select-none"
                      unoptimized
                      draggable={false}
                      style={{ objectPosition: `center ${headerPosition}%` }}
                    />
                    {repositioning && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                        <p className="text-xs text-white bg-black/60 px-3 py-1.5 rounded-lg">Drag up or down to reposition</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRepositioning(!repositioning)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                        repositioning
                          ? "border-[var(--ratist-red)] text-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                          : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                      }`}
                    >
                      {repositioning ? <><Check className="w-3 h-3" /> Done</> : "Reposition"}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-lg transition-colors"
                    >
                      <Upload className="w-3 h-3" /> Replace
                    </button>
                    <button
                      onClick={removeHeaderImage}
                      disabled={uploading}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-[var(--border)] rounded-xl p-4 text-center hover:border-[var(--foreground-muted)] transition-colors disabled:opacity-50"
              >
                <Upload className="w-5 h-5 text-[var(--foreground-muted)] mx-auto mb-1" />
                <p className="text-xs text-[var(--foreground-muted)]">
                  {uploading ? "Uploading..." : "Upload header image (JPEG, PNG, WebP · max 5 MB)"}
                </p>
                <p className="text-[10px] text-[var(--foreground-muted)]/60 mt-1">Ideal size: 1280 × 320 pixels (4:1 ratio)</p>
              </button>
            )}
            {uploadError && <p className="text-xs text-red-400 mt-2">{uploadError}</p>}
          </div>

          {/* Live preview — uses explicit inline colors, fully opaque */}
          <div className="mb-5">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Preview</p>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}`, background: darkenHex(surface, 8) }}>
              {/* Banner gradient or image */}
              {headerImage ? (
                <div style={{ height: 56, position: "relative", overflow: "hidden" }}>
                  <Image src={headerImage} alt="" fill className="object-cover" unoptimized style={{ objectPosition: `center ${headerPosition}%` }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }} />
                </div>
              ) : (
                <div style={{ height: 56, background: `linear-gradient(135deg, ${surface}, ${surface2}, ${accent})` }} />
              )}
              {/* Profile content area — avatar overlaps banner bottom */}
              <div style={{ background: darkenHex(surface, 8), padding: "0 12px 12px" }}>
                <div className="flex items-end gap-2 mb-2" style={{ marginTop: -12 }}>
                  <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 28, height: 28, border: `2px solid ${darkenHex(surface, 8)}`, background: accent, color: surface, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                    U
                  </div>
                  <div style={{ paddingBottom: 2 }}>
                    <p className="text-xs font-bold" style={{ color: text }}>Username</p>
                    <p className="text-[10px]" style={{ color: muted }}>Movie enthusiast</p>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] mb-2" style={{ color: muted }}>
                  <span><strong style={{ color: text }}>42</strong> rated</span>
                  <span><strong style={{ color: text }}>67</strong> seen</span>
                  <span>Avg <strong style={{ color: accent }}>7.2</strong></span>
                </div>
                <div className="flex gap-1">
                  {["Overview", "Ratings", "Diary"].map((t, i) => (
                    <div
                      key={t}
                      className="text-[9px] font-medium px-2 py-0.5 rounded"
                      style={i === 0 ? { background: accent, color: surface } : { background: surface2, color: muted }}
                    >
                      {t}
                    </div>
                  ))}
                </div>
                {/* Sample content card — bars use score-based colors like the real page */}
                <div className="mt-2 rounded-lg" style={{ background: surface, border: `1px solid ${border}`, padding: "8px 10px" }}>
                  <p className="text-[10px] font-semibold" style={{ color: text }}>Movie Component Preferences</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px]" style={{ color: muted }}>Narrative</span>
                    <div className="flex-1 rounded-full" style={{ height: 4, background: surface2 }}>
                      <div className="rounded-full" style={{ height: 4, width: "75%", background: "#22c55e" }} />
                    </div>
                    <span className="text-[9px] font-semibold" style={{ color: "#22c55e" }}>7.5</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px]" style={{ color: muted }}>Cinematic</span>
                    <div className="flex-1 rounded-full" style={{ height: 4, background: surface2 }}>
                      <div className="rounded-full" style={{ height: 4, width: "55%", background: "#eab308" }} />
                    </div>
                    <span className="text-[9px] font-semibold" style={{ color: "#eab308" }}>5.5</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={saveTheme}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {saved ? <><Check className="w-4 h-4" /> Saved!</> : saving ? "Saving..." : <><Palette className="w-4 h-4" /> Save Theme</>}
            </button>
            <button
              onClick={resetTheme}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
