import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/**
 * Get the authenticated user from a request, or null.
 *
 * Returns null for:
 *   - Missing / malformed Authorization header
 *   - Invalid Firebase token
 *   - Email/password users whose email hasn't been verified yet
 *     (Google + Apple OAuth verify email server-side so they skip
 *     this check; only the password provider can produce unverified
 *     tokens via Firebase's email-verification flow)
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
    // For email/password sign-ins, refuse the request until the user
    // has verified their email. Client-side onAuthStateChanged already
    // gates UI but a determined caller could bypass with a direct API
    // hit before completing the email-link flow. Google + Apple
    // (and other OAuth providers) verify the email on their side, so
    // their tokens come with email_verified: true even without our
    // separate verification step.
    const signInProvider = decoded.firebase?.sign_in_provider;
    if (signInProvider === "password" && decoded.email_verified === false) {
      return null;
    }
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

/**
 * Get the authenticated user AND require admin privileges. Returns
 * null for any of the getAuthedUser failure modes OR for non-admin
 * accounts.
 *
 * Routes under app/api/admin/** should call this as the first thing
 * in their handler and short-circuit with a 403 if it returns null.
 * Standardizes the "admin gate" pattern that was previously copy-
 * pasted as a local `async function requireAdmin()` in ~10 admin
 * route files — typo-prone duplication. Existing routes that already
 * use `getAuthedUser` + manual `isAdmin` check are equivalent and
 * can migrate at leisure; both paths are correct.
 */
export async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return null;
  return user;
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
