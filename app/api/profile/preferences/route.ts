import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      include: { profile: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ profile: user.profile });
  } catch (err) {
    console.error("Profile preferences GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body },
      update: body,
    });

    // Mark onboarding as complete if not already
    if (!user.onboardedAt) {
      await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Profile preferences error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
