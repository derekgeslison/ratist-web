"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Palette, RotateCcw, Ticket } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { THEME_PRESETS, type ProfileTheme } from "@/lib/themes";

export default function ProfileThemeEditor() {
  const { user } = useAuth();
  const { hasPass, loading: subLoading } = useSubscription();
  const [theme, setTheme] = useState<ProfileTheme>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch("/api/profile/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          if (data.user?.profileTheme) setTheme(data.user.profileTheme);
          setLoaded(true);
        })
    ).catch(() => setLoaded(true));
  }, [user]);

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
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  function selectPreset(presetId: string) {
    if (presetId === "default") {
      setTheme({});
    } else {
      setTheme((prev) => ({ ...prev, preset: presetId, accentColor: undefined, surfaceColor: undefined, surfaceColor2: undefined, textColor: undefined, mutedColor: undefined, borderColor: undefined }));
    }
  }

  function setCustomColor(key: keyof ProfileTheme, value: string) {
    setTheme((prev) => ({ ...prev, [key]: value, preset: null }));
  }

  function resetTheme() {
    setTheme({});
  }

  if (subLoading) return null;

  // Non-subscriber: show Backstage Pass promo
  if (!hasPass) {
    return (
      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-1">Profile Theme</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Customize how your profile looks to visitors.</p>
        <Link
          href="/backstage-pass/custom-themes"
          className="flex items-center gap-4 bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-transparent border border-amber-400/30 rounded-xl p-5 hover:border-amber-400 transition-colors group"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 shrink-0">
            <Ticket className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">Unlock Custom Themes</p>
            <p className="text-xs text-[var(--foreground-muted)]">Choose from pre-made themes or create your own colors. Part of the Backstage Pass.</p>
          </div>
          <span className="text-xs text-amber-400 font-semibold shrink-0 hidden sm:block">Learn more &rarr;</span>
        </Link>
      </section>
    );
  }

  if (!loaded) return null;

  const activePreset = theme.preset ?? (Object.keys(theme).filter(k => k !== "headerImage").length === 0 ? "default" : null);

  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-1">Profile Theme</h2>
      <p className="text-sm text-[var(--foreground-muted)] mb-4">Customize how your profile looks to visitors.</p>

      {/* Preset picker */}
      <div className="mb-6">
        <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-3">Presets</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {THEME_PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => selectPreset(preset.id)}
                className={`relative rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? "border-[var(--ratist-red)] ring-1 ring-[var(--ratist-red)]"
                    : "border-[var(--border)] hover:border-[var(--foreground-muted)]"
                }`}
              >
                {/* Color preview dots */}
                <div className="flex gap-1 mb-2">
                  <div className="w-4 h-4 rounded-full border border-white/10" style={{ background: preset.colors.accentColor }} />
                  <div className="w-4 h-4 rounded-full border border-white/10" style={{ background: preset.colors.surfaceColor }} />
                  <div className="w-4 h-4 rounded-full border border-white/10" style={{ background: preset.colors.textColor }} />
                </div>
                <p className="text-xs font-semibold text-white truncate">{preset.name}</p>
                <p className="text-[10px] text-[var(--foreground-muted)] truncate">{preset.description}</p>
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom colors */}
      <div className="mb-6">
        <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-3">Custom Colors</p>
        <p className="text-[11px] text-[var(--foreground-muted)] mb-3">
          Override any of the six color variables individually. Leave a swatch alone to inherit it from your selected preset.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {([
            { key: "accentColor" as const,  label: "Accent",           defaultVal: "#cc1034" },
            { key: "surfaceColor" as const, label: "Background",       defaultVal: "#1a1a1a" },
            { key: "surfaceColor2" as const,label: "Secondary Surface",defaultVal: "#242424" },
            { key: "textColor" as const,    label: "Text",             defaultVal: "#f0f0f0" },
            { key: "mutedColor" as const,   label: "Muted Text",       defaultVal: "#a0a0a0" },
            { key: "borderColor" as const,  label: "Border",           defaultVal: "#2e2e2e" },
          ]).map(({ key, label, defaultVal }) => (
            <div key={key} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
              <label className="text-xs text-[var(--foreground-muted)] mb-2 block">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme[key] ?? (theme.preset ? THEME_PRESETS.find(p => p.id === theme.preset)?.colors[key] : undefined) ?? defaultVal}
                  onChange={(e) => setCustomColor(key, e.target.value)}
                  className="w-8 h-8 rounded-lg border border-[var(--border)] cursor-pointer bg-transparent"
                />
                <span className="text-xs text-[var(--foreground-muted)] font-mono">
                  {theme[key] ?? (theme.preset ? THEME_PRESETS.find(p => p.id === theme.preset)?.colors[key] : undefined) ?? defaultVal}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live preview */}
      <div className="mb-6">
        <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-3">Preview</p>
        <ThemePreview theme={theme} />
      </div>

      {/* Save / Reset */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveTheme}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          {saved ? <><Check className="w-4 h-4" /> Saved!</> : saving ? "Saving..." : <><Palette className="w-4 h-4" /> Save Theme</>}
        </button>
        <button
          onClick={resetTheme}
          className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-xl transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
        </button>
      </div>
    </section>
  );
}

/** Small preview card showing what the theme looks like */
function ThemePreview({ theme }: { theme: ProfileTheme }) {
  const preset = theme.preset ? THEME_PRESETS.find((p) => p.id === theme.preset) : null;
  const accent = theme.accentColor || preset?.colors.accentColor || "#cc1034";
  const surface = theme.surfaceColor || preset?.colors.surfaceColor || "#1a1a1a";
  const surface2 = theme.surfaceColor2 || preset?.colors.surfaceColor2 || "#242424";
  const text = theme.textColor || preset?.colors.textColor || "#f0f0f0";
  const muted = theme.mutedColor || preset?.colors.mutedColor || "#a0a0a0";
  const border = theme.borderColor || preset?.colors.borderColor || "#2e2e2e";

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: border, background: surface }}
    >
      {/* Mini banner */}
      <div className="h-16" style={{ background: `linear-gradient(135deg, ${surface}, ${surface2}, ${accent}30)` }} />
      <div className="px-4 pb-4 -mt-5">
        <div className="flex items-end gap-3 mb-3">
          <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold" style={{ borderColor: surface, background: accent, color: surface }}>
            U
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: text }}>Username</p>
            <p className="text-xs" style={{ color: muted }}>Movie enthusiast</p>
          </div>
        </div>
        <div className="flex gap-3 text-xs mb-3" style={{ color: muted }}>
          <span><strong style={{ color: text }}>42</strong> rated</span>
          <span><strong style={{ color: text }}>67</strong> seen</span>
          <span>Avg <strong style={{ color: accent }}>7.2</strong></span>
        </div>
        <div className="flex gap-1">
          {["Overview", "Ratings", "Diary"].map((t, i) => (
            <div
              key={t}
              className="text-[10px] font-medium px-2.5 py-1 rounded-md"
              style={i === 0
                ? { background: accent, color: surface }
                : { background: surface2, color: muted }
              }
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
