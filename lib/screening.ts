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
};

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
