"use client";

import { useState } from "react";
import { X, Check, Palette, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { THEME_PRESETS, type ProfileTheme } from "@/lib/themes";

interface Props {
  currentTheme: ProfileTheme | null;
  onClose: () => void;
}

export default function ProfileThemeModal({ currentTheme, onClose }: Props) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ProfileTheme>(currentTheme ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveTheme() {
    if (!user) return;
    setSaving(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/profile/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ profileTheme: Object.keys(theme).length > 0 ? theme : null }),
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

          {/* Live preview */}
          <div className="mb-5">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Preview</p>
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: border, background: surface }}>
              <div className="h-12" style={{ background: `linear-gradient(135deg, ${surface}, ${surface2}, ${accent}30)` }} />
              <div className="px-3 pb-3 -mt-4">
                <div className="flex items-end gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold" style={{ borderColor: surface, background: accent, color: surface }}>
                    U
                  </div>
                  <div>
                    <p className="text-xs font-bold" style={{ color: text }}>Username</p>
                    <p className="text-[10px]" style={{ color: muted }}>Bio text here</p>
                  </div>
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
