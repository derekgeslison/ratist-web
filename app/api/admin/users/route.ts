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

const USER_SELECT = {
  id: true, firebaseUid: true, name: true, email: true, avatarUrl: true,
  isAdmin: true, isPrivate: true, createdAt: true,
  deletedAt: true, deletedBy: true,
  bannedAt: true, bannedUntil: true, banReason: true,
  _count: { select: { ratings: true, favoriteMovies: true } },
} as const;

// GET /api/admin/users?tab=active|deleted|blocked&search=...
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "active";
  const page = Number(searchParams.get("page") ?? "1");
  const perPage = 50;
  const search = searchParams.get("search") ?? "";

  const searchFilter = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] }
    : {};

  let where: Record<string, unknown>;

  if (tab === "deleted") {
    where = { ...searchFilter, deletedAt: { not: null } };
  } else if (tab === "blocked") {
    where = { ...searchFilter, bannedAt: { not: null }, deletedAt: null };
  } else {
    // Active: not deleted and not banned
    where = { ...searchFilter, deletedAt: null, bannedAt: null };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: tab === "deleted" ? { deletedAt: "desc" } : tab === "blocked" ? { bannedAt: "desc" } : { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, perPage });
}

// PATCH /api/admin/users — multiple actions
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { userId, action } = body;
  if (!userId || !action) return NextResponse.json({ error: "userId and action required" }, { status: 400 });

  // Prevent actions on self
  if (userId === admin.id && ["delete", "ban", "permanentDelete"].includes(action)) {
    return NextResponse.json({ error: "Cannot perform this action on yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firebaseUid: true, isAdmin: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  switch (action) {
    case "toggleAdmin": {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isAdmin: !target.isAdmin },
        select: { id: true, name: true, isAdmin: true },
      });
      return NextResponse.json({ user: updated });
    }

    case "softDelete": {
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), deletedBy: admin.id },
      });
      // Disable Firebase account so they can't use the app while deleted
      try { await adminAuth.updateUser(target.firebaseUid, { disabled: true }); } catch { /* ignore */ }
      return NextResponse.json({ ok: true });
    }

    case "restore": {
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: null, deletedBy: null },
      });
      // Re-enable Firebase account
      try { await adminAuth.updateUser(target.firebaseUid, { disabled: false }); } catch { /* ignore */ }
      return NextResponse.json({ ok: true });
    }

    case "permanentDelete": {
      // Delete from Firebase Auth
      try { await adminAuth.deleteUser(target.firebaseUid); } catch { /* ignore */ }
      // Delete from DB (cascade handles all related records)
      await prisma.user.delete({ where: { id: userId } });
      return NextResponse.json({ ok: true });
    }

    case "ban": {
      const { reason, expiresAt } = body;
      await prisma.user.update({
        where: { id: userId },
        data: {
          bannedAt: new Date(),
          bannedUntil: expiresAt ? new Date(expiresAt) : null,
          banReason: reason || null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    case "unban": {
      await prisma.user.update({
        where: { id: userId },
        data: { bannedAt: null, bannedUntil: null, banReason: null },
      });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

// DELETE kept for backwards compat but now just calls softDelete
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (userId === admin.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { firebaseUid: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), deletedBy: admin.id },
  });
  try { await adminAuth.updateUser(target.firebaseUid, { disabled: true }); } catch { /* ignore */ }

  return NextResponse.json({ ok: true });
}
