import { adminAuth } from "./firebase-admin";
import { prisma } from "./prisma";
import { headers } from "next/headers";

export async function getSessionUser() {
  try {
    const headersList = await headers();
    const authorization = headersList.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    const token = authorization.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    return user;
  } catch {
    return null;
  }
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
