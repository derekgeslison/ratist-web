// Wrapper around the custom Capacitor LiveActivity plugin (iOS-only).
//
// Live Activities are iOS 16.1+ — Dynamic Island / Lock Screen ongoing
// tiles that show real-time state from the app while it's backgrounded.
// We use them for:
//   1. Screening Room — shows the movie + minutes-into-screening while
//      a session is active, so participants can leave the app and still
//      see how far in they are.
//   2. Live Review (Backstage Pass) — shows the rating-in-progress with
//      a "+1" tap target the user can hit from the lock screen to add
//      a timestamped note without unlocking.
//
// This module is a thin JS shim that calls into the native plugin when
// it's available and silently no-ops everywhere else (web browsers,
// Android, iOS without the plugin yet). That way the page-level code
// can call startScreeningRoomActivity() unconditionally without
// branching on platform — keeps the call sites readable.
//
// The native side is implemented in Swift inside the iOS app project.
// See mobile/IOS_NATIVE_FEATURES_HANDOFF.md for the Swift contract.

import { Capacitor } from "@capacitor/core";

export interface ScreeningRoomActivityInput {
  /** Unique session id — used as the activity correlation key. */
  sessionId: string;
  movieTitle: string;
  /** Optional poster URL; if omitted the Dynamic Island shows a generic icon. */
  posterUrl?: string;
  /** Unix ms when the screening started. The native side derives
   *  elapsed time from this; the activity self-updates without
   *  needing periodic update() calls. */
  startedAt: number;
}

export interface LiveReviewActivityInput {
  /** Unique session id for this in-progress rating. */
  sessionId: string;
  movieTitle: string;
  posterUrl?: string;
  startedAt: number;
}

export interface ActivityUpdateInput {
  /** Same sessionId passed to start(). */
  sessionId: string;
  /** Free-form fields the activity model accepts. Typed in Swift. */
  payload: Record<string, unknown>;
}

/** Defines the surface of the native plugin we're calling into. */
interface LiveActivityPlugin {
  startScreeningRoom(opts: ScreeningRoomActivityInput): Promise<{ ok: boolean }>;
  startLiveReview(opts: LiveReviewActivityInput): Promise<{ ok: boolean }>;
  update(opts: ActivityUpdateInput): Promise<{ ok: boolean }>;
  end(opts: { sessionId: string }): Promise<{ ok: boolean }>;
}

// Lazy-load the plugin only on iOS native — avoids hitting the
// Capacitor bridge on web where it would just resolve to the
// auto-generated web shim (which throws "not implemented").
async function getPlugin(): Promise<LiveActivityPlugin | null> {
  if (typeof window === "undefined") return null;
  if (!Capacitor.isNativePlatform()) return null;
  if (Capacitor.getPlatform() !== "ios") return null;
  try {
    // The plugin is registered native-side; we reach it via the
    // generic registerPlugin / Plugins map. Swift code returns
    // `{ ok: true }` from each method so callers can treat them
    // as best-effort.
    const { registerPlugin } = await import("@capacitor/core");
    return registerPlugin<LiveActivityPlugin>("LiveActivity");
  } catch {
    return null;
  }
}

export async function startScreeningRoomActivity(
  input: ScreeningRoomActivityInput,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.startScreeningRoom(input);
  } catch {
    // Activity-start can fail when the user has disabled Live
    // Activities in Settings, or when ActivityKit hits its
    // per-app activity cap. Non-critical — UI state is unaffected.
  }
}

export async function startLiveReviewActivity(
  input: LiveReviewActivityInput,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.startLiveReview(input);
  } catch {
    // Same: non-critical.
  }
}

export async function updateActivity(
  input: ActivityUpdateInput,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.update(input);
  } catch {
    // Updates that fail leave the previous activity state visible
    // — better than tearing it down.
  }
}

export async function endActivity(sessionId: string): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.end({ sessionId });
  } catch {
    // The system auto-ends activities after their staleness window
    // (~8 hours by default), so a failed end() isn't critical.
  }
}
