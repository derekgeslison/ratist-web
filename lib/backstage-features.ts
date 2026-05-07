/**
 * Single source of truth for the Free vs. Backstage Pass feature
 * comparison list. Used by /backstage-pass (the sales page) and
 * /promo/first-1000 (the early-reviewer reward page) so a feature
 * launch / rate-limit change / wording tweak is a one-file change.
 *
 * Both pages walk this array and render rows in the same shape;
 * see each page for its own header columns + row chrome.
 */
import {
  Star,
  BarChart3,
  MonitorPlay,
  Palette,
  Shield,
  Sparkles,
} from "lucide-react";

export type IconComp = React.ComponentType<{ className?: string }>;

export interface FeatureRow {
  name: string;
  /** `true` → green check, `false` → grey X, string → rendered as a
   *  numeric/limit label (e.g. "2 / week"). */
  free: boolean | string;
  /** Same encoding as `free`. String values render as amber labels. */
  pass: boolean | string;
  /** When set, the row is clickable and links to a deep-dive feature
   *  page under /backstage-pass/[slug]. */
  href?: string;
  icon?: IconComp;
}

export const BACKSTAGE_FEATURES: FeatureRow[] = [
  { name: "Rate & review movies and TV shows", free: true, pass: true },
  { name: "Personal watchlists & rankings", free: true, pass: true },
  { name: "Community features (Hot Takes, Recast, Pitches, etc.)", free: true, pass: true },
  { name: "For You personalized recommendations", free: true, pass: true },
  { name: "Cine-Q daily trivia", free: true, pass: true },
  { name: "Cinephile tools (What Should I Watch?, Shared Cast & Crew, The Matchup, and more)", free: true, pass: true },
  { name: "Watch Companion (spoiler-safe reference guide as you watch)", free: true, pass: true },
  { name: "Create new Watch Companions", free: "2 / week", pass: "5 / week" },
  { name: "AI tools (movie search, recommendations, collections)", free: "10 / day", pass: "30 / day" },
  { name: "Join Screening Room sessions", free: true, pass: true },
  { name: "Host Screening Room sessions", free: false, pass: true, icon: MonitorPlay, href: "/backstage-pass/screening-room" },
  { name: "Movie Club", free: false, pass: true, icon: Star, href: "/backstage-pass/movie-club" },
  { name: "My Analytics (detailed viewing stats)", free: false, pass: true, icon: BarChart3, href: "/backstage-pass/analytics" },
  { name: "Collections (with personal match scores)", free: false, pass: true, icon: Sparkles, href: "/backstage-pass/collections" },
  { name: "Critics Mode (250+ reviews required)", free: false, pass: true, icon: Star, href: "/backstage-pass/critics-mode" },
  { name: "Live Review feature", free: false, pass: true, icon: Star, href: "/backstage-pass/critics-mode" },
  { name: "Custom profile themes & colors", free: false, pass: true, icon: Palette, href: "/backstage-pass/custom-themes" },
  { name: "Ad-free experience", free: false, pass: true, icon: Shield },
];
