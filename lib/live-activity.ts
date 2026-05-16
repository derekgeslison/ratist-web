// Wrapper around the custom Capacitor LiveActivity plugin.
//
// We use this for:
//   1. Screening Room — shows an ongoing notification (Android)
//      or Live Activity tile (iOS, Dynamic Island / Lock Screen)
//      while a session is active.
//   2. Live Review (Backstage Pass) — same surface during an
//      in-progress timestamped rating session.
//
// This module is a thin shim that calls into the native plugin
// when running inside the Capacitor app and silently no-ops
// everywhere else (web browsers). The native side is implemented
// in:
//   - Android: mobile/android/app/src/main/java/com/theratist/app/
//              liveactivity/LiveActivityPlugin.java
//   - iOS:     spec'd in mobile/IOS_NATIVE_FEATURES_HANDOFF.md
//              sections 2 + 3 (pending Mac-side implementation)

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ScreeningRoomActivityInput {
  sessionId: string;
  movieTitle: string;
  posterUrl?: string;
  /** Unix ms when the screening started. */
  startedAt: number;
}

export interface LiveReviewActivityInput {
  sessionId: string;
  movieTitle: string;
  posterUrl?: string;
  startedAt: number;
}

export interface ActivityUpdateInput {
  sessionId: string;
  payload: {
    /** Number of bookmarks / notes captured so far. */
    notesCount?: number;
    /** Wall-clock minutes elapsed, rounded down. */
    minutesElapsed?: number;
    /** Live Review pause flag. When true the native side stops the
     *  chronometer and freezes the timer line. */
    paused?: boolean;
    /** Wall-clock-correct elapsed in seconds (already accounting for
     *  paused time). The native side anchors its chronometer to
     *  `now - elapsedSeconds` so the running display matches the
     *  in-app timer even after a pause/resume cycle, and uses this
     *  value verbatim as the "Paused · MM:SS" content text. */
    elapsedSeconds?: number;
  } & Record<string, unknown>;
}

interface LiveActivityPlugin {
  startScreeningRoom(opts: ScreeningRoomActivityInput): Promise<{ ok: boolean }>;
  startLiveReview(opts: LiveReviewActivityInput): Promise<{ ok: boolean }>;
  update(opts: ActivityUpdateInput): Promise<{ ok: boolean }>;
  end(opts: { sessionId: string }): Promise<{ ok: boolean }>;
}

// IMPORTANT: registerPlugin MUST be at module level, NOT inside an
// async function. The proxy it returns intercepts EVERY property
// access — including `.then`. If you return the proxy from an
// `async function`, the runtime's Promise.resolve unwrapping path
// probes the resolved value's `.then` to check if it's thenable;
// that probe trips through the proxy and gets sent to native as
// a "then()" method call. Native doesn't implement `then`, so the
// app throws "LiveActivity.then() is not implemented on android"
// the moment any helper is awaited. Keeping the registration here
// at module scope sidesteps the whole probe.
const LiveActivity = registerPlugin<LiveActivityPlugin>("LiveActivity");

function shouldCall(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

export async function startScreeningRoomActivity(
  input: ScreeningRoomActivityInput,
): Promise<void> {
  if (!shouldCall()) return;
  try {
    console.log("[LiveActivity] startScreeningRoom →", input.sessionId);
    await LiveActivity.startScreeningRoom(input);
  } catch (err) {
    console.warn("[LiveActivity] startScreeningRoom failed:", err);
  }
}

export async function startLiveReviewActivity(
  input: LiveReviewActivityInput,
): Promise<void> {
  if (!shouldCall()) return;
  try {
    console.log("[LiveActivity] startLiveReview →", input.sessionId);
    await LiveActivity.startLiveReview(input);
  } catch (err) {
    console.warn("[LiveActivity] startLiveReview failed:", err);
  }
}

export async function updateActivity(
  input: ActivityUpdateInput,
): Promise<void> {
  if (!shouldCall()) return;
  try {
    await LiveActivity.update(input);
  } catch (err) {
    console.warn("[LiveActivity] update failed:", err);
  }
}

export async function endActivity(sessionId: string): Promise<void> {
  if (!shouldCall()) return;
  try {
    console.log("[LiveActivity] end →", sessionId);
    await LiveActivity.end({ sessionId });
  } catch (err) {
    console.warn("[LiveActivity] end failed:", err);
  }
}
