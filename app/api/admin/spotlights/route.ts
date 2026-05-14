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

// GET — list all spotlights (admin) or active+scheduled (public)
export async function GET(req: NextRequest) {
  const isAdmin = req.nextUrl.searchParams.get("admin") === "1";
  const placement = req.nextUrl.searchParams.get("placement");

  if (isAdmin) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const spotlights = await prisma.siteSpotlight.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json({ spotlights });
  }

  // Public — active + within schedule + optional placement filter.
  // Audience filtering is applied AFTER the DB query because the
  // signed-in / signed-out check needs the request's auth state and
  // the subscription / new-user gates need a Prisma lookup on the
  // viewer.
  const now = new Date();
  const where: Record<string, unknown> = {
    isActive: true,
    OR: [{ startDate: null }, { startDate: { lte: now } }],
    AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
  };
  if (placement) {
    where.placement = { in: [placement, "all"] };
  }

  // Optional viewer lookup. Anonymous callers fall through with a
  // null viewer; signed-in callers pass a Bearer token and we resolve
  // the dbUser for audience filtering.
  let viewer: {
    id: string;
    createdAt: Date;
    subscriptionTier: string | null;
    subscriptionStatus: string | null;
    subscriptionExpiry: Date | null;
  } | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      viewer = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: { id: true, createdAt: true, subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true },
      });
    } catch { /* anonymous fallback */ }
  }

  function hasActivePass(u: NonNullable<typeof viewer>): boolean {
    if (u.subscriptionStatus === "admin_granted") {
      return u.subscriptionExpiry == null || u.subscriptionExpiry.getTime() > Date.now();
    }
    if (u.subscriptionTier !== "backstage_pass") return false;
    return u.subscriptionStatus === "active" || u.subscriptionStatus === "past_due";
  }

  const NEW_USER_DAYS = 30;
  const newUserCutoff = new Date(Date.now() - NEW_USER_DAYS * 24 * 60 * 60 * 1000);

  const spotlights = await prisma.siteSpotlight.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  });

  const filtered = spotlights.filter((s) => {
    // Audience gate
    switch (s.audience) {
      case "signed_in":
        if (!viewer) return false;
        break;
      case "signed_out":
        if (viewer) return false;
        break;
      case "non_subscriber":
        if (!viewer || hasActivePass(viewer)) return false;
        break;
      case "new_user":
        if (!viewer || viewer.createdAt < newUserCutoff) return false;
        break;
      // "everyone" — no gate
    }
    // Policy banner cutoff: hide from users who signed up AFTER the
    // policy effective date (they already agreed to the latest copy).
    if (s.effectiveForUsersBefore && viewer && viewer.createdAt >= s.effectiveForUsersBefore) {
      return false;
    }
    return true;
  });

  return NextResponse.json({ spotlights: filtered });
}

// POST — create a spotlight
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, linkUrl, linkLabel, imageUrl, type, placement, style, bgColor, audience, startDate, endDate, effectiveForUsersBefore } = body;
  if (!title?.trim() || !linkUrl?.trim()) {
    return NextResponse.json({ error: "Title and link URL are required" }, { status: 400 });
  }

  const spotlight = await prisma.siteSpotlight.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      linkUrl: linkUrl.trim(),
      linkLabel: linkLabel?.trim() || "Read more",
      imageUrl: imageUrl?.trim() || null,
      type: type || "general",
      placement: placement || "homepage",
      style: style || "subtle",
      bgColor: bgColor?.trim() || null,
      audience: audience || "everyone",
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      effectiveForUsersBefore: effectiveForUsersBefore ? new Date(effectiveForUsersBefore) : null,
    },
  });

  return NextResponse.json({ spotlight });
}

// PATCH — update a spotlight
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof data.title === "string") update.title = data.title.trim();
  if (typeof data.description === "string") update.description = data.description.trim() || null;
  if (typeof data.linkUrl === "string") update.linkUrl = data.linkUrl.trim();
  if (typeof data.linkLabel === "string") update.linkLabel = data.linkLabel.trim() || "Read more";
  if (typeof data.imageUrl === "string") update.imageUrl = data.imageUrl.trim() || null;
  if (typeof data.type === "string") update.type = data.type;
  if (typeof data.placement === "string") update.placement = data.placement;
  if (typeof data.style === "string") update.style = data.style;
  if (typeof data.bgColor === "string") update.bgColor = data.bgColor.trim() || null;
  if (typeof data.audience === "string") update.audience = data.audience;
  if (data.startDate !== undefined) update.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) update.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.effectiveForUsersBefore !== undefined) update.effectiveForUsersBefore = data.effectiveForUsersBefore ? new Date(data.effectiveForUsersBefore) : null;
  if (typeof data.isActive === "boolean") update.isActive = data.isActive;
  if (typeof data.sortOrder === "number") update.sortOrder = data.sortOrder;

  const spotlight = await prisma.siteSpotlight.update({ where: { id }, data: update });
  return NextResponse.json({ spotlight });
}

// DELETE — remove a spotlight
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.siteSpotlight.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
