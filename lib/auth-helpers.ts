import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/** Get the authenticated user from a request, or null */
export async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch {
    return null;
  }
}

/** Check if a user can delete content: either they own it or they're admin */
export function canDelete(user: { id: string; isAdmin: boolean }, ownerId: string): boolean {
  return user.id === ownerId || user.isAdmin;
}
