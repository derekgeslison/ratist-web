import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/** Get the authenticated user from a request, or null.
 *  Returns null for soft-deleted users.
 *  For banned users, returns the user but sets isBanned flag. */
export async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return null;
    // Soft-deleted users cannot authenticate
    if (user.deletedAt) return null;
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
