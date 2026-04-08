/** Profile theme system — presets + custom color support */

export interface ProfileTheme {
  preset?: string | null;
  accentColor?: string;
  surfaceColor?: string;
  surfaceColor2?: string;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
  headerImage?: string | null;
  headerPosition?: number; // vertical position 0-100 (default 50 = center)
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: Required<Omit<ProfileTheme, "preset" | "headerImage" | "headerPosition">>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    name: "Default",
    description: "The classic Ratist look",
    colors: {
      accentColor: "#cc1034",
      surfaceColor: "#1a1a1a",
      surfaceColor2: "#242424",
      textColor: "#f0f0f0",
      mutedColor: "#a0a0a0",
      borderColor: "#2e2e2e",
    },
  },
  {
    id: "noir",
    name: "Noir",
    description: "Black & white with a smoky edge",
    colors: {
      accentColor: "#d4d4d4",
      surfaceColor: "#0a0a0a",
      surfaceColor2: "#141414",
      textColor: "#e5e5e5",
      mutedColor: "#737373",
      borderColor: "#262626",
    },
  },
  {
    id: "golden-age",
    name: "Golden Age",
    description: "Warm tones from Hollywood's golden era",
    colors: {
      accentColor: "#d4a026",
      surfaceColor: "#1a1610",
      surfaceColor2: "#25201a",
      textColor: "#f5e6c8",
      mutedColor: "#a89070",
      borderColor: "#3a3020",
    },
  },
  {
    id: "neon",
    name: "Neon Nights",
    description: "Cyberpunk-inspired electric colors",
    colors: {
      accentColor: "#e040fb",
      surfaceColor: "#0d0d1a",
      surfaceColor2: "#161626",
      textColor: "#e8e0f0",
      mutedColor: "#8080a0",
      borderColor: "#2a2a40",
    },
  },
  {
    id: "ocean",
    name: "Deep Blue",
    description: "Cool ocean tones",
    colors: {
      accentColor: "#38bdf8",
      surfaceColor: "#0c1620",
      surfaceColor2: "#142030",
      textColor: "#e0f0f8",
      mutedColor: "#7090a8",
      borderColor: "#1e3040",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Earthy greens and warm wood tones",
    colors: {
      accentColor: "#4ade80",
      surfaceColor: "#0f1a10",
      surfaceColor2: "#1a2518",
      textColor: "#e0f0e0",
      mutedColor: "#70a070",
      borderColor: "#253525",
    },
  },
  {
    id: "horror",
    name: "Horror",
    description: "Blood red on pitch black",
    colors: {
      accentColor: "#dc2626",
      surfaceColor: "#080404",
      surfaceColor2: "#120808",
      textColor: "#f0d0d0",
      mutedColor: "#804040",
      borderColor: "#2a1515",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm gradients of orange and purple",
    colors: {
      accentColor: "#f97316",
      surfaceColor: "#1a100e",
      surfaceColor2: "#261818",
      textColor: "#f8e8e0",
      mutedColor: "#a07060",
      borderColor: "#382020",
    },
  },
  {
    id: "arctic",
    name: "Arctic",
    description: "Crisp whites and icy blues",
    colors: {
      accentColor: "#67e8f9",
      surfaceColor: "#101820",
      surfaceColor2: "#182028",
      textColor: "#e8f4f8",
      mutedColor: "#6898b0",
      borderColor: "#203040",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Soft purple with a gentle feel",
    colors: {
      accentColor: "#a78bfa",
      surfaceColor: "#14101e",
      surfaceColor2: "#1e182a",
      textColor: "#e8e0f8",
      mutedColor: "#8878a0",
      borderColor: "#2a2240",
    },
  },
];

/** Look up a preset by ID */
export function getPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

/** Resolve a user's profileTheme JSON into final CSS variable values */
export function resolveThemeVars(theme: ProfileTheme | null | undefined): Record<string, string> | null {
  if (!theme) return null;

  // If using a preset, start from its colors
  const preset = theme.preset ? getPreset(theme.preset) : null;
  const base = preset?.colors;

  // Custom colors override preset colors, which override defaults
  const accent = theme.accentColor || base?.accentColor;
  const surface = theme.surfaceColor || base?.surfaceColor;
  const surface2 = theme.surfaceColor2 || base?.surfaceColor2;
  const text = theme.textColor || base?.textColor;
  const muted = theme.mutedColor || base?.mutedColor;
  const border = theme.borderColor || base?.borderColor;

  // If nothing is customized, no theme to apply
  if (!accent && !surface && !text) return null;

  const vars: Record<string, string> = {};
  if (accent) {
    vars["--profile-accent"] = accent;
    // Generate a lighter hover variant
    vars["--profile-accent-hover"] = lightenHex(accent, 15);
  }
  if (surface) vars["--profile-surface"] = surface;
  if (surface2) vars["--profile-surface-2"] = surface2;
  if (text) vars["--profile-text"] = text;
  if (muted) vars["--profile-muted"] = muted;
  if (border) vars["--profile-border"] = border;

  return vars;
}

/** Lighten a hex color by a percentage */
function lightenHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(2.55 * percent));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
