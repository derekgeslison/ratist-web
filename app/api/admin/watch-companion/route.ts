import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// List all companions (for admin panel)
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companions = await prisma.watchCompanion.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      tmdbId: true,
      mediaType: true,
      title: true,
      status: true,
      seasonsGenerated: true,
      lastGeneratedAt: true,
      publishedAt: true,
      updatedAt: true,
      _count: {
        select: {
          characters: true,
          relationships: true,
          timeline: true,
          glossary: true,
          suggestions: { where: { status: "pending" } },
        },
      },
    },
  });

  return NextResponse.json({ companions });
}
