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

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const validStatus = status === "approved" || status === "dismissed" || status === "pending" ? status : "pending";

  const suggestions = await prisma.companionSuggestion.findMany({
    where: { status: validStatus },
    orderBy: [{ createdAt: "desc" }],
    include: {
      submitter: { select: { id: true, name: true, avatarUrl: true } },
      companion: { select: { id: true, title: true, tmdbId: true, mediaType: true } },
    },
    take: 200,
  });

  return NextResponse.json({ suggestions });
}
