/** Hard wall-clock cap on how long a screening room can stay
 *  active. After this elapses since startedAt, the session auto-
 *  flips to COMPLETE the next time anything touches it. Prevents
 *  forgotten rooms from leaving participants in the "you already
 *  have an active room" state indefinitely. */
export const SCREENING_MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Soft cap on the post-watch (rate-everyone) window. After this
 *  elapses since finishedAt, the session auto-flips to COMPLETE
 *  even if not every participant has submitted a review — keeps
 *  one flaky participant from blocking the rest of the room from
 *  starting a new session. */
export const POST_WATCH_MAX_DURATION_MS = 25 * 60 * 1000; // 25 minutes

/** Generate a 6-character uppercase invite code */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** RTDB path helpers */
export const rtdbPaths = {
  session: (id: string) => `screening-rooms/${id}`,
  state: (id: string) => `screening-rooms/${id}/state`,
  readyUp: (id: string) => `screening-rooms/${id}/readyUp`,
  userReady: (id: string, userId: string) => `screening-rooms/${id}/readyUp/${userId}`,
  chat: (id: string) => `screening-rooms/${id}/chat`,
  reactions: (id: string) => `screening-rooms/${id}/reactions`,
  pauseRequests: (id: string) => `screening-rooms/${id}/pauseRequests`,
  finishedWatching: (id: string) => `screening-rooms/${id}/finishedWatching`,
  userFinished: (id: string, userId: string) => `screening-rooms/${id}/finishedWatching/${userId}`,
  // Movie suggestions
  suggestions: (id: string) => `screening-rooms/${id}/suggestions`,
  suggestionsOpen: (id: string) => `screening-rooms/${id}/suggestionsOpen`,
  // Pause system
  activePause: (id: string) => `screening-rooms/${id}/activePause`,
  pauseAccepted: (id: string) => `screening-rooms/${id}/activePause/accepted`,
  userPauseAccept: (id: string, userId: string) => `screening-rooms/${id}/activePause/accepted/${userId}`,
  pauseActive: (id: string) => `screening-rooms/${id}/pauseActive`,
  resumeReady: (id: string) => `screening-rooms/${id}/resumeReady`,
  userResumeReady: (id: string, userId: string) => `screening-rooms/${id}/resumeReady/${userId}`,
  // Per-participant presence — lastSeenAt (ms) + chat-mute flag.
  // Drives the server-side push fan-out: participants whose heartbeat
  // is stale (> PRESENCE_STALE_MS) receive an FCM ping for chat /
  // polls / pause requests; in-room participants are skipped. The
  // muted flag suppresses chat pings only — polls + pause requests
  // ignore it (matches existing in-room behavior).
  presence: (id: string) => `screening-rooms/${id}/presence`,
  userPresence: (id: string, userId: string) => `screening-rooms/${id}/presence/${userId}`,
  // Per-recipient last-push timestamp (ms) — used to enforce the 30s
  // chat-ping rate limit on the server. Polls + pauses don't update
  // this and aren't gated by it.
  userLastChatPushAt: (id: string, userId: string) => `screening-rooms/${id}/lastChatPushAt/${userId}`,
};

/** How long a presence record stays "fresh" before the server treats
 *  the user as not-in-room and starts sending push notifications. The
 *  client writes a heartbeat every 10 seconds, so 30s gives ~3
 *  heartbeats of slack before a flaky connection earns a push. */
export const PRESENCE_STALE_MS = 30 * 1000;

/** Per-recipient throttle for chat pings. Polls + pauses bypass. */
export const CHAT_PUSH_THROTTLE_MS = 30 * 1000;

/** Shared AudioContext — created lazily on first user interaction */
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === "closed") {
      _audioCtx = new AudioContext();
    }
    if (_audioCtx.state === "suspended") {
      _audioCtx.resume();
    }
    return _audioCtx;
  } catch { return null; }
}

/** Warm up audio on first user interaction (call from any click handler) */
export function warmUpAudio() {
  getAudioCtx();
}

/** Play a notification sound using Web Audio API. The third argument
 *  is the peak gain (0–1). Default 0.7 — the previous 0.3 read as
 *  "barely audible" once the phone was face-down or in a pocket.
 *  Sine waves at lower frequencies sound disproportionately quieter
 *  than higher ones at the same gain, so callers using lower-pitch
 *  pings should also bump duration to compensate. */
export function playDing(frequency = 880, duration = 0.15, peakGain = 0.7) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(peakGain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* audio not available */ }
}

/** Play a countdown beep (lower pitch) */
export function playCountdownBeep() {
  playDing(660, 0.1);
}

/** Play a double ding for important events */
export function playDoubleDing() {
  playDing(880, 0.12);
  setTimeout(() => playDing(1100, 0.15), 150);
}

/** Chat message shape in RTDB */
export interface RTDBChatMessage {
  userId: string;
  userName: string;
  avatarUrl?: string;
  text: string;
  emoji?: string;
  timestamp: number; // Date.now()
}

/** Pause request shape in RTDB */
export interface RTDBPauseRequest {
  userId: string;
  userName: string;
  timestamp: number;
}

/** Session status type matching the Prisma enum */
export type SessionStatus = "LOBBY" | "COUNTDOWN" | "WATCHING" | "POST_WATCH" | "COMPLETE";
