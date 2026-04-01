import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

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
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");
  const perPage = 50;
  const search = searchParams.get("search") ?? "";

  const where = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        email: true,
        avatarUrl: true,
        isAdmin: true,
        isPrivate: true,
        createdAt: true,
        _count: { select: { ratings: true, favoriteMovies: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, perPage });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, isAdmin } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: !!isAdmin },
    select: { id: true, name: true, isAdmin: true },
  });

  return NextResponse.json({ user: updated });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Prevent self-deletion
  if (userId === admin.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { firebaseUid: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Delete from Firebase Auth first (non-fatal if missing)
  try {
    await adminAuth.deleteUser(target.firebaseUid);
  } catch { /* user may not exist in Firebase */ }

  // Delete from DB (cascade handles related records)
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
