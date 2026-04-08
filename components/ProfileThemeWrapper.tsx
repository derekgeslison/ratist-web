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
  if (vars["--profile-surface"]) (style as Record<string, string>)["--surface"] = vars["--profile-surface"];
  if (vars["--profile-surface-2"]) (style as Record<string, string>)["--surface-2"] = vars["--profile-surface-2"];
  if (vars["--profile-text"]) (style as Record<string, string>)["--foreground"] = vars["--profile-text"];
  if (vars["--profile-muted"]) (style as Record<string, string>)["--foreground-muted"] = vars["--profile-muted"];
  if (vars["--profile-border"]) (style as Record<string, string>)["--border"] = vars["--profile-border"];

  return (
    <div style={style}>
      {children}
    </div>
  );
}
