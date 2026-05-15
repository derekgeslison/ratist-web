import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/**
 * Get the authenticated user from a request, or null.
 *
 * Returns null for:
 *   - Missing / malformed Authorization header
 *   - Invalid Firebase token
 *   - Soft-deleted users (User.deletedAt set)
 *   - Banned users with a still-active ban (User.bannedAt set, and
 *     either no bannedUntil or bannedUntil > now)
 *
 * Returning null is the right default for both reads and writes —
 * banned users SHOULD see the site as if they're signed out so they
 * can hit `/api/auth/sync` and discover the ban notice (which is the
 * one path that intentionally surfaces ban metadata). Without this
 * gate, a banned user holding a still-valid Firebase token (up to
 * 1h after the ban lands) could keep rating, commenting, following,
 * etc., until their token naturally expired.
 *
 * Auto-expired bans (bannedUntil in the past) are treated as no
 * ban — they fall through and return the user normally. The
 * /api/auth/sync route lazily clears the banned* fields when those
 * users next log in.
 */
export async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return null;
    // Soft-deleted users cannot authenticate
    if (user.deletedAt) return null;
    // Banned users (with a still-active ban) are also treated as
    // not-signed-in across every API route that uses this helper.
    if (isUserBanned(user)) return null;
    return user;
  } catch {
    return null;
  }
}

/** Check if a user is currently banned (respects expiry) */
export function isUserBanned(user: { bannedAt: Date | null; bannedUntil: Date | null }): boolean {
  if (!user.bannedAt) return false;
  if (user.bannedUntil && new Date(user.bannedUntil) < new Date()) return false; // ban expired
  return true;
}

/** Check if a user can delete content: either they own it or they're admin */
export function canDelete(user: { id: string; isAdmin: boolean }, ownerId: string): boolean {
  return user.id === ownerId || user.isAdmin;
}
