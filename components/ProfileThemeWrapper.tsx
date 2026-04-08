"use client";

import { resolveThemeVars, type ProfileTheme } from "@/lib/themes";

interface Props {
  theme: ProfileTheme | null;
  children: React.ReactNode;
}

/**
 * Wraps the profile page and injects custom CSS variables from the user's theme.
 * Variables are scoped to this wrapper — they don't leak to the rest of the site.
 */
function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function ProfileThemeWrapper({ theme, children }: Props) {
  const vars = resolveThemeVars(theme);

  if (!vars) return <>{children}</>;

  // Build inline style object mapping CSS custom properties
  const style: React.CSSProperties = {};
  for (const [key, value] of Object.entries(vars)) {
    (style as Record<string, string>)[key] = value;
  }

  // Also override the global vars so existing components pick up the theme
  if (vars["--profile-accent"]) {
    (style as Record<string, string>)["--ratist-red"] = vars["--profile-accent"];
    (style as Record<string, string>)["--ratist-red-hover"] = vars["--profile-accent-hover"] ?? vars["--profile-accent"];
  }
  if (vars["--profile-surface"]) {
    (style as Record<string, string>)["--surface"] = vars["--profile-surface"];
    // Derive a background color slightly darker than the surface
    (style as Record<string, string>)["--background"] = darkenHex(vars["--profile-surface"], 8);
    style.backgroundColor = darkenHex(vars["--profile-surface"], 8);
  }
  if (vars["--profile-surface-2"]) (style as Record<string, string>)["--surface-2"] = vars["--profile-surface-2"];
  if (vars["--profile-text"]) {
    (style as Record<string, string>)["--foreground"] = vars["--profile-text"];
    style.color = vars["--profile-text"];
  }
  if (vars["--profile-muted"]) (style as Record<string, string>)["--foreground-muted"] = vars["--profile-muted"];
  if (vars["--profile-border"]) (style as Record<string, string>)["--border"] = vars["--profile-border"];

  return (
    <div style={style} className="min-h-screen">
      {children}
    </div>
  );
}
