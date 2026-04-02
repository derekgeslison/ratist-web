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
  // Pause system
  activePause: (id: string) => `screening-rooms/${id}/activePause`,
  pauseAccepted: (id: string) => `screening-rooms/${id}/activePause/accepted`,
  userPauseAccept: (id: string, userId: string) => `screening-rooms/${id}/activePause/accepted/${userId}`,
  pauseActive: (id: string) => `screening-rooms/${id}/pauseActive`,
  resumeReady: (id: string) => `screening-rooms/${id}/resumeReady`,
  userResumeReady: (id: string, userId: string) => `screening-rooms/${id}/resumeReady/${userId}`,
};

/** Play a notification sound using Web Audio API */
export function playDing(frequency = 880, duration = 0.15) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
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
